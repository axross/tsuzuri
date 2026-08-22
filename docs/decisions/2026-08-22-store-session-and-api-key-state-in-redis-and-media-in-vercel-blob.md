---
status: accepted
---

# Store session and API-key state in Redis and media in Vercel Blob

This application holds three kinds of state that do not fit the no-persistence
premise `AGENTS.md` states in its Project Overview section and `README.md`
states in its opening paragraph: the session record behind a login or a
reader comment, the per-blog API keys issue #32 needs to be revocable, and
the re-encoded media cache that stands between readers and GitHub's raw
host. None of the three had a home. We picked one for each from Vercel's and Next.js's own current
documentation, read on 2026-08-22, rather than from memory or from the
research memo the project started from.

Two constraints, settled with the maintainer on 2026-08-22, drove the choice:
per-key API-key revocation is a requirement — one leaked key must be stoppable
without rotating a blog's other keys — and no ceiling was imposed on the
number of vendors the answer adds. A third constraint we imposed on ourselves:
the plan's throwaway measurement of whether a cache survives a redeployment
was not run, because Vercel's own documentation answers that question
directly and we would rather cite a primary source than reproduce it with a
disposable script.

The post index is out of scope; issue #12 owns it. We deliberately did not
rely on the prior decision issue #12 supersedes on that topic, nor on the
separate prior decision this milestone supersedes over repository
visibility.

## Whether Next.js's caching primitives survive a deployment

This decided whether the media cache could live in a caching primitive at all,
so we checked it first, against three separate mechanisms Vercel documents
under "Caching on Vercel."

