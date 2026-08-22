---
status: accepted
---

# Add no store for session, API-key, or media state

Three kinds of state this application cannot avoid holding — the session
record behind a login or a reader comment, the per-blog API keys issue #32
needs to be revocable, and the re-encoded media cache that stands between
readers and GitHub's raw host — were given homes earlier on 2026-08-22 in
`2026-08-22-store-session-and-api-key-state-in-redis-and-media-in-vercel-blob.md`:
a Redis store provisioned through the Vercel Marketplace, and a private
Vercel Blob store. That record priced a fourth external vendor and recorded
that no ceiling had been imposed on the number.

Later the same day the maintainer imposed one. This record re-derives all
three placements under it and supersedes the earlier one.

The answer it lands on is that **none of the three needs a store**. Session
state travels in an encrypted cookie, API-key verifiers are committed to the
linked repository, and media is served by a route handler this application
owns with nothing behind it but a cache and GitHub. No new external vendor
is added.

## Why this record names no platform in its decision

Hosting is being re-decided in parallel with this.
`2026-08-21-host-on-vercel-and-split-media-transfer.md` is accepted and
Vercel is what `README.md` states, while a separate open change would record
a move to Cloudflare Workers and supersede it. A record that assumed either
outcome would be wrong the moment the other landed, and
`2026-08-22-build-the-logger-on-the-platform-console-rather-than-on-pino.md`
already met this problem and solved it the right way: state the property the
decision actually needs, so the record does not depend on the merge order of
an unrelated one.

So the decision below is about **placement** — which authority owns each
kind of state, and what may stand in front of it. Placement is a property of
the architecture rather than of the host. The concrete primitive that
implements each placement is named per platform, in a table, and those
tables are the only part of this record a hosting change touches.

Two constraint lines were settled with the maintainer, and they are not the
same line:

- **On Vercel:** no new vendor, and no Vercel metered storage product.
  Vercel Blob and Vercel Global Config are excluded by the constraint rather
  than by their merits.
- **On Cloudflare Workers:** the platform's own storage products — Workers
  KV, R2, Durable Objects — are permitted.

The difference is real and worth naming rather than smoothing over, because
a reader will see it: Vercel Blob bills through the Vercel account in the
same way Workers KV bills through the Cloudflare account, so the two
products stand in the same relation to their host. This record takes both
lines as the maintainer set them rather than reconciling them.

What saves the asymmetry from mattering is that it changes no outcome. Every
Cloudflare storage product the wider line admits is rejected below on its
own documented behaviour — not on the constraint — so the placements are the
same whichever platform this project is hosted on, and the same whichever
line applies.

## What the maintainer settled, and what each answer reverses

| Settled now | What it reverses |
| --- | --- |
| No new vendor, and no Vercel metered storage product. | Issue #3's "no vendor ceiling is imposed up front." |
| On Cloudflare Workers, the platform's own storage products are permitted. | Nothing; the question did not exist when issue #3 ran. |
| A few seconds of API-key revocation delay is acceptable. | Issue #3's "per-key revocation with no tolerated window," which was the single premise that forced a store. |
| A key's last use is recorded at the granularity of a day, not a timestamp per request. | Issue #32's acceptance criteria, in two places — see the API-key section. |
| The session-token placement is recommended here and decided by the maintainer at this record's review. | Nothing; it is how issue #3 handled the vendor count too. |

A wider revocation window — a cache TTL's worth, tens of seconds — was
offered and not chosen. "Seconds" is therefore the ceiling this record
designs against, and each section states what the design does when it cannot
meet that.

The Vercel line is not new ground.
`docs/conventions/github-platform-limits.md` § "Do Not Use Git LFS" already
rules LFS out partly because its quotas "bill past 10 GiB, which contradicts
this project's premise of adding no paid storage layer." That premise was
written down before the superseded record was drafted, and that record
neither cited it nor reconciled with it.

## Whether per-key revocation still forces a store

The superseded record's central argument was that a stateless signed token
can prove a key was valid when issued but cannot express "revoked five
minutes ago", so a store is unavoidable the moment revocation is required.
The argument is sound and this record does not dispute it. What it turned on
was the width of the tolerated window, and that has moved.

