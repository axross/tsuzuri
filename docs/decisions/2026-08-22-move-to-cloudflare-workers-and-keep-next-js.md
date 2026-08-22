---
status: accepted
---

# Move to Cloudflare Workers and keep Next.js

We decided to move hosting to Cloudflare Workers and to keep Next.js,
retained through `@opennextjs/cloudflare`. This supersedes the decision to
host on Vercel and split media transfer,
`2026-08-21-host-on-vercel-and-split-media-transfer.md`,
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
page view. At two million page views a month that is 8,000,000 requests and
480 KB of body per page view, or 960 GB. Vercel measures Fast Data
Transfer on "the full size of each HTTP request and response," headers and
URL included
([Manage CDN usage](https://vercel.com/docs/manage-cdn-usage), read
2026-08-22), so roughly 5% of protocol overhead brings the billable figure
to about 1,008 GB. The author side is unchanged by the
correction: 1,000 monthly active authors, roughly 4,000 save commits, and
roughly 12,000 image uploads.

Vercel's base-scale total of about $30 is roughly two thirds fixed cost and
one third traffic, and it is worth itemizing rather than rounding, because
one of its components has no included allowance at all. The $20 Pro platform
fee is most of it. Fast Data Transfer and Edge Requests contribute nothing:
1,008 GB sits inside the plan's included 1 TB and 8,000,000 requests inside
its included 10,000,000
([Vercel Pro plan](https://vercel.com/docs/plans/pro-plan), read
2026-08-22). **Fast Origin Transfer is the component that does not behave
that way.** It bills the bytes between the CDN and a Function, Blob, or the
Data Cache at $0.06 per GB from the first byte, with no Pro-plan allowance
([iad1 regional pricing](https://vercel.com/docs/pricing/regional-pricing/iad1),
read 2026-08-22), and it applies here because the storage decision this
record does not supersede puts the media cache behind the CDN in Vercel
Blob. On an assumed 90% CDN hit rate for media and 80% for the API — media
is content-addressed and therefore safely immutable, which is what makes the
higher figure defensible — the origin sees about 102 GB, or roughly $6 a
month. The remaining few dollars are Function invocations, Active CPU,
Provisioned Memory, and Blob operations. **Those hit-rate assumptions are
the softest input to this whole comparison**, and they move only the Vercel
side: Cloudflare bills no egress at any hit rate. Cloudflare's base-scale
total of about $9 is the $5 Workers
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
Worker request overage past its included 10,000,000
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
read 2026-08-22). Vercel's dominant line
items scale with bytes and requests; Cloudflare's mostly do not, because
Cloudflare's own pricing page states it plainly: **"There are no additional
charges for data transfer (egress) or throughput (bandwidth)."**
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
read 2026-08-22). That is not incidental to our design. The decision to serve media from our own cache
rather than GitHub's raw host,
`2026-08-21-serve-media-from-our-own-cache-rather-than-githubs-raw-host.md`,
requires every media byte to leave from this application's own origin, so
egress is not a cost we could shrink by delegating it elsewhere — it is a
structural cost of the architecture, and it is exactly the line item
Cloudflare does not bill. On Cloudflare the lever that controls cost
becomes request count rather than byte count, the inverse of what it is on
Vercel.

## What the decision actually rests on

Two things, neither of them cost:

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

A third ground was claimed while this was being written and does not hold, so
it is recorded here as rejected rather than quietly dropped. **Shedding a
vendor is not a reason to prefer Cloudflare.** Session and API-key state
currently look to Upstash Redis, and moving them into Cloudflare's own
primitives would end that fourth paid relationship — but issue #67 withdrew
the vendor latitude on 2026-08-22 independently of any platform question, and
under its constraint the Vercel-side candidates end it too. An encrypted
cookie, the Vercel Runtime Cache, and the linked repository all add no vendor.
Vendor count is therefore **neutral between the two platforms** once #67
applies; the comparison that made it look like a difference was measuring
Cloudflare against the superseded storage decision's four vendors rather than
against Vercel under #67's three. Working out which primitive holds that state
on either platform is issue #67's, below.

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
this project would have had to adopt
([Hono framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/),
read 2026-08-22). File-system routing exists only in HonoX, whose README
states it "is currently in the 'alpha stage'" with breaking changes
introduced within the same major version
([honox README](https://unpkg.com/honox@0.1.61/README.md), read
2026-08-22), at version 0.1.61 as read. The honest counterweight belongs here too: issue #11 will
record that this application is a headless CMS, and under that model
React Server Components, `generateMetadata`, and the SEO surface stop
mattering — which weakens the case for keeping Next.js at all. We took the
decision knowing that; it does not reverse the integration-cost reasons
Hono lost on, but a later reader revisiting this choice should know the
ground has already shifted under it.

## Obstacles the move introduces

These are real costs of the choice, not reasons to reverse it, and this
section is meant to double as the migration's own risk list.

**High, and this record was written without it.** Three build-toolchain
constraints govern any host adapter for this project, and
`docs/conventions/build-toolchain.md` states all three and closes by
saying they are "the first three questions to settle, ahead of pricing or
ergonomics." That document landed on `main` while this branch was open. The
honest reading is that this decision costed a platform before answering
them, which is the sequence that convention exists to prevent — we take the
decision anyway, and record that the ordering was wrong rather than
presenting it as deliberate.

What the three cost this migration, with the constraints themselves left to
the convention that owns them: `src/proxy.ts` makes the OpenNext build exit
non-zero, and the remedy is not a flag but a decision about what that file
is for — the convention names both ways out and states that either belongs
to a change deciding it deliberately. That the adapter will not simply grow
support for it is worth adding here, because it bears on whether waiting is
an option: OpenNext's maintainers closed the implementing pull request
unmerged. The standalone output omits this project's `instrumentation.ts`,
and the obvious remedy converts a failing build into a passing build and a
dead deployment, which makes it the constraint most likely to be discovered
late. And `@scope` forecloses the webpack path entirely, so an adapter that
shells out to `next build --webpack` is not adoptable at any price.

None of the three is a reason to reverse this decision, and none was known
to be resolved when it was taken. They are the work the migration begins
with.

**High.** Durable Objects and Preview URLs are mutually exclusive.
Cloudflare's documentation states plainly: "Preview URLs are not generated
for Workers that implement a Durable Object, including Containers and
Sandbox Workers"
([Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/),
read 2026-08-22). OpenNext's recommended incremental-cache configuration
binds a Durable Object for time-based revalidation, and moving that Durable
Object into a separate multi-worker setup does not recover Preview URLs
either — OpenNext's own multi-worker guide states that shape "cannot be
used with: Preview URLs (staging deployments)"
([Multi-worker](https://opennext.js.org/cloudflare/howtos/multi-worker),
read 2026-08-22). Preview URLs also carry no
logs at all: "You cannot view logs for Preview URLs today, this includes
Workers Logs, Wrangler tail and Logpush" (same page, read 2026-08-22).
Issue #70 is where the
per-pull-request preview pipeline gets rebuilt around this constraint.

**Medium.** The 128 MB per-isolate memory ceiling is per isolate, not per
invocation — "A single isolate can handle many concurrent requests" against
that same 128 MB
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
read 2026-08-22) — so a 100 MB request body cannot simply be buffered in
memory; media handling has to stream, and the practical ceiling for a
single in-memory operation sits closer to the Cloudflare Images binding's
20 MB input limit
([Images limits](https://developers.cloudflare.com/images/get-started/limits/),
read 2026-08-22) than to the 100 MB request-body cap.

**High.** Server-side image re-encoding has to be decided again from
nothing, and the decision it unmakes was accepted the same day as this one.
`2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md`
chose `sharp` 0.35.3 to WebP at a 2000px long edge, and states in its
opening that the re-encoding "has to run on a Vercel Function." `sharp`
cannot run on Workers at all: it requires a "Node-API v9 compatible
runtime," and its WASM variant states that "Use in single-threaded
environments is unsupported" while requiring "multi-threaded Wasm via
Workers" ([sharp installation](https://sharp.pixelplumbing.com/install/),
read 2026-08-22) — directly incompatible with Cloudflare's own statement
that "Threading is not possible in Workers. Each Worker runs in a single
thread, and the Web Worker API is not supported"
([WebAssembly runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/),
read 2026-08-22).

The memory figures are what make this the hardest obstacle rather than a
swap. That record measured peak resident set on a deployed preview: 227 MB
to 505 MB for `sharp`'s WebP runs, 779 MB at worst including AVIF, and
666 MB to 869 MB for `@cf-wasm/photon`, the highest any candidate reached.
Those are comfortable against a Vercel Function's 2 GB default. **A Worker
isolate gets 128 MB in total**, so the lowest peak that record measured for
any encoder on any input is already close to twice the entire Cloudflare
ceiling, and the ceiling is per isolate rather than per invocation
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
read 2026-08-22). No candidate it measured fits. `sharp`'s 46.74 MB
uncompressed bundle would also sit against Workers' 10 MB gzipped script
limit, from that same page, rather than against the 250 MB uncompressed one
the encoder record cites for Vercel. Cloudflare's own Images binding is the
obvious remaining path and takes input up to 20 MB
([Images limits](https://developers.cloudflare.com/images/get-started/limits/),
read 2026-08-22), but choosing it is issue #40's
decision, made under issue #67's vendor constraint, not this record's.

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

**Low.** Workers Free's 10 ms CPU-time ceiling per request
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
read 2026-08-22) is inadequate for server-side rendering, so Workers Paid is
a floor for this project rather than an optional upgrade.

## What this migration will invalidate

None of the following is false yet — Vercel remains the platform until the
migration is executed — so this record names what it will invalidate
without editing any of it:

- `2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md`,
  wholly. It was accepted on the same day as this record, and it opens by
  stating that the re-encoding "has to run on a Vercel Function." Its chosen
  encoder cannot run on Workers, and none of the four candidates it measured
  fits a Worker isolate — the obstacles section above carries the figures and
  their sources. Superseding it needs a fresh measurement against
  Cloudflare's own primitives rather than a rewrite of its reasoning, which
  is why this record does not supersede it here — see "What is left open."
- `docs/conventions/github-platform-limits.md`
  § "Stay Inside the Hosting Platform's Body Limit," which states Vercel's
  4.5 MB request-body cap and the chunking it requires.
- `README.md`'s tech-stack table, at least its Hosting row, and its Logging
  row too if issue #69 concludes against Pino.
- `docs/operations/preview-deployment.md`, whose whole pipeline is built
  around Vercel's per-pull-request preview mechanism.
- Issue #39, "Chunked media upload and server-side reassembly," becomes
  obsolete once the migration executes. Amending or closing it is not this
  record's work.

## What is left open

This record does not decide, and deliberately leaves to other work:

- **Session, API-key, and media-cache placement.** Issue #67 owns this, and
  its constraint has to be re-derived against Cloudflare's own primitives
  rather than Vercel's. This record does not supersede the decision to store
  session and API-key state in Redis and media in Vercel Blob,
  `2026-08-22-store-session-and-api-key-state-in-redis-and-media-in-vercel-blob.md`;
  a `superseded_by` field names exactly one replacement, and #67 is already
  assigned that one.
- **The image re-encoding method, again.** It was decided on 2026-08-22 by
  `2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md`
  and this decision unmakes that one, so the question reopens rather than
  merely staying open. Issue #40 owns it, under issue #67's constraint. This
  record supplies the evidence that rules `sharp` out on Workers; it does not
  choose what replaces it, and a replacement wants measurement on Cloudflare
  of the kind that record made on Vercel rather than a decision from
  documentation.
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
against a running system: every platform figure is drawn from vendor
documentation, cited with the date it was read. The encoder memory figures
the obstacles section leans on are the one exception, and they cut the other
way — they were measured, but on a Vercel preview deployment rather than on
Workers, so they establish what those encoders cost rather than what they
would cost on the platform this record moves to. That is enough to rule them
out against a 128 MB ceiling and not enough to size a replacement.
Cloudflare's own documentation says nothing, in either direction,
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
