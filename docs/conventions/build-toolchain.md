# Build Toolchain

What `next build` produces here, and the four constraints that follow from it.
The general practice — Next.js 16's own bundler default, the runtime a proxy
takes, what standalone output traces — is owned by the installed
`next-app-development` capability. This document states only this project's own
answers: which of those general rules this tree has already collided with, what
each collision cost, and what it forecloses. Every claim was measured against
`next@16.3.1`, and the adapter cases additionally against
`@opennextjs/cloudflare@1.20.2`, `@sentry/nextjs@10.70.0`, and
`@sentry/cloudflare@10.70.0`.

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

## This Project Has a Proxy, So the Node.js-Only Rule Binds It

The capability above owns the rule that a proxy runs on the Node.js runtime,
that this is not configurable, and that a project needing Edge has to stay on
the deprecated `middleware` convention. What matters here is that this project
is subject to it: `src/proxy.ts` carries next-intl's locale negotiation, so this
tree emits Node.js middleware on every build.

The measured consequence is that `@opennextjs/cloudflare` exits its build with
`Node.js middleware is not currently supported`, and its maintainers closed the
implementation pull request unmerged rather than carry the feature. So a change
that adopts a host adapter MUST establish that the adapter accepts Node.js
middleware before anything else is planned around it.

Two ways out exist, and both change what `src/proxy.ts` is for: renaming it to
the deprecated `middleware.ts`, or dropping the file entirely, since next-intl
documents a configuration needing no proxy and `src/i18n/routing.ts` declares a
single locale today. Either belongs to a change that decides it deliberately,
never to an adapter's setup steps. Whichever is chosen, the file stays under
`src/` for the reason [directory-structure.md](./directory-structure.md) gives.

## The Standalone Output Does Not Carry This Project's `instrumentation.ts`

The capability above states the general MUST: verify the traced dependency set
when using standalone output, because a dependency loaded dynamically may not be
traced. This project has already hit it, and the specific instance is worth
recording because the obvious remedy makes things worse rather than better.

`next build` writes `.next/server/instrumentation.js` — this project's Sentry
server initialization — but copies only its `.nft.json` trace manifest into
`.next/standalone/`. The Cloudflare adapter stops with `File
server/instrumentation.js does not exist`. Supplying the named file by hand
turns a failing build into a passing one and nothing more: the chunks that file
imports are not traced either, so every request then fails at runtime with
`ChunkLoadError: Failed to load chunk … for chunk server/instrumentation.js`.

Supplying those chunks by hand as well does not end it either. The build then
fails inside the adapter's own bundler, which cannot resolve the hash-suffixed
names Turbopack gives externalized packages: `Could not resolve
"require-in-the-middle-<hash>"`. Declaring the packages in
`serverExternalPackages` relocates that failure rather than removing it — the
next unresolvable name is `@sentry/nextjs-<hash>`. The remedy has no bottom:
each piece supplied by hand reveals the next one that was not traced.

A change adopting a host that consumes `.next/standalone` MUST verify
instrumentation against a running deployment that has served a request, never
against a build that completed.

## A Passing Deployment Does Not Mean Error Reporting Still Reports

The constraint above is about getting `instrumentation.ts` into what is
deployed. This one is about what happens once it is there: under
`@opennextjs/cloudflare` the file is deployed and never invoked. Next.js's
`register()` hook does not run, so `Sentry.init` never executes and no client
exists. A deliberate throw from a route handler on a deployed Worker produced no
event at all — confirmed against the Sentry project and against a local ingest
endpoint that captured nothing while accepting a hand-posted envelope.

This is the failure mode worth stating plainly, because it is the one nothing
announces: an error tracker reporting nothing is indistinguishable from an
application with no errors. Every other constraint in this document fails loudly
at build time. This one only fails when someone needs a stack trace and finds
the project has been blind for however long it has been deployed.

Wrapping the adapter's generated Worker entrypoint in a custom entrypoint that
uses `@sentry/cloudflare`'s `withSentry` recovers most of it. Measured on a
deployed Worker: the exception, the console and fetch breadcrumbs, and the
request context all arrive. The framework's own build-time route-handler
instrumentation turns out to have been in the bundle the whole time and merely
to have had nowhere to report; supplying a client at the Worker boundary
activates it.

What that does not recover is the stack trace. The adapter merges the server
into one bundle and emits no source map for it, so every frame lands at a
coordinate in that bundle. Uploading the map Wrangler generates for the custom
entrypoint does not rescue it: none of the map's sources are this project's
files, because the deepest thing it can describe is the adapter's
already-bundled server output. Sentry locates that map, applies it, and reports
an invalid location for every frame. Client-side errors, by contrast,
symbolicate all the way to this project's own files and line numbers — so the
half of the application carrying this project's risk is the half that loses its
traces.

A change adopting a host adapter MUST verify that a deliberate server-side
throw produces an event in the error tracker, on a deployed instance, before
treating error reporting as working. A build that succeeds, a deployment that
serves requests, and an `instrumentation.ts` present in the bundle together
establish none of it.

## An Alternative Host Must Answer All Four Before Anything Is Costed

Whether a host builds with Turbopack, accepts Node.js middleware, carries
`instrumentation.ts` into what it deploys, and still reports errors once it does
are the first four questions to settle, ahead of pricing or ergonomics. Two of
them mislead when they fail. The middleware constraint names a remedy that costs
more than it looks — switching to edge middleware, which Next.js 16 offers only
under the filename it deprecated. The instrumentation one names a missing file,
and supplying it produces a build that passes and a deployment that does not
run. The fourth is not a misleading failure but the absence of one: error
reporting does not fail at all, which is worse, because it is the only one of
the four a green build and a working deployment will not surface.