With seconds allowed, the question stops being "store or no store" and
becomes "what is authoritative, and how fast does a change to it reach the
verifier." The linked repository is already authoritative for everything
else this application serves, it is reachable from a server-side handler on
either platform, it is writable through the commit path
`docs/conventions/github-platform-limits.md` already mandates, and a write
to it already fires the `push` webhook this project uses as its invalidation
signal. It is a store in every sense that matters here — it is just not a
*new* one.

GitHub's own guidance points the same way. Its repository-limits page tells
integrations to "store user-generated data in their own GitHub accounts
rather than centralizing it in your account" ([Repository
limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits),
read 2026-08-22). A blog's API keys are the blog owner's data, and the
account they belong in is the owner's.

So the superseded record's argument survives intact and stops being
decisive: revocation does need something the verifier consults, and this
application already has one.

## Whether a cache can carry media

Here the superseded record's reasoning also survives, and this record
reaches a different conclusion by asking a different question. That record
asked which primitive could be the *authoritative store* for media bytes,
found none, and concluded a real store was needed. But media has an
authoritative store already:
`2026-08-21-store-media-in-the-linked-repository-rather-than-in-object-storage.md`
put the bytes in the linked repository, and
`2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md`
settled that what lands there is already re-encoded and already small.
Nothing downstream of that has to be authoritative. It has to be a cache, in
front of an origin that exists.

A CDN in front of a route handler is exactly that, and the objection the
superseded record raised — that the CDN "needs an origin to serve on a miss;
it cannot be that origin itself" — is satisfied rather than violated when
the origin is a handler that reads GitHub.

Two of that record's findings still hold and are not re-litigated here:
Incremental Static Regeneration's cache does not carry across deployments,
and Vercel steers "Complete HTTP responses (images, fonts, etc.)" away from
the data cache and toward the CDN cache. Both are quoted with their sources
there, and that record stays readable.

## Session state: an encrypted cookie, and no server-side record

**Chosen, and this is the recommendation the maintainer decides at review.**
The session cookie carries the GitHub user access token itself, encrypted
with a key held only in server-side environment configuration, rather than
an opaque identifier pointing at a record this application stores. The
cookie keeps every attribute the existing conventions and
`2026-08-22-carry-the-reader-session-in-a-cross-site-cookie.md` already
require of it.

This placement needs no platform-specific primitive at all: a cookie is an
HTTP mechanism, and both candidate platforms run the same encryption in the
same handler.

Three properties of the surrounding design are what make it defensible
rather than merely cheap.

**The session's ceiling is already eight hours.** A GitHub App user access
token "expires after eight hours, and the refresh token expires after six
months" ([Refreshing user access
tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
read 2026-08-22). `docs/conventions/security.md` already forbids a session
cookie outliving the token behind it, so the cookie a browser holds is an
eight-hour credential whatever we do.

**The refresh token is scoped away from ordinary requests.** It is not
carried in the session cookie. It travels in a separate cookie whose `Path`
is the refresh endpoint alone, so the six-month credential is absent from
every API call and every page request, and only the eight-hour one crosses
the wire routinely.

