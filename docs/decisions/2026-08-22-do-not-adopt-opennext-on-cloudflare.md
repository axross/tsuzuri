---
status: accepted
---

# Do not adopt OpenNext on Cloudflare Workers

Hosting on Vercel was settled in
`2026-08-21-host-on-vercel-and-split-media-transfer.md`. Cloudflare Workers
through `@opennextjs/cloudflare` came up afterwards as the obvious alternative
route, and the question it raised was not whether Cloudflare is a good platform
but whether *this* application, as it is built today, can actually go through
that adapter. Reading the vendors' documentation could not answer it: the
adapter, the framework, and the error tracker each document their own half, and
the failures live in the seams between them.

So the combination was built and deployed rather than reasoned about. We did not
adopt it. Three failures stop the build outright, and a fourth removes
server-side error reporting; none of them is visible until you try.

This is a decision about the present, not a permanent one. What would have to
change for the question to be worth reopening is stated at the end, because
re-running the whole exercise to rediscover the same four walls is the waste
this record exists to prevent.

## What was measured

`@opennextjs/cloudflare` 1.20.2, Next.js 16.3.1, `@sentry/nextjs` 10.70.0, on a
throwaway Worker with `nodejs_compat` and a compatibility date of `2025-08-16`
— the date Sentry's own guide requires, because that is when `https.request`,
which its transport needs, arrived in the Workers runtime.

### The proxy cannot be built at all

`src/proxy.ts` stops the adapter immediately: it refuses Node.js middleware and
directs the author to Edge middleware instead. Next.js 16 then refuses the
other side of that instruction — its Proxy convention always runs on the Node.js
runtime, and it rejects a route segment config in the file that would say
otherwise.

There is no configuration satisfying both. This is the blocker with no
workaround: the spike proceeded only by deleting the file, which drops locale
negotiation entirely. Any real migration has to answer this first, and the
answer is not a setting.

### Turbopack's standalone output omits the instrumentation hook

Turbopack — the default builder in Next.js 16 — emits the compiled
`instrumentation.js` and its trace file, but does not copy the compiled file
itself into the standalone tree. The adapter's file-tracing step then aborts
because the file it was told about does not exist. Removing `instrumentation.ts`
makes the build succeed, which is what identifies the cause and also what makes
it intolerable: that file is how Sentry is initialised on the server.

### Turbopack's externalised specifiers do not survive the adapter's bundler

Copying the missing file and its chunks in by hand gets past the previous
blocker and into the next one. Turbopack refers to externalised packages by a
name carrying a content hash, and the adapter's bundler cannot resolve those
names. Declaring the packages as server-external moves the failure onto a
different package rather than removing it.

Building with webpack instead clears both of these. That is a real escape hatch,
and it carries its own price: webpack's CSS Modules reject the scoping skeleton
this project's styling convention is built on, so two stylesheets had to be
rewritten before the build would complete. Adopting the webpack route therefore
means either changing that convention or maintaining an exception to it, and it
means standing on a builder the framework has made non-default.

### Server-side error reporting stops working

The framework's instrumentation hook is never called under the adapter. It is
not that it fails — it does not run, so `Sentry.init` never executes, no client
exists, and a deliberate server-side throw produces no event whatsoever. An
error tracker reporting nothing looks exactly like an application with no
errors, which is the failure mode worth stating plainly: this is silent.

Wrapping the adapter's generated Worker entrypoint in a custom entrypoint using
Sentry's Cloudflare SDK recovers most of it. Measured on a deployed Worker, the
exception, the console and fetch breadcrumbs, and the request context all come
back. The framework's own build-time route-handler instrumentation turns out to
have been present all along and merely to have had nowhere to report; supplying
a client at the Worker boundary is what activates it.

What does not come back is the stack trace. The adapter merges the server into
one bundle and emits no source map for it, so every frame lands at a coordinate
in that bundle. Uploading the map that Wrangler generates for the custom
entrypoint does not rescue this: the map's sources contain none of this
project's own files, because the deepest thing it can describe is the adapter's
already-bundled server blob. Sentry locates and applies that map and then
reports an invalid location for every frame — with and without debug-ID
injection, on a deployed Worker.

Client-side errors, by contrast, symbolicate correctly all the way to this
project's own source files and line numbers. The asymmetry is the point: the
half of the application where this project's risk actually concentrates is the
half that loses its stack traces.

## What was rejected

**Adopting anyway, on the webpack builder.** This clears two of the three build
blockers, and it was demonstrated to work end to end. It was rejected because it
does not clear the first one — the proxy still cannot be built — and because the
price is paid in two places that matter: the styling convention, and a
dependency on a builder the framework is moving away from. Trading a settled
convention for a platform move that does not yet work is the wrong order.

**Adopting and accepting the loss of server-side error reporting.** Rejected on
the strength of what this application does. Its failures concentrate on the
server: minting and expiring credentials, writing commits back, posting
comments, and running into the platform limits the API imposes. Losing sight of
exactly those, silently, is not a degraded version of error tracking.

**Adopting with the custom Worker entrypoint and accepting unsymbolicated
server traces.** This is the strongest of the three, since it recovers the
exception, the breadcrumbs and the request context, which is most of the
diagnostic value. It was still rejected, because it is only reachable *after*
the build blockers are solved, and the first of them has no solution. It is
recorded here because it is what a future adoption should reach for, not
because it was close.

**Deciding from the vendors' documentation instead of a deployment.** Rejected
before starting, and worth recording as rejected: no vendor page states which of
these interactions holds. Every one of the four findings above contradicts, or
simply is not addressed by, what the documentation implies.

## What this constrains

Cloudflare Workers via this adapter is not a deployment target for this
application. A change proposing it has to overturn this record rather than work
around it, and has to answer the proxy blocker specifically, since that is the
one the spike could not work around at all.

Nothing about how this project builds or deploys today changes. The Vercel
decision stands, unaffected; this record narrows the field of alternatives to it
rather than revisiting it.

The question becomes worth reopening when the adapter accepts Node.js middleware,
or the framework offers a proxy that can run on the Edge runtime — either would
dissolve the first blocker. Two further changes would each remove a cost rather
than a blocker: the adapter emitting a source map for its merged server bundle,
which is what stack traces resolving to this project's source depends on, and
the framework's standalone output carrying the compiled instrumentation hook,
which would remove the need for the webpack builder and with it the pressure on
the styling convention.

A re-evaluation should re-test those four points directly and not assume the
rest of this record still holds — every finding here is pinned to the versions
named above, and the seams between three independently moving projects are
exactly where behaviour changes without anyone announcing it.
