---
status: accepted
---

# Move to Cloudflare Workers and keep Next.js

We moved hosting to Cloudflare Workers and kept Next.js, retained through
`@opennextjs/cloudflare`. This supersedes
[the decision to host on Vercel and split media transfer](./2026-08-21-host-on-vercel-and-split-media-transfer.md),
which invited its own replacement on exactly this ground: "If the chunked
transfer proves more expensive to build or operate than the framework
convenience is worth, that is the trade this decision made, and a later
record should supersede it rather than the mechanism being patched around."

An investigation on 2026-08-22 read both vendors' current documentation and
compared this project's Vercel arrangement against Next.js on Cloudflare
Workers and against Hono on Cloudflare Workers. It recommended staying on
Vercel. The maintainer decided to migrate anyway, and this record has to say
that plainly rather than dress the decision up as something the numbers
compelled.

## The cost argument does not hold

At the traffic scale we settled on — two million page views a month on a
consumer's own site — the monthly difference between the two platforms is
roughly **$21**: about $30 on Vercel against about $9 on Cloudflare. That
is not a large enough gap to justify moving a working platform, and it is
not why we moved.

The traffic model behind those figures needed correcting before it was
trustworthy. The first pass assumed this application renders reader-facing
HTML and its own static assets — one HTML request plus three media requests
plus six static-asset requests per page view. Issue #11 will record that
this application is a headless CMS serving no reader-facing pages, so the
HTML and static-asset legs never come from this application at all; a
consumer's own site renders them. The corrected model is three media
requests at roughly 150 KB each plus one API request at roughly 30 KB per
page view. At two million page views a month that is about 8,000,000
requests and about 1,008 GB of egress, plus an author side unchanged by the
correction: 1,000 monthly active authors, roughly 4,000 save commits, and
roughly 12,000 image uploads.

Under that model, Vercel's base-scale total of about $30 is mostly its $20
Pro platform fee, since the corrected request count and egress both land
inside the plan's included allowances
([Vercel Pro plan](https://vercel.com/docs/plans/pro-plan), read
2026-08-22). Cloudflare's base-scale total of about $9 is the $5 Workers
Paid minimum plus roughly $3.50 for 12,000 Cloudflare Images
transformations plus roughly $0.60 of R2 storage
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/), all read
2026-08-22); the request and egress volume are free or inside Cloudflare's
included allowances too.

The gap widens at higher traffic, and this is the number that mattered more
than the base-scale one. At five times the settled traffic, Vercel's total
rises to roughly **$715 a month**, dominated by Fast Data Transfer past its
included 1 TB
([iad1 regional pricing](https://vercel.com/docs/pricing/regional-pricing/iad1),
read 2026-08-22). Cloudflare's rises to roughly **$18**, dominated by the
Worker request overage past its included 10,000,000. Vercel's dominant line
items scale with bytes and requests; Cloudflare's mostly do not, because
Cloudflare's own pricing page states it plainly: **"There are no additional
charges for data transfer (egress) or throughput (bandwidth)."** That is
not incidental to our design. [The decision to serve media from our own
cache rather than GitHub's raw host](./2026-08-21-serve-media-from-our-own-cache-rather-than-githubs-raw-host.md)
requires every media byte to leave from this application's own origin, so
egress is not a cost we could shrink by delegating it elsewhere — it is a
structural cost of the architecture, and it is exactly the line item
Cloudflare does not bill. On Cloudflare the lever that controls cost
becomes request count rather than byte count, the inverse of what it is on
Vercel.

## What the decision actually rests on

Three things, none of them cost:

**The chunked-media-transfer obligation disappears.** The superseded record
accepted "a genuine, non-trivial obligation" as the price of choosing
Vercel: media above Vercel Functions' 4.5 MB request-body cap has to be
split by the client, reassembled server-side, and committed as one blob,
in both directions. Issue #39 exists only to build that mechanism. Workers'
request-body cap depends on the Cloudflare account plan rather than the
Workers plan and is 100 MB on both the Free and Pro tiers
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
read 2026-08-22) — more than twenty times Vercel's ceiling, and comfortably
past any image this project re-encodes before committing it. The obligation
does not shrink; it goes away.

**Headroom.** The five-times comparison above is the shape of this
argument: roughly 3x at the settled scale, roughly 40x at five times it.
A traffic spike that would materially strain the Vercel budget barely moves
Cloudflare's.

**One fewer vendor.** Session and API-key state, which currently look to
Upstash Redis, can live in Cloudflare's own primitives instead of a fourth
paid relationship alongside GitHub, Vercel, and Upstash. Working out which
Cloudflare primitive is left to issue #67, below.

Two premises the comparison rested on were already out of date by the time
it ran, and the record should say so rather than let stale numbers stand
uncorrected. Issue #67 records that on 2026-08-22 the maintainer withdrew
the vendor latitude an earlier decision had granted — as few paid third
parties as possible, and no Vercel metered storage product — so Vercel Blob
and Upstash were already excluded before this comparison costed them; they
contributed under $2 a month to the totals above, so the totals stand, but
the storage half of the comparison belongs to #67 and not to this record.
Issue #67 also records that a few seconds of API-key revocation delay is
now acceptable, reversing an earlier "no tolerated window" constraint.
Workers KV still fails even that relaxed bar — Cloudflare's own
documentation says changes to a KV value "may take up to 60 seconds or
more to be visible in other global network locations" and that "this is
not guaranteed and therefore it is not advised to rely on this behaviour"
([How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/),
read 2026-08-22) — so the conclusion that KV cannot hold that state is
unchanged, even though the reasoning behind it is.

## What we rejected

**Staying on Vercel.** The superseded record's own reasoning was that the
Next.js and Vercel pairing is the stack this project's author works
fastest in, and that preview deployments, image handling, and the
framework's caching primitives arrive without integration work Workers
would otherwise demand. Those costs are real, not imagined — the obstacles
section below is largely the price of not having them for free — and a
reader weighing this decision should know the convenience Vercel offered
was real. We judged it outweighed by headroom at scale and by shedding a
vendor, once the cost gap itself turned out too small to decide the
question either way.

**Hono.** Hono was Cloudflare's own more natural framework fit, and we
looked at it anyway. It lost on integration cost specific to this project's
existing choices rather than on any capability Cloudflare denies it. This
project's headless component library, `@base-ui-components/react`, declares
peer dependencies on `react` and `react-dom`; `hono/jsx/dom` supplies
React-compatible hooks but is not React, so that library cannot run on it.
`jsxImportSource` is a single project-wide TypeScript setting, so serving
public output from `hono/jsx` while building the authoring interface in
React would mean maintaining two build environments in one project.
Cloudflare's own Hono framework guide points toward a Hono API Worker paired
with a separate React SPA — the vendor's own recommended shape is the split
this project would have had to adopt. File-system routing exists only in
HonoX, whose README states it "is currently in the 'alpha stage'" with
breaking changes introduced within the same major version, at version
0.1.61 as read. The honest counterweight belongs here too: issue #11 will
record that this application is a headless CMS, and under that model
React Server Components, `generateMetadata`, and the SEO surface stop
mattering — which weakens the case for keeping Next.js at all. We took the
decision knowing that; it does not reverse the integration-cost reasons
Hono lost on, but a later reader revisiting this choice should know the
ground has already shifted under it.

## Obstacles the move introduces

These are real costs of the choice, not reasons to reverse it, and this
section is meant to double as the migration's own risk list.

**High.** `src/proxy.ts` makes the OpenNext build fail outright. Next.js
documents that "Proxy defaults to using the Node.js runtime. The `runtime`
config option is not available in Proxy files. Setting the `runtime`
config option in Proxy will throw an error."
([Proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
read 2026-08-22). We confirmed this three ways rather than trusting the
documentation alone: the installed `next@16.3.1`'s build treats any
`proxy.ts` file as Node middleware regardless of its content; running
`npm run build` against this tree produced a
`functions-config-manifest.json` naming `/_middleware` with
`"runtime": "nodejs"`; and `@opennextjs/cloudflare@1.20.2`'s build script
detects that manifest entry, logs "Node.js middleware is not currently
supported. Consider switching to Edge Middleware," and exits non-zero. The
cheapest resolution is deleting `src/proxy.ts` — its body is
`createMiddleware(routing)` from next-intl, and `src/i18n/routing.ts`
currently declares a single locale, so it performs no negotiation today —
but choosing that resolution is migration work, not this record's.

**High.** Durable Objects and Preview URLs are mutually exclusive.
Cloudflare's documentation states plainly: "Preview URLs are not generated
for Workers that implement a Durable Object, including Containers and
Sandbox Workers"
([Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/),
read 2026-08-22). OpenNext's recommended incremental-cache configuration
binds a Durable Object for time-based revalidation, and moving that Durable
Object into a separate multi-worker setup does not recover Preview URLs
either — OpenNext's own multi-worker guide states that shape "cannot be
used with: Preview URLs (staging deployments)." Preview URLs also carry no
logs at all: "You cannot view logs for Preview URLs today, this includes
Workers Logs, Wrangler tail and Logpush." Issue #70 is where the
per-pull-request preview pipeline gets rebuilt around this constraint.

**Medium.** The 128 MB per-isolate memory ceiling is per isolate, not per
invocation — "A single isolate can handle many concurrent requests" against
that same 128 MB — so a 100 MB request body cannot simply be buffered in
memory; media handling has to stream, and the practical ceiling for a
single in-memory operation sits closer to the Cloudflare Images binding's
20 MB input limit than to the 100 MB request-body cap.

**Medium.** `sharp`, this project's current image re-encoder, cannot run
on Workers. It requires a "Node-API v9 compatible runtime," and its WASM
variant states that "Use in single-threaded environments is unsupported"
while requiring "multi-threaded Wasm via Workers"
([sharp installation](https://sharp.pixelplumbing.com/install/), read
2026-08-22) — directly incompatible with Cloudflare's own statement that
"Threading is not possible in Workers. Each Worker runs in a single
thread, and the Web Worker API is not supported"
([WebAssembly runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/),
read 2026-08-22). We benchmarked two WASM candidates on Node.js, not on
Workers, decoding a 4000×3000 JPEG: the `@jsquash` chain peaked around
630 MB of WASM linear memory and `@cf-wasm/photon` around 244 MB, both over
the 128 MB isolate ceiling; `@cf-wasm/photon` additionally exposes no
WebP quality argument and emits lossless output, 3.2 MB at 2000×1500,
which cannot meet this project's under-1 MB target regardless of memory.
Peak WASM memory is dominated by the decoder's own allocation and should
carry across runtimes, but this was not measured on Workers itself.
Choosing the replacement re-encoding path is issue #40's decision, made
under issue #67's vendor constraint, not this record's.

**Medium.** `next/image` needs an explicit Cloudflare Images binding or a
custom loader to do anything on Workers, and its `minimumCacheTTL` option
is not supported there
([OpenNext image how-to](https://opennext.js.org/cloudflare/howtos/image),
read 2026-08-22).

**Medium.** Whether Sentry source maps resolve through the OpenNext bundle
is unverified — issue #68. Whether Pino can serve as this project's logger
on Workers is unverified — issue #69. Both are open questions this record
leaves to those issues rather than answering here.

**Medium.** ISR needs bindings Vercel provided implicitly configured by
hand: OpenNext's recommended setup binds an R2 bucket for the incremental
cache, a Durable Object queue for time-based revalidation, and a D1 or
sharded-Durable-Object tag cache for `revalidateTag`, and a cache-population
step has to run as part of every deployment. Automatic cache purge needs a
Cloudflare zone and two additional secrets on top of that.

**Low.** `src/shared/lib/env.ts` currently parses `process.env` at module
scope, which does not hold on Workers, where configuration arrives per
request rather than once at boot.

**Low.** Workers Free's 10 ms CPU-time ceiling per request is inadequate
for server-side rendering, so Workers Paid is a floor for this project
rather than an optional upgrade.

## What this migration will invalidate

None of the following is false yet — Vercel remains the platform until the
migration is executed — so this record names what it will invalidate
without editing any of it:

- [`docs/conventions/github-platform-limits.md`](../conventions/github-platform-limits.md)
  § "Stay Inside the Hosting Platform's Body Limit," which states Vercel's
  4.5 MB request-body cap and the chunking it requires.
- `README.md`'s tech-stack table, at least its Hosting row, and its Logging
  row too if issue #69 concludes against Pino.
- [`docs/operations/preview-deployment.md`](../operations/preview-deployment.md),
  whose whole pipeline is built around Vercel's per-pull-request preview
  mechanism.
- Issue #39, "Chunked media upload and server-side reassembly," becomes
  obsolete once the migration executes. Amending or closing it is not this
  record's work.

## What is left open

This record does not decide, and deliberately leaves to other work:

- **Session, API-key, and media-cache placement.** Issue #67 owns this, and
  its constraint has to be re-derived against Cloudflare's own primitives
  rather than Vercel's. This record does not supersede
  [the decision to store session and API-key state in Redis and media in
  Vercel Blob](./2026-08-22-store-session-and-api-key-state-in-redis-and-media-in-vercel-blob.md);
  a `superseded_by` field names exactly one replacement, and #67 is already
  assigned that one.
- **The image re-encoding method.** Issue #40 owns this, under issue #67's
  constraint. This record supplies the evidence that rules `sharp` out; it
  does not choose what replaces it.
- **When the migration executes.** Issues #68 (Sentry source maps through
  the OpenNext bundle), #69 (whether Pino works on Workers), and #70 (a
  per-pull-request preview built around one Worker per pull request) are
  its preconditions. None of the three is a precondition of recording this
  decision, and a failure of any one of them changes how the migration is
  executed, not whether it happens: #68 failing means Sentry needs a
  different source-map path or degraded stack traces are accepted; #69
  failing means a logger swap; #70 failing means preview deployments regress
  until a Worker-based pipeline replaces it.

## What was not verified

No deployment was made to Cloudflare, and no figure above was measured
against a running system — every platform figure is drawn from vendor
documentation, cited with the date it was read, and every WASM memory
measurement in the obstacles section was taken on Node.js rather than on
Workers. Cloudflare's own documentation says nothing, in either direction,
about support for native Node addons; a workerd maintainer wrote in a
GitHub discussion on 2024-06-14 that "Node.js native add-ons are likely
never to be supported by workers," and an N-API support request has been
open since 2025-07-22
([workerd discussion #1905](https://github.com/cloudflare/workerd/discussions/1905),
[workerd issue #4587](https://github.com/cloudflare/workerd/issues/4587),
both read 2026-08-22) — that is a maintainer's statement and an open
request, not documented policy, and this record treats it as exactly that
rather than as a settled fact. Also unverified: whether Cloudflare Images
binding work counts against a Worker's own CPU time budget, whether the
Images binding requires a Cloudflare zone, whether a real HEIC photo from a
current phone actually converts through the Images binding rather than
merely being documented as an accepted input format, and how Upstash's
Marketplace listing meters usage relative to a direct Upstash account.