**Revocation reaches the credential, not our pointer to it.** GitHub exposes
`DELETE /applications/{client_id}/token`, which revokes "a single token for
an OAuth application or a GitHub application with an OAuth authorization",
and `DELETE /applications/{client_id}/grant`, which deletes a grant and with
it "all OAuth tokens associated with the application for the user" ([OAuth
applications](https://docs.github.com/en/rest/apps/oauth-applications), read
2026-08-22). Signing out calls the first. That is a stronger revocation than
deleting a server-side session record, which leaves the underlying GitHub
token live and merely forgets our handle on it. Rotating the cookie
encryption key ends every session at once, which is the blunt lever a
compromise needs.

**Rejected candidates:**

- **A server-side record in the host's shared cache** — Vercel's Runtime
  Cache, or Cloudflare's Cache API. Rejected on both vendors' own
  documentation. Vercel lists what the Runtime Cache "is not a good fit for"
  and names "User-specific data that differs for each request" first, which
  is what a session record is; it is also "Regional: Each region has its own
  cache", so a session written where the user signed in is absent where
  their next request lands, and "Ephemeral", evicted least-recently-used
  when the cache fills ([Runtime
  Cache](https://vercel.com/docs/caching/runtime-cache), read 2026-08-22).
  Cloudflare's Cache API has the same locality problem in stronger terms —
  "the contents of the cache do not replicate outside of the originating
  data center" — and additionally never stores what a sign-in must set:
  "Responses with `Set-Cookie` headers are never cached"
  ([Cache](https://developers.cloudflare.com/workers/runtime-apis/cache/),
  read 2026-08-22).
- **A server-side record in Workers KV.** Permitted by the Cloudflare line
  and rejected on its documented consistency. KV "achieves high performance
  by being eventually-consistent", and "Changes may take up to 60 seconds or
  more to be visible in other global network locations as their cached
  versions of the data time out"; even locally, Cloudflare says immediate
  visibility "is not guaranteed and therefore it is not advised to rely on
  this behaviour", and negative lookups are cached too, "so the same delay
  exists noticing a value is created as when a value is changed" ([How KV
  works](https://developers.cloudflare.com/kv/concepts/how-kv-works/), read
  2026-08-22). A user who has just signed in reading as signed out for a
  minute is not a degraded session; it is a broken one. This is the
  candidate that would have preserved `docs/conventions/security.md`
  untouched, and it is rejected on the vendor's own words rather than on the
  constraint.
- **A server-side record in Durable Objects.** Permitted, strongly
  consistent — "durable, transactional, and strongly consistent" — and
  rejected on shape rather than on correctness. Each instance is
  "single-threaded and cooperatively multi-tasked" and is "automatically
  provisioned geographically close to where it is first requested" ([What
  are Durable
  Objects?](https://developers.cloudflare.com/durable-objects/what-are-durable-objects/),
  read 2026-08-22), so every request carrying a session would route to one
  pinned location, and a reader on the far side of the world would pay that
  trip on every call. It is also unambiguously a store, which is the thing
  this record exists to avoid adding; adopting it would need an argument
  stronger than "it would let a convention stay as written."
- **A session record in the linked repository.** Sessions are per-reader and
  per-author, not per-blog, so there is no repository that owns one; and a
  write per sign-in runs straight into the six-pushes-per-minute
  recommendation `docs/conventions/github-platform-limits.md` records.
  Rejected on its merits.
- **A Vercel Marketplace key-value store**, the superseded record's choice.
  **Excluded by the Vercel line**, not by its merits — it remains a good fit
  for the shape of the data. Recorded so the exclusion is legible: Upstash's
  own pricing page states a free tier of "256 MB" data, "500K" monthly
  commands and "10 GB" monthly bandwidth, and that "The database is deleted
  after 3 days unless you claim it into your account from the console link"
  ([Upstash Redis pricing](https://upstash.com/pricing/redis), read
  2026-08-22). Even had free-tier third parties been permitted, that
  deletion policy is a poor custodian for anything whose loss is not a
  rebuild.
- **Vercel Global Config.** Excluded by the Vercel line, and independently
  unsuitable: its "Maximum store size" is "1 MB" on every plan including
  Pro, and a write takes "Up to 10 seconds globally" to propagate, with the
  page warning to "avoid using Global Configs for frequently updated data or
  data that needs to be accessed immediately after updating" ([Global Config
  Limits and
  pricing](https://vercel.com/docs/global-config/global-config-limits), read
  2026-08-22). A store that grows with every login fits neither.

**Cost model.** No store, so no storage cost on either platform. The cookie
adds bytes to every request that carries it; on the reader path those
requests are cross-site and the cookie is sent with them, which is a
bandwidth cost rather than a billed product.

**Adds a vendor: no.**

**What is lost if it is lost: a rebuild, not data loss.** Losing the
encryption key ends every session; every signed-in user signs in again, and
because the authorization already exists on GitHub's side that redirect
frequently completes without another consent screen. GitHub remains the
source of truth for the identity and the repository access throughout.

**What is genuinely given up, stated plainly.** A server-side record keeps
the GitHub token on the server, where compromising the encryption key alone
would not expose it. Under this design the encrypted token is in the
browser, so a compromise of that key exposes every live token until each
expires — at most eight hours, and revocable in bulk by rotating the key,
but a real downgrade against the alternative rather than a free win. This is
the trade the maintainer is being asked to accept at review.

**What this contradicts, and what must be rewritten.**
`docs/conventions/security.md` § "Session Cookies Are This Application's,
Not GitHub's" states that "The session record — not the browser — holds the
GitHub token; the cookie carries an opaque identifier and nothing else."
This recommendation contradicts that sentence directly, and that section is
the one to be rewritten.
`2026-08-22-carry-the-reader-session-in-a-cross-site-cookie.md` is
contradicted in the same place: its step 8 has this application create "the
session record holding those tokens", and its lifetime section relies on the
refresh token extending a reader's session. Neither rewrite is performed
here; a decision is replaced by a new record rather than by editing the old
one, and `docs/conventions/documentation.md` puts the convention rewrite
with the change that implements this.

The rest of that record is untouched. Nothing here changes the cross-site
cookie attributes, the origin allowlist, the anti-forgery token, `state`, or
PKCE.

## API-key verification: a verifier committed to the linked repository

**Chosen.** Each issued key's verifier record — the SHA-256 of the key, the
name the author gave it, its scopes, and the date it was last used — is
committed to the linked repository under a reserved dot-path
(`.tsuzuri/api-keys.json`), through the same commit path
`docs/conventions/github-platform-limits.md` mandates for a text-only
change. Issuing appends an entry; revoking deletes one. The verifier fails
closed: a record it cannot find is an invalid key, never an unrestricted
one.

**The key itself is 256 bits of randomness, so the stored hash is plain
SHA-256 with no secret in it.** A slow key-derivation function protects
low-entropy secrets against guessing; there is nothing to guess here, and a
peppered hash would only add a secret whose loss silently invalidates every
key a blog ever issued. Keeping the hash self-contained is what lets the
repository remain sufficient on its own — an author can read their own key
list, and nothing outside their account is needed to verify against it.

**Reading it, and the width of the window.** A verifier list is read through
two cache tiers: a shared tier the platform provides, and an in-process tier
inside each isolate or Function instance. Revoking runs inside this
application's own handler, so it commits the deletion *and* invalidates the
shared entry in the same operation rather than waiting for the webhook — a
request served by the same location is rejected immediately.

**What bounds the delay elsewhere is both tiers' TTLs, not an
invalidation.** This is worth stating carefully, because the obvious
formulation is wrong: the in-process TTL alone bounds nothing, since an
instance whose entry expires re-reads the shared tier, which may still be
serving the pre-revocation list if the invalidation has not reached it. How
promptly an invalidation travels is platform-specific and, on both candidate
platforms, either unverified or documented as slow — so the design must not
rest on it. **Both tiers therefore carry short TTLs of their own, and the
worst case is their sum.** Invalidation on revoke makes the common case much
faster than that bound; it is not what the bound is made of. The `push`
webhook covers the other path, an author editing the file by hand, and the
same sum is the ceiling under it.

Keeping the bound short costs GitHub reads, and that is the trade to size
when issue #32 is implemented: the shared tier's TTL is what decides how
often a blog's verifier list is re-read, against the installation quota.

| | Vercel | Cloudflare Workers |
| --- | --- | --- |
| Shared cache tier | Runtime Cache, tagged per blog | Cache API, per data centre |
| Invalidation on revoke | tag expiry, local for certain; cross-region propagation unverified | local to one data centre; nothing propagates |
| Per-instance tier | in-process, short TTL | in-isolate, short TTL |
| Worst-case staleness | both TTLs summed, never the invalidation | the same |

Workers KV is the obvious shared tier on Cloudflare and is **not** used, for
the reason the session section gives: a revocation that takes "up to 60
seconds or more" to become visible elsewhere is outside the window the
maintainer set, and KV's cached negative lookups mean a re-issued key is
subject to the same delay.

**What happens when the signal is lost.** A `push` webhook that never
arrives leaves a hand-edited revocation in place only until the cached entry
expires. A GitHub outage leaves cached entries verifying until they expire
and then fails closed, so an outage degrades to rejecting keys rather than
to accepting revoked ones. Neither failure can widen the window past the
shorter tier's TTL.

**Last use, at the granularity settled with the maintainer.** A key records
the *date* it was last used, not a timestamp per request, and the write is
debounced so one commit per repository per day carries every key whose date
moved. That is what makes this placement possible at all: GitHub's
"recommended maximum limit is 6 pushes per minute per repository"
([Repository
limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits),
read 2026-08-22), and a per-request write would exceed it by orders of
magnitude. It still satisfies what issue #32 wanted the field for — telling
a live key from a forgotten one. **This is a change to issue #32's
acceptance criterion**, which asks that "Each key's last use is recorded and
shown" without qualifying the granularity.

It is the second of two. The maintainer's answer on the revocation window
reaches issue #32's wording just as directly: that issue asks that "Revoking
a key causes the next request bearing it to be rejected", and issue #3
recorded the no-tolerated-window premise as "what issue #32's 'revoke'
means". The design above rejects a revoked key within a bounded window
rather than on literally the next request, so that criterion is relaxed to
"rejected within the cache tiers' bounded window" by the same answer.
Amending either criterion belongs to the change that implements issue #32,
not here.

Those commits fire the `push` webhook this application listens to, so they
are subject to the rule in `docs/conventions/github-platform-limits.md` §
"Exclude Our Own Commits From the Webhook" like every other write this
application makes.

**What a public repository exposes.** For a blog backed by a public
repository, the verifier file is world-readable. The hashes are not a
credential risk — a preimage of SHA-256 over 256 bits of randomness is not
recoverable — but the key *names*, their *scopes*, and their last-use dates
are public, and Git keeps a revoked key's entry in history permanently. That
is the cost of putting the data in the author's own account rather than in a
store, and it is stated here rather than left for someone to discover. A
private-repository blog, which is the case issue #32 exists for, exposes
none of it.

**Rejected candidates:**

- **A stateless signed token with a separate revocation list.** Rejected for
  the reason the superseded record gave, which still holds: the revocation
  list is itself the thing the verifier must consult, so the design is this
  one with a signature scheme added on top. Its real benefit — verifying
  without a lookup, by tolerating a revocation delay — is one this design
  already takes, through the cache tiers, without the extra scheme.
- **The host's shared cache as the authoritative home.** Rejected on its
  merits, and emphatically: Vercel's Runtime Cache is documented as
  "Ephemeral", LRU-evicted when full, and Cloudflare's Cache API does not
  replicate outside one data centre. An evicted verifier is an issued key
  that stops working, and which scopes it carried would be recoverable from
  nowhere. Both are used above only as caches in front of an authoritative
  file.
- **Workers KV as the authoritative home.** Permitted by the Cloudflare line
  and rejected on the consistency figures quoted above. Its free-plan
  ceilings would also bind sooner than they look — "1,000 writes per day"
  across different keys, and "1 per second" writes to the same key ([Workers
  KV limits](https://developers.cloudflare.com/kv/platform/limits/), read
  2026-08-22) — though that is a secondary reason, not the one it is
  rejected on.
- **Vercel Global Config.** Excluded by the Vercel line, and independently
  unfit: its documented "Up to 10 seconds globally" write propagation is
  exactly the window a "revoke" action must not have, and its 1 MB ceiling
  is shared across every blog.
- **A Vercel Marketplace store.** Excluded by the Vercel line, as above.

**Cost model.** No store, so no storage cost. The reads and writes are
GitHub API calls against the installation's own quota, which "starts at
5,000 requests per hour" per `docs/conventions/github-platform-limits.md`,
and that quota is per installation, so a second blog owner brings their own
rather than consuming this one's.

**Adds a vendor: no.**

**What is lost if it is lost: a rebuild, and not this application's data to
lose.** This is the sharpest change from the superseded record, which called
API-key loss "data loss, not a rebuild" and concluded on that basis that the
project's no-persistence claim was broken. Under this placement the verifier
list lives in the source of truth itself. Losing every cache costs a
re-read. Losing the repository is the author losing their blog, which is a
condition this application has never claimed to survive.

**What this contradicts.** Nothing in `docs/conventions/security.md` §
"Session Cookies Are This Application's, Not GitHub's". But § "There Is No
Lockout Threshold Here, Deliberately" **is** invalidated, exactly as the
superseded record found, and for a reason no choice of storage changes: that
section closes by stating that "A change that introduces any credential this
application verifies itself invalidates this section and MUST replace it,"
and an API key is that credential. Its replacement has to decide whether key
verification is rate-limited and per what.
`2026-08-22-be-our-own-authorization-server-and-serve-mcp-statelessly.md`
records the same obligation for the MCP tokens it mints; one rewrite can
discharge both. Writing it is out of scope here.

## Media: a route handler of our own, and the platform's CDN behind it

**Chosen.** A request for media reaches a route handler on this
application's own origin. On a cache hit the CDN answers and no code runs.
On a miss the handler fetches the object from the linked repository through
the installation token and returns it with a long `Cache-Control`. Nothing
is stored anywhere.

Content addressing is what makes a long TTL correct rather than reckless.
`docs/conventions/github-platform-limits.md` already shards media by content
hash, so a media URL names its bytes: what a URL resolves to can never
change, and an immutable response can be cached for as long as the platform
allows. Vercel's maximum is "1 year" for `s-maxage`, `max-age`, and
`stale-while-revalidate` alike ([Vercel CDN
Cache](https://vercel.com/docs/caching/cdn-cache), read 2026-08-22).

The delivery rule this satisfies is
`docs/conventions/github-platform-limits.md` § "Never Link
`raw.githubusercontent.com`", which requires media to be delivered through
this application's own cache layer on its own origin. A route handler on our
own origin satisfies it by construction — worth noting, because the
superseded record had to reach for Vercel Blob's more expensive private mode
to satisfy the same rule against a Vercel-owned hostname.

| | Vercel | Cloudflare Workers |
| --- | --- | --- |
| Cache in front | CDN cache, via `Cache-Control` / `Vercel-CDN-Cache-Control` | the zone's CDN, with the Cache API available to the handler |
| Origin on a miss | the route handler, reading GitHub | the same |
| Store | none | none |

**Two consequences worth stating before anyone is surprised by them.**

The first is that Vercel will not cache a response to a request carrying an
`Authorization` header. Its cacheable-response criteria require that the
"Request doesn't contain `Authorization` header", and separately that the
"Response doesn't contain the `set-cookie` header" and does not "exceed
`10MB` in content length" (same citation). Public, keyless media — the
surface issue #37 covers — is cacheable and will be served from the CDN.
Media for a blog that requires a key on every request is **not**
CDN-cacheable while the key travels in `Authorization`, so those requests
reach the handler and GitHub every time. That is a real limit on the
private-repository case and it belongs in the design of the key-bearing
media path, not in a footnote. Whether Cloudflare draws the same line is
recorded as unverified below; what its Cache API documentation does state is
that "Responses with `Set-Cookie` headers are never cached"
([Cache](https://developers.cloudflare.com/workers/runtime-apis/cache/),
read 2026-08-22), so the media path must set no cookie on either platform.

The second is that a CDN is a cache and says so. Vercel's page is explicit:
"cache times are best-effort and not guaranteed. If an asset is requested
often, it is more likely to live the entire duration. If your asset is
rarely requested (e.g. once a day), it may be evicted from the regional
cache", and the cache is segmented by region ([Vercel CDN
Cache](https://vercel.com/docs/caching/cdn-cache), read 2026-08-22).
Cloudflare's Cache API is segmented more sharply still, not replicating
outside the originating data centre. A cold or evicted object costs one
GitHub read. This is compatible with § "Never Read GitHub Per Request" —
reads are proportional to cache misses, not to page views, and an immutable
long-lived entry makes a miss a rare event — but it is not the
webhook-driven zero that section describes, and the honest statement is that
media reads are miss-driven rather than edit-driven.

**Rejected candidates:**

- **A Vercel Blob store**, the superseded record's choice, in its private
  mode. **Excluded by the Vercel line.** Its own pricing page describes what
  the exclusion costs: within the Pro plan Blob usage draws on the "monthly
  credit allocation", and only past that is it on-demand ([Vercel Blob
  Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), read
  2026-08-22). It would have bought lower-latency misses and a store that
  never re-reads GitHub. It is excluded, not refuted.
- **Cloudflare R2.** Permitted by the Cloudflare line and rejected as
  unnecessary rather than unfit. It is the closest analogue to the Blob
  store above and would work; what it would add is a second copy of bytes
  the linked repository already holds, kept in sync by us, in exchange for
  turning a rare cache miss into a slightly cheaper one. Nothing in the
  media path asks for that, and the superseded record's own reasoning — that
  media's only real problem is delivery, not durability — argues against it.
- **The Vercel Runtime Cache as a second tier under the CDN.** Rejected on
  the vendor's own guidance: the Runtime Cache page names "Complete HTTP
  responses (use CDN cache instead)" among what it "is not a good fit for",
  and its item size caps at "2 MB" ([Runtime
  Cache](https://vercel.com/docs/caching/runtime-cache), read 2026-08-22).
  Our objects fit the cap comfortably; the guidance is the reason, and
  saying otherwise would overstate the case.
- **The ISR cache** and **the Next.js Data Cache**, both rejected in the
  superseded record on grounds this record does not disturb.

**Cost model.** No store, so no storage cost. Each miss costs one handler
invocation, one origin transfer, and one GitHub read; each hit costs one
edge request. All three are billed at whatever rates the hosting platform
charges, which the hosting decision — whichever one stands — already
accepted.

**Adds a vendor: no.**

**What is lost if it is lost: a rebuild, and a fast one.** There is nothing
to lose but cache entries. The bytes are in the linked repository, and the
next request re-fetches them.

## Total vendor count, and what is billed anyway

`README.md`'s tech-stack table names three external vendors: GitHub, the
hosting platform, and Sentry. **This decision adds none**, where the
superseded record added a fourth. That holds whichever hosting decision
stands, because the count is of vendors rather than of products, and every
primitive named above belongs to a vendor this project already has.

"No metered storage product" is not "no metered anything", and reading it
that way would be wrong. Every recommendation above consumes billed
resources: handler invocations and CPU, edge requests, origin transfer on a
cache miss, and — for the API-key verifier cache — the host's shared cache,
of which Vercel states plainly that "Usage of runtime cache is charged"
([Runtime Cache](https://vercel.com/docs/caching/runtime-cache), read
2026-08-22). What distinguishes these from the products the Vercel line
excludes is that they are the cost of running an application on a hosting
platform at all, rather than a separate store provisioned and billed as its
own thing.

## Two kinds of state this record does not place

Issue #3 scoped three kinds of state and this record keeps that scope. Two
more exist, and naming them here is cheaper than letting a later change
discover them.

The **pending authorization record** — the `state`, the PKCE verifier, and
the validated return URL that
`2026-08-22-carry-the-reader-session-in-a-cross-site-cookie.md` holds
server-side between its steps 2 and 8 — is short-lived and per-attempt. That
record calls holding it server-side "forced rather than chosen", on the
ground that GitHub's `redirect_uri` cannot carry parameters; a first-party
cookie set on this application's own origin during that top-level navigation
is a third possibility it did not weigh. Nothing here decides between them.

The **short-lived record of commit OIDs this application wrote**, which
`docs/conventions/github-platform-limits.md` § "Exclude Our Own Commits From
the Webhook" requires so a write does not re-trigger its own webhook, has no
home either. That section already argues it is cache-like and that losing it
"costs at most one redundant, idempotent cache refresh", which makes the
host's shared cache an obvious fit — but obvious is not decided, and it is
not decided here.

## Whether the no-persistence claim survives

It does, and this is the reconsideration's most consequential side effect.

`README.md`'s second paragraph and `AGENTS.md`'s Project Overview both state
that this application keeps no persistence layer of its own — that
everything outside the linked repository is derived and can be rebuilt from
it. The superseded record concluded both claims had to be qualified, because
it made this application the sole custodian of which API keys exist and what
each one was scoped to, and no amount of re-reading GitHub could rebuild
that.

Under this placement nothing is left outside the linked repository that
cannot be rebuilt from it. Media is a cache. Sessions are a redirect away
from being recreated. The API-key verifiers are *in* the linked repository,
which is where the claim already says the truth lives. **No carve-out is
owed, and neither `README.md` nor `AGENTS.md` needs a rewrite.**

One thing this application does hold is worth being precise about, so the
claim is not read as more absolute than it is: the encryption key behind the
session cookie. A key in environment configuration is not a persistence
layer, and this project already holds several — the companion app's private
key, and the MCP signing key
`2026-08-22-be-our-own-authorization-server-and-serve-mcp-statelessly.md`
introduced. This adds one more of the same kind. That is an interpretation
of `README.md`'s sentence rather than something the sentence settles, and it
is stated here so it can be contested rather than absorbed.

## What this invalidates

`docs/conventions/security.md` § "Session Cookies Are This Application's,
Not GitHub's" — invalidated by the session recommendation, if the maintainer
accepts it at review. Named here; the rewrite belongs to the change that
implements the session.

`docs/conventions/security.md` § "There Is No Lockout Threshold Here,
Deliberately" — invalidated by the API-key verifier, on that section's own
stated trigger, exactly as the superseded record found.

`2026-08-22-carry-the-reader-session-in-a-cross-site-cookie.md` — its step 8
and its account of the refresh token's role, on the same condition as the
security convention above. Its cross-site cookie attributes, origin
allowlist, anti-forgery token, `state`, and PKCE are untouched.

Two of issue #32's acceptance criteria, as the API-key section sets out.

`README.md` and `AGENTS.md` — **not** invalidated, reversing the superseded
record's finding.

No hosting record, in either direction. This record is written so that
neither the accepted Vercel decision nor a Cloudflare Workers decision
replacing it changes what is decided here.

## What was not measured, and what is unverified

No measurement was run, and none was intended: the plan this record was
written against replaced the superseded record's throwaway redeploy-survival
experiment with reading the vendors' own current documentation, and this
record does the same. Everything above is the vendors' documented behaviour
on 2026-08-22, not this project's measured behaviour, and a managed platform
can change an internal without any test here catching it.

Recorded as unverified rather than supplied from memory:

- **Whether expiring a Vercel Runtime Cache tag propagates across regions,
  and how quickly.** The page states each region has its own cache and that
  entries can be invalidated "by calling `expireTag`", but says nothing
  about cross-region propagation. The API-key revocation window depends on
  it, and it is the single figure most worth measuring before issue #32
  ships.
- **Whether Cloudflare declines to serve a cached response to a request
  carrying an `Authorization` header, as Vercel documents that it does.**
  The Cache API page does not address it. The key-bearing media path's cost
  on Cloudflare is unknown until it is settled.
- **Whether Durable Objects are available without a paid Workers plan.** The
  page read does not say. Nothing here depends on it, since Durable Objects
  are rejected on shape.
- **Vercel Global Config's Pro prices.** Deliberately not recorded. Two
  independent reads of that page during this change's review disagreed about
  what its pricing table states and whether it labels a unit at all, which
  suggests the table renders differently to different readers. Nothing here
  depends on the figure, since Global Config is excluded on its store size
  and its write propagation, so the disagreement was left unadjudicated
  rather than settled by picking one reading.
- **Whether the Blob included allowances the superseded record quoted are
  the Pro ones.** That record recorded the same gap; nothing here depends on
  it.
- **The Vercel Runtime Cache's storage limit.** The page states there is "a
  fixed storage limit" per cache and that eviction is least-recently-used,
  without giving the figure. How much verifier-cache pressure it takes to
  start evicting is therefore not known.