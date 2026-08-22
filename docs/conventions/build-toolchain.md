# Build Toolchain

What `next build` produces here, and the three constraints that follow from it.
All three surfaced while trying to build this tree with a Cloudflare adapter,
but none depends on that attempt: each holds today, on Vercel, and each binds
any tool that consumes this project's build output. Every claim below was
measured against `next@16.3.1`, and the adapter claims additionally against
`@opennextjs/cloudflare@1.20.2`.

## Turbopack Is the Only Bundler That Builds This Project

`npm run build` builds with Turbopack, the Next.js 16 default. The webpack path
is not an available fallback: `next build --webpack` fails on this project's
CSS Modules with `Selector ":where(:scope)" is not pure (pure selectors must
contain at least one local class or id)`, once for each module that scopes its
rules.

The cause is the `@scope` skeleton that [styling.md](./styling.md) governs.
Webpack's CSS Modules loader requires every selector to carry a local class or
id, and a scoped rule's `:where(:scope)` carries neither; Turbopack accepts it.
The bundler is therefore not an open choice — it follows from a styling
decision already taken, and reversing it would mean removing `@scope`
project-wide rather than adjusting a build flag.

A change MUST NOT introduce tooling that requires a webpack build — a bundle
analyzer, a plugin with no Turbopack equivalent, or a host adapter that shells
out to `next build --webpack`. Adopting one means reopening the styling
decision first, and finding that out at adoption time is expensive.

## The Proxy Runs on Node.js, and No Configuration Moves It

`src/proxy.ts` carries next-intl's locale negotiation. Under Next.js 16 it runs
on the Node.js runtime and only there: the framework rejects route segment
config in a Proxy file with `Route segment config is not allowed in Proxy
file … Proxy always runs on Node.js runtime`, and its documentation states the
`runtime` option is unavailable in Proxy files. No flag changes this.

That forecloses any host adapter requiring edge middleware. In the measured
case, `@opennextjs/cloudflare` exits its build with `Node.js middleware is not
currently supported`, and its maintainers closed the implementation pull
request unmerged rather than carry the feature.

So a change that adopts a host adapter MUST establish that the adapter accepts
Node.js-runtime middleware before anything else is planned around it. Two ways
out exist, and both change what `src/proxy.ts` is for: keeping the deprecated
`middleware.ts` filename, which Next.js 16 still compiles to edge middleware,
or dropping the file entirely, since next-intl documents a configuration that
needs no proxy at all. Either belongs to a change that decides it deliberately,
never to an adapter's setup steps. Whichever is chosen, the file stays under
`src/` for the reason [directory-structure.md](./directory-structure.md) gives.

## The Standalone Output Omits `instrumentation.ts`

`next build` writes `.next/server/instrumentation.js` but copies only its
`.nft.json` trace manifest into `.next/standalone/`. Anything assembling a
deployment from the standalone output therefore cannot find the Sentry server
instrumentation this project initializes in `instrumentation.ts`, and says so:
the Cloudflare adapter stops with `File server/instrumentation.js does not
exist`.

Supplying the named file by hand is worse than the fault it fixes. The chunks
that file imports are not traced into the standalone output either, so the
build then succeeds and every request fails at runtime with `ChunkLoadError:
Failed to load chunk … for chunk server/instrumentation.js`.

This is the constraint worth stating loudest, because its obvious remedy turns
a failing build into a passing build that serves nothing. A change adopting a
host that consumes `.next/standalone` MUST verify instrumentation against a
running deployment that has served a request, never against a build that
completed.

## An Alternative Host Must Answer All Three Before Anything Is Costed

Whether a host builds with Turbopack, accepts Node.js-runtime middleware, and
carries `instrumentation.ts` into what it deploys are the first three questions
to settle, ahead of pricing or ergonomics. Two of them mislead when they fail.
The middleware constraint names a remedy that costs more than it looks —
switching to edge middleware, which Next.js 16 offers only under the filename
it deprecated. The instrumentation one names a missing file, and supplying it
produces a build that passes and a deployment that does not run.