**Incremental Static Regeneration does not.** Vercel's own ISR page states
that "each new deployment uses its own ISR cache and does not reuse the cache
from a previous deployment"; the previous deployment's cache is kept only so a
rollback can serve it, not so the new deployment can read it
([Incremental Static Regeneration](https://vercel.com/docs/incremental-static-regeneration),
read 2026-08-22).

**The Next.js Data Cache does, on Vercel specifically** — but it is the wrong
shape for media regardless. Vercel's Data Cache page states plainly that
cached data is "Persistent across deployments: Cached data persists across
deployments unless you explicitly invalidate it," and separately states in
its own comparison table that "Complete HTTP responses (images, fonts, etc.)"
belong in the CDN cache, not here
([Data Cache for Next.js](https://vercel.com/docs/caching/runtime-cache/data-cache),
read 2026-08-22). Even setting that guidance aside, the store itself would not
fit our media: every item caps at 2 MB, and on both Hobby and Pro "all
projects in your team share a single cache" under one LRU eviction policy — a
media-heavy workload from any project on the team could evict another
project's entries, this project's included.

**The CDN cache is not a store at all.** It caches complete HTTP responses at
the edge with a "best-effort and not guaranteed" TTL — "If your asset is
rarely requested (e.g. once a day), it may be evicted from the regional cache"
— and it caps a cached response at 10 MB for non-streaming functions
([Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache), read
2026-08-22). It needs an origin to serve on a miss; it cannot be that origin
itself.

**The deployment-persistence guarantee is Vercel's, not the framework's.**
Next.js's own self-hosting guide is explicit that outside Vercel, "this cache
is stored on the local filesystem (on disk) of each Next.js server instance"
by default, and that durable, cross-instance, cross-deployment persistence
requires a hand-written cache handler backed by "durable storage" the author
supplies — Redis or S3 are the examples the guide itself gives
([How to self-host your Next.js application](https://nextjs.org/docs/app/guides/self-hosting),
read 2026-08-22). This project is already committed to Vercel hosting, per
`2026-08-21-host-on-vercel-and-split-media-transfer.md`,
so Vercel's managed behavior is what we rely on — but it is a hosting-platform
guarantee layered on top of the framework, not something Next.js promises on
its own, and it could change if the hosting decision ever did.

Conclusion: no built-in Next.js caching primitive, as deployed on Vercel
today, is an adequate authoritative store for the re-encoded media bytes. A
real, independent store is needed for media regardless of what we decide for
session or API-key state.

## Whether the API-key verifier can avoid a store

It cannot, once per-key revocation is a requirement. A stateless signed token
— one whose signature alone proves validity, with no server-side lookup — can
be verified without a store, but it can only be verified as *valid until it
expires*; nothing about the signature can express "this specific key was
revoked five minutes ago." Making that expressible needs something the
verifier checks on every request that records which keys are dead, and that
something is, by definition, a store. The "stateless token" candidate the
plan listed collapses into "stateless token plus a revocation-list store" the
moment revocation is required, which is not actually a different answer from
"a store holds a verifier record per key" — it is the same requirement with
an unnecessary signature scheme on top. We rejected the stateless-token
design on those grounds and treated the question as "which store holds the
verifier record," not "store or no store."

## Whether the session record shares that store

Yes. Once a store exists for the API-key verifier, adding session records to
the same store costs no new vendor relationship, and Vercel Marketplace's own
guidance recommends the same technology for both: "Redis for session storage,
rate limiting, and leaderboards" appears once, naming both this project's use
cases in the same sentence
([Storage on Vercel Marketplace](https://vercel.com/docs/marketplace-storage),
read 2026-08-22).

## Session state: Upstash Redis via Vercel Marketplace

**Chosen.** A session record — reader or author alike, per the plan's
Assumptions — lives in a Redis store provisioned through the Vercel
Marketplace, keyed by the opaque identifier the session cookie already
carries under `docs/conventions/security.md`'s existing rule, with a TTL that
does not exceed the underlying GitHub token's lifetime.

**Rejected candidates:**

- **An encrypted stateless cookie carrying the token.** This was the one
  candidate that would have added no vendor at all, and we rejected it
  anyway. `docs/conventions/security.md` § "Session Cookies Are This
  Application's, Not GitHub's" already requires the token to live in a
  server-side session record rather than in the cookie itself. A cookie that
  carries the encrypted token itself is exactly the design that rule
  forbids, and it also has no way to force-expire a single compromised
  session without rotating every cookie's encryption key at once — a
  strictly worse revocation story than the one the API-key requirement
  already forced us to solve.
- **Vercel Global Config** (the product the plan's candidate list names
  "Edge Config"; Vercel renamed it and states "the store itself is
  unchanged" — [Vercel Global Config](https://vercel.com/docs/global-config),
  read 2026-08-22). Its own limits page rules it out on two independent
  grounds: **maximum store size is 1 MB total, on every plan including Pro**,
  and a write takes "up to 10 seconds" to propagate globally, with the page
  itself warning to "avoid using Global Configs for frequently updated data
  or data that needs to be accessed immediately after updating"
  ([Global Config Limits and pricing](https://vercel.com/docs/global-config/global-config-limits),
  read 2026-08-22). A session store that grows with every login and must be
  readable the instant it is written cannot live in either constraint.
- **A Vercel Marketplace SQL store** (e.g., Neon Postgres). Workable, but
  Marketplace's own comparison table steers relational storage toward "ACID
  transactions, complex queries, and foreign keys" and key-value storage
  toward "session storage" by name (same citation as above). A session record
  has no relational shape and needs TTL-native expiry, which Redis gives for
  free and Postgres would need a cleanup job to approximate.

**Cost model.** Upstash is a third-party company, not a Vercel product —
its Marketplace listing describes it as "Vercel Native," language Vercel uses
for an integrated third party rather than its own product
([Upstash on Vercel Marketplace](https://vercel.com/marketplace/upstash),
read 2026-08-22) — and Marketplace resources are billed with "unified
billing: pay for storage resources through your Vercel account"
([Storage on Vercel Marketplace](https://vercel.com/docs/marketplace-storage),
read 2026-08-22). The listing names "Free, Pay as You Go, Fixed" plan tiers
for Upstash Redis but states no concrete request or storage price on that
page; that figure is recorded as unverified below rather than supplied from
memory.

**Adds a vendor: yes.** Upstash becomes this application's fourth external
vendor relationship — see Total vendor count below.

**What is lost if the store is lost: a rebuild, not data loss.** Every active
session ends and every signed-in user is treated as signed out. Recovering is
a redirect through GitHub's OAuth flow, and because the authorization already
exists on GitHub's side, that redirect frequently completes without the user
seeing another consent screen. GitHub remains the source of truth for the
underlying identity and repository access the whole time; nothing about the
user's account or content is lost, only the record of who was currently
signed in.

**Does this contradict `docs/conventions/security.md`?** No. That document
already requires a server-side session record separate from the cookie; it
names no storage technology. Choosing Redis for that record fulfills the
existing rule rather than conflicting with it, so no section of that document
needs to be rewritten.

## API-key verification: the same Redis store

**Chosen.** Each issued API key's verifier — a hash of the key, the blog it
authorizes, and its scopes — lives in the same Redis store as session state,
under its own key namespace. Revoking one key deletes its one entry. The
verifier fails closed: a missing record means an invalid key, not an
unrestricted one, so losing the store cannot silently reinstate a key that
was revoked before the loss.

**Rejected candidates:**

- **A stateless signed token with a separate revocation list.** As reasoned
  above, the revocation list is itself a store, so this candidate does not
  avoid one. The real argument for it is latency and resilience, not cost: a
  signature verifies without a network round trip, so the revocation list
  only needs consulting on some fraction of requests — cached for a short
  window, or checked asynchronously — trading a bounded revocation delay for
  fewer round trips per request and for surviving a brief store outage
  without rejecting every key. That trade is a poor fit for what issue #32
  requires here: per-key revocation with no tolerated window, which is
  exactly the delay this pattern's whole benefit depends on introducing. A
  design whose only advantage is checking the revocation list less often
  cannot be adopted alongside a requirement that it be checked every time,
  so it adds the signature scheme's own complexity on top of the same
  storage requirement for no benefit this project can use.
- **Vercel Global Config**, for the same reasons rejected for session state:
  a 1 MB total ceiling and up to ten seconds of write propagation. Ten
  seconds is a real window in which a key an operator just clicked "revoke"
  on would keep authenticating — unacceptable for what issue #32 calls a
  "revoke" action.
- **A Vercel Marketplace SQL store**, rejected for the same reason as
  session state: Redis's native per-key expiry and the existing Marketplace
  citation above cover the shape this data needs without a schema.

**Cost model.** Shares Upstash's billing relationship with session state; the
marginal cost is additional request and storage volume against the same
plan, not a second bill. The Marketplace listing gives no concrete per-request
price to compute that marginal cost against — recorded as unverified below.

**Adds a vendor: no**, beyond the one session state already adds.

**What is lost if the store is lost: data loss, not a rebuild.** This is the
one of the three kinds of state where the honest answer is not "rebuild."
This application is the sole source of truth for which keys exist and what
scopes each one was granted — GitHub knows nothing about them, and the linked
repository does not either. Losing the store does not just force a
re-authentication the way losing a session does: every key a blog owner
issued to an external integration stops authenticating at once, and the
specific scopes each one carried are not recoverable from anywhere but the
owner's own memory. An integration nobody is actively watching (a scheduled
job, a webhook receiver) can stay broken for a while before anyone notices.
Recovering means the blog owner manually reissues a key, with a new secret
value, for every integration that used one — a real loss of configuration,
not a cache warming back up.

## Media cache: Vercel Blob

**Chosen.** The re-encoded media object — already required to land under
1 MB before it is committed, per
`docs/conventions/github-platform-limits.md` — is written to a **private**
Vercel Blob store, addressed by the same content hash the linked repository
already shards media by, and delivered to readers through a route handler
this application owns rather than by the blob's own URL: "Since private
blobs are delivered through your own Functions, you can serve them from any
custom domain"
([Private Storage](https://vercel.com/docs/vercel-blob/private-storage), read
2026-08-22). Vercel's own storage comparison table names Blob for exactly
this shape of data: "Large, content-addressable files ('blobs')"
([Vercel Storage overview](https://vercel.com/docs/storage), read
2026-08-22).

Public-storage mode was available and cheaper, and we rejected it on the
project's own existing rule rather than on cost.
`docs/conventions/github-platform-limits.md` § "Never Link
`raw.githubusercontent.com`" already requires that media be delivered
through this application's own cache layer, on this application's own
origin — a MUST this record does not get to relax for a different vendor's
storage product. A public Blob store fails that requirement by construction:
"Every file uploaded to a public Blob store gets a URL in the form of
`https://<store-id>.public.blob.vercel-storage.com/<pathname>`. You can use
this URL directly in your HTML"
([Public Storage](https://vercel.com/docs/vercel-blob/public-storage), read
2026-08-22) — the browser would fetch media straight from a Vercel-owned
hostname, never touching this application's own request path, which is the
same shape of dependency the sibling decision to serve media from our own
cache rather than GitHub's raw host,
`2026-08-21-serve-media-from-our-own-cache-rather-than-githubs-raw-host.md`,
already rejected once, for a different vendor's raw host.

**Rejected candidates:**

- **Public-storage mode**, for the origin reason above: a public blob's URL
  resolves on a Vercel-owned hostname the browser fetches directly, the same
  problem shape `docs/conventions/github-platform-limits.md` already rules
  out for GitHub's raw host. It is real money left on the table — see Cost
  model below — but the origin rule is a MUST, not a preference weighed
  against price.
- **The Next.js Data Cache**, for the reasons already established above:
  Vercel's own guidance sends "Complete HTTP responses (images, fonts, etc.)"
  to the CDN cache instead, and the cache is shared with — and evictable by —
  every other project on the team. The 2 MB item cap is not among the
  reasons: a re-encoded object targeted under 1 MB fits it with room to
  spare, and saying otherwise would overstate the case against a candidate
  the two grounds above already rule out.
- **The ISR cache**, for the reason already established above: it does not
  carry over from one deployment to the next, so every deployment would pay
  the re-encode cost again for every image, on the first request after each
  deploy.
- **The CDN cache alone**, because it caches responses, not files, has no
  origin behind it, and its TTL is "best-effort and not guaranteed." We use
  it anyway, but as the layer Blob already puts in front of itself
  automatically — "Vercel's CDN cache caches all blobs (private and public)
  for up to 1 month by default"
  ([Vercel Blob](https://vercel.com/docs/vercel-blob), read 2026-08-22) — not
  as a substitute for a durable store behind it.
- **A Vercel Marketplace object or key-value store.** Vercel Blob already is
  a first-party, purpose-built object store that the platform's own
  documentation recommends for this exact use case; a Marketplace
  alternative would add a vendor for a capability Blob already provides
  under the existing Vercel relationship.

**Cost model**, from Vercel Blob's own worked pricing example and its
delivery-cost comparison, read 2026-08-22
([Vercel Blob Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)):
storage is **$0.023/GB** past a 5 GB included allowance; a cache-miss read
("Simple Operation") is **$0.40 per million** past 100K included; a write,
copy, or list call ("Advanced Operation") is **$5.00 per million** past 10K
included; and outbound data transfer is **$0.05/GB** in the `iad1` region
past 100 GB included. These are the worked example's `iad1` figures; the page
states pricing is regional, so another region's exact rate is not recorded
here. `del()` calls are free. A blob larger than 512 MB is never cached and
incurs an origin-transfer charge on every access — not a concern at our
target of under 1 MB per object.

Serving through a route handler is the more expensive of Blob's two delivery
shapes, and this record says so rather than presenting private mode as free.
The pricing page states the split directly: private delivery charges "Blob
Data Transfer + Fast Origin Transfer on cache miss for the Function-to-store
fetch, plus Fast Data Transfer + Fast Origin Transfer for the
Function-to-browser response," while public delivery charges only "Blob Data
Transfer + Fast Origin Transfer on cache miss," because the browser fetches
the store directly — and "Blob Data Transfer (BDT) is 3x more cost-efficient
than Fast Data Transfer (FDT) on average," a rate public delivery benefits
from on its one leg and private delivery does not on its second, Function-to-
browser leg
([Vercel Blob Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing),
read 2026-08-22). This is a cost the project already chose to pay once: the
decision to serve media from our own cache rather than GitHub's raw host,
`2026-08-21-serve-media-from-our-own-cache-rather-than-githubs-raw-host.md`,
accepted operating a cache layer and paying its egress in exchange for
keeping every byte on this application's own origin; choosing private Blob
mode over public is the same trade applied to this storage vendor.

What keeps that cost tolerable rather than prohibitive is the private page's
own traffic guidance: "We do not recommend serving files larger than 100 MB
through private Blob stores unless traffic is low"
([Private Storage](https://vercel.com/docs/vercel-blob/private-storage), read
2026-08-22). Our media is re-encoded to under 1 MB per object before it is
ever written to the store — comfortably inside that guidance, not at its
edge.

The caching shape also differs from public mode. The CDN cache still sits
between the route handler and the store the same way it does for public
blobs — "When your Function fetches a private blob, the request goes through
Vercel's CDN cache. If the blob is already cached, no Fast Origin Transfer is
charged" — but the browser-facing cache is no longer the blob URL's own
month-long default; it is whatever `Cache-Control` header the route handler
sets on its own response
([Private Storage](https://vercel.com/docs/vercel-blob/private-storage), read
2026-08-22; contrast public mode, whose "[b]oth caches store blobs for up to
1 month by default" —
[Public Storage](https://vercel.com/docs/vercel-blob/public-storage), read
2026-08-22).

**Adds a vendor: no.** Vercel Blob bills through the same Vercel account
already required for hosting; it is not a separate company the way Upstash
is.

**What is lost if the store is lost: a rebuild, not data loss.** The original,
un-re-encoded media bytes remain committed in the linked repository under the
existing decision to store media there rather than in object storage,
`2026-08-21-store-media-in-the-linked-repository-rather-than-in-object-storage.md`.
Losing the Blob store means the next request for each image re-fetches the
original from GitHub and re-runs the re-encode step — real CPU time and a
burst of GitHub reads, bounded by the read-rate guidance in
`docs/conventions/github-platform-limits.md` — but no reader-visible content
is permanently lost.

## Total vendor count

This application's tech stack already names three external vendors: GitHub
(source of truth and the companion app), Vercel (hosting), and Sentry (error
tracking, inert until configured) — see `README.md`'s tech-stack table. This
decision adds one: **Upstash**, behind Vercel Marketplace, for session and
API-key state. Vercel Blob adds none, since it bills through the existing
Vercel relationship rather than a separate company. The resulting total is
**four** external vendors. No ceiling was imposed on this number per the
Background above; it is recorded for the maintainer's review rather than
screened against a limit.

## What was not measured, and the residual risk left by that

The plan's original verification step — a throwaway measurement confirming a
cached value survives a redeployment — was deliberately not run. In its
place, Vercel's own current documentation was read directly and answers the
question this application actually needed answered: Data Cache "persists
across deployments unless you explicitly invalidate it," and ISR "does not
reuse the cache from a previous deployment." Both statements are quoted with
their source above. That substitution is only as good as those pages
themselves: this is Vercel's documented behavior, not something this project
measured independently, and Vercel can change a managed platform's internals
without any of our own tests catching a regression. If session, API-key, or
media delivery ever depends on a caching primitive's deployment-persistence
behavior more precisely than "we chose a real store instead of relying on
one," that dependency should be re-verified against Vercel's documentation at
the time, not against the quotes recorded here.

The following figures were not stated in the vendor documentation read on
2026-08-22, and are recorded as unverified rather than supplied from memory:

- Upstash Redis's concrete free-tier limits and its paid-tier per-request or
  per-GB price. The Marketplace listing names only tier labels ("Free, Pay
  as You Go, Fixed"), no figures.
- Whether Upstash's Vercel Marketplace billing is metered identically to a
  direct Upstash account, or carries a markup or a different unit.
- Vercel Blob's exact operation and data-transfer prices outside the `iad1`
  region used in the pricing page's worked example; the page states pricing
  is regional but does not tabulate every region.

## What this invalidates

`README.md`'s opening paragraph, and `AGENTS.md`'s Project Overview section
that mirrors it, both claim this application keeps no persistence layer of
its own — that everything outside the linked repository is a derived cache
rebuildable from it. Both claims become false the moment this decision's
stores exist. Media is a rebuild, as shown above, so it does not break the
claim on its own — but the API-key verifier's scopes are genuine data loss
if its store is lost, not something the linked repository can rebuild, and
session state sits outside the linked repository's authority entirely. Both
documents need a carve-out naming session and API-key state as the exception
to that no-persistence claim. Writing that carve-out is out of scope for
this record, per its plan's non-goals; it is left to whichever change
implements this decision.

`docs/conventions/security.md` § "Session Cookies Are This Application's, Not
GitHub's" is not invalidated — see Session state above — so no rewrite is
named for it.
