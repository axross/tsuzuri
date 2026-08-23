# Build Toolchain

What `next build` produces here, the host it now builds for, and the three
constraints that followed from moving to that host. The general practice —
Next.js 16's own bundler default, the runtime a proxy or middleware file
takes, what standalone output traces — is owned by the installed
`next-app-development` capability. This document states only this project's
own answers: which of those general rules this tree has collided with, what
each collision cost, and what it now forecloses. Every claim was measured
against `next@16.3.1`, and the adapter cases additionally against
`@opennextjs/cloudflare@1.20.2`, `@sentry/nextjs@10.70.0`, and
`@sentry/cloudflare@10.70.0`.

## The Build: Turbopack, Then OpenNext

`next build` runs on Turbopack, Next.js 16's own default, unchanged by the
move to Cloudflare. `@opennextjs/cloudflare` then transforms the resulting
`.next/standalone` into `.open-next/`, which is what `wrangler.jsonc`
deploys. `npx opennextjs-cloudflare build` runs both steps; it is a workflow
step rather than an npm script, since a workflow is its only human-adjacent
caller — see [the `README.md` testing
section](../../README.md#testing) for what it and `deploy` do and where each
is invoked from. `open-next.config.ts`'s `buildCommand` names the exact `next
build` invocation to run, since no `build` script exists in `package.json`
for the adapter's own default (`` `${packager} run build` ``) to find.

One consequence of the adapter's shape reaches this project's own
`tsconfig.json`: the Worker's entrypoint, `worker.ts`, imports
`.open-next/worker.js`, which does not exist until the OpenNext step has run
— after `next build` has already type-checked. So `worker.ts` and
`.open-next` are excluded from `tsconfig.json`; a type-check that tried to
follow that import would fail against a build artifact that legitimately
does not exist yet. `worker.ts`'s own comments state this in more detail, and
[directory-structure.md](./directory-structure.md) states what kind of file
`worker.ts` is and why `wrangler.jsonc`'s `main` points at it rather than at
`.open-next/worker.js` directly.

## Webpack Is Not a Fallback Here, Because `@scope` Forecloses It

Turbopack is the Next.js 16 default, and the capability above owns that general
rule. What is this project's own is that the webpack path is not available even
as an escape hatch: `next build --webpack` fails on the CSS Modules with
`Selector ":where(:scope)" is not pure (pure selectors must contain at least one
local class or id)`, once for each module that scopes its rules. Webpack's CSS
Modules loader requires every selector to carry a local class or id, and a
scoped rule's `:where(:scope)` carries neither.

The bundler is therefore not an open choice here. It follows from the `@scope`
skeleton that [styling.md](./styling.md) governs, and reversing it would mean
removing `@scope` project-wide rather than adjusting a build flag. So a change
MUST NOT introduce tooling that requires a webpack build — a bundle analyzer, a
plugin with no Turbopack equivalent, or a host adapter that shells out to
`next build --webpack` — because adopting one reopens the styling decision, and
finding that out at adoption time is expensive.

## This Project Has No Proxy Today, and That Is Why

The capability above owns the general rule: a proxy runs on the Node.js
runtime, that is not configurable, and a project needing Edge has to stay on
the deprecated `middleware` convention instead. This project used to be
subject to it — `src/proxy.ts` carried next-intl's locale negotiation, so
this tree emitted Node.js middleware on every build — and the measured
consequence was that `@opennextjs/cloudflare` exited its build with
`Node.js middleware is not currently supported`, with the adapter's
maintainers having closed the implementation pull request that would have
carried the feature, unmerged.

The move to Cloudflare cleared that constraint by deletion rather than by
configuration: `src/proxy.ts` is gone, and next-intl is configured for its
no-proxy, no-middleware, single-locale setup instead (see
[directory-structure.md](./directory-structure.md) for where its
configuration now lives). No proxy or middleware file exists anywhere in this
tree today, so the Node.js-middleware check has nothing to reject.

**The rule still binds this project, latently.** Nothing about Cloudflare or
`@opennextjs/cloudflare` changed the underlying fact that a proxy — or the
deprecated `middleware.ts` a project needing Edge has to fall back to — runs
on the Node.js runtime and is not configurable. A future change that
reintroduces a proxy file, or that adds a `middleware.ts`, reopens this
constraint against this host exactly as it stood before this section was
rewritten, and MUST establish that the adapter in use at the time accepts
what it emits before anything else is planned around it.

## `instrumentation.ts` Is Gone; the Standalone Output Never Carried It

The capability above states the general MUST: verify the traced dependency
set when using standalone output, because a dependency loaded dynamically may
not be traced. This project hit that directly, on `instrumentation.ts`, which
no longer exists — deleted rather than patched, and the measurements behind
that choice are worth keeping even though the file is gone, because the
obvious remedy would have made things worse rather than better.

`next build` wrote `.next/server/instrumentation.js` — this project's Sentry
server initialization, before this move — but copied only its `.nft.json`
trace manifest into `.next/standalone/`, not the file itself. The Cloudflare
adapter stopped with `File server/instrumentation.js does not exist`.
Supplying the named file by hand turned that failing build into a passing
one and nothing more: the chunks that file imports were not traced either,
so every request then failed at runtime with `ChunkLoadError: Failed to load
chunk … for chunk server/instrumentation.js`. A change adopting a host that
consumes `.next/standalone` MUST verify instrumentation against a running
deployment that has served a request, never against a build that completed —
this is exactly the case that distinction was written for.

Supplying those chunks by hand did not end it either, and is worth recording
even though `instrumentation.ts` is gone: the build then failed inside the
adapter's own bundler, unable to resolve the hash-suffixed names Turbopack
gives externalized packages — `Could not resolve
"require-in-the-middle-<hash>"` — and declaring the package in
`serverExternalPackages` only relocated the failure to the next unresolvable
name, `@sentry/nextjs-<hash>`. The remedy had no bottom: each piece supplied
by hand revealed the next one that was not traced.

A second measurement made the file not worth saving even if the build had
tolerated it: `instrumentation.ts`'s `register()` hook is **never called
under OpenNext at all** — measured on a deployed Worker as `registerCalls: 0`,
with `Sentry.getClient()` undefined and no envelope produced by a deliberate
throw, confirmed against the Sentry project and against a local ingest
endpoint that captured nothing while accepting a hand-posted envelope. This is
the failure mode worth stating plainly, because it is the one nothing
announces: an error tracker reporting nothing is indistinguishable from an
application with no errors. Every other failure in this section fails loudly,
at build time; this one would only have surfaced when someone needed a stack
trace and found the project had been blind for however long it had been
deployed. Keeping the file would not have restored server-side Sentry capture
regardless of whether `copyTracedFiles` accepted it.

Server-side capture now comes from the Worker entrypoint instead: `worker.ts`
wraps the OpenNext handler in `@sentry/cloudflare`'s `withSentry`, configured
from the Worker's own `env` at the fetch boundary, rather than from a
Next.js-level hook that this build path never runs. Measured on a deployed
Worker, this recovers the exception, the console and fetch breadcrumbs, and
the request context; the framework's own build-time route-handler
instrumentation — `@sentry/nextjs`'s `withSentryConfig` in `next.config.ts` —
turns out to have been in the bundle the whole time and merely to have had
nowhere to report, so wiring a client in at the Worker boundary is what
activates it. See `worker.ts`'s own comments for what that restores and how,
and
[docs/operations/production-deployment.md](../operations/production-deployment.md)
for how its `SENTRY_DSN` is set.

What `withSentry` does not recover is the stack trace. The adapter merges the
server into one bundle and emits no source map for it, so every server-side
frame lands at a coordinate in that bundle rather than in this project's own
files. Uploading the source map Wrangler generates for `worker.ts` itself
does not rescue it: none of that map's sources are this project's files,
because the deepest thing it can describe is the adapter's already-bundled
server output — Sentry locates the map, applies it, and reports an invalid
location for every frame regardless. Client-side errors, captured through
`instrumentation-client.ts`, symbolicate all the way to this project's own
files and line numbers, so the half of the application carrying this
project's own risk is the half whose traces are unusable today.

A change adopting or replacing a host adapter MUST verify that a deliberate
server-side throw produces an event in the error tracker, on a deployed
instance, before treating error reporting as working. A build that succeeds,
a deployment that serves requests, and error-reporting code present in the
bundle together establish none of it — that is exactly the gap `register()`'s
silence left here, and the one a future host change cannot assume away.

## What the Turbopack-and-OpenNext Build Confirmed

The three questions above — does the host build with Turbopack, does it
accept what a proxy or middleware file emits, and does its standalone output
carry `instrumentation.ts` all the way to an error tracker that still reports
— were, until this move, open questions about a host not yet chosen. A host
has now been chosen and all three answered: the `@scope` constraint
forecloses webpack regardless of host, so it was never in question; no proxy
or middleware file exists, so nothing is left to reject; and
`instrumentation.ts` is deleted, with server capture rebuilt at the Worker
entrypoint instead — recovering events and breadcrumbs, though not stack
traces.

What is still worth keeping, for whichever constraint a future change
reopens — a proxy reintroduced, a middleware file added, a build-time hook
this host's adapter does not carry into what it deploys — is the method the
third constraint's own measurements found the hard way: verify against a
**deployed** instance that has served a request, not against a build or a
type-check that merely completed. The other two constraints here fail loudly
at build time and announce themselves; `instrumentation.ts` did not. A build
that passed only because a missing file had been patched by hand still broke
every request at runtime, and a build that passed in full still left
`register()` uncalled and the error tracker silent — the one failure among
these three that a green build and a serving deployment will not surface on
their own.
