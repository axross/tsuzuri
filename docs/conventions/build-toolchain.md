# Build Toolchain

What `next build` produces here, and the three constraints that follow from it.
The general practice — Next.js 16's own bundler default, the runtime a proxy
takes, what standalone output traces — is owned by the installed
`next-app-development` capability. This document states only this project's own
answers: which of those general rules this tree has already collided with, what
each collision cost, and what it forecloses. Every claim was measured against
`next@16.3.1`, and the adapter cases additionally against
`@opennextjs/cloudflare@1.20.2`.

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

A change adopting a host that consumes `.next/standalone` MUST verify
instrumentation against a running deployment that has served a request, never
against a build that completed.

## An Alternative Host Must Answer All Three Before Anything Is Costed

Whether a host builds with Turbopack, accepts Node.js middleware, and carries
`instrumentation.ts` into what it deploys are the first three questions to
settle, ahead of pricing or ergonomics. Two of them mislead when they fail. The
middleware constraint names a remedy that costs more than it looks — switching
to edge middleware, which Next.js 16 offers only under the filename it
deprecated. The instrumentation one names a missing file, and supplying it
produces a build that passes and a deployment that does not run.
