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

Later the same day the maintainer imposed one, and it is tighter than a
vendor count. No new vendor, and no Vercel metered storage product either.
What is left is the GitHub repository this application already treats as its
source of truth, and the surface the existing Vercel plan already carries:
the CDN cache, Functions, and the Runtime Cache. This record re-derives all
three placements inside that boundary and supersedes the earlier one.

The answer it lands on is that **none of the three needs a store**. Session
state travels in an encrypted cookie, API-key verifiers are committed to the
linked repository, and media is served by a route handler this application
owns with nothing behind it but the CDN cache and GitHub. The external
vendor count stays at the three `README.md` already names.

That is a larger claim than "we found cheaper products", so the reasoning
below is organised around the two arguments the superseded record rested on
— that per-key revocation forces a store, and that no caching primitive can
be one — and what changed under each.

## What the maintainer settled, and what each answer reverses

Four decisions were put to the maintainer on 2026-08-22 before this work
began. Three of them reverse a constraint issue #3 had recorded as settled.

| Settled now | What it reverses |
| --- | --- |
| No new vendor, and no Vercel metered storage product. Vercel Blob and Vercel Global Config are excluded by the constraint, not by their merits. | Issue #3's "no vendor ceiling is imposed up front." |
| A few seconds of API-key revocation delay is acceptable. | Issue #3's "per-key revocation with no tolerated window," which was the single premise that forced a store. |
| A key's last use is recorded at the granularity of a day, not a timestamp per request. | Issue #32's acceptance criterion, which implies a per-request write. |
| The session-token placement is recommended here and decided by the maintainer at this record's review. | Nothing; it is how issue #3 handled the vendor count too. |

A wider revocation window — a cache TTL's worth, tens of seconds — was
offered and not chosen. "Seconds" is therefore the ceiling this record
designs against, and the sections below state what the design does when it
cannot meet that.

The constraint is not new ground.
`docs/conventions/github-platform-limits.md` § "Do Not Use Git LFS" already
rules LFS out partly because its quotas "bill past 10 GiB, which contradicts
this project's premise of adding no paid storage layer." That premise was
written down before the superseded record was drafted, and that record
neither cited it nor reconciled with it. What follows is a return to a
stated premise rather than a new preference.

## Whether per-key revocation still forces a store

The superseded record's central argument was that a stateless signed token
can prove a key was valid when issued but cannot express "revoked five
minutes ago", so a store is unavoidable the moment revocation is required.
The argument is sound and this record does not dispute it. What it turned on
was the width of the tolerated window, and that has moved.

With seconds allowed, the question stops being "store or no store" and
becomes "what is authoritative, and how fast does a change to it reach the
verifier." The linked repository is already the authoritative record of
everything else this application serves, it is reachable from a Function, it
is writable through the commit path
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

## Whether a caching primitive can be the media store

Here the superseded record's reasoning also survives, and this record
reaches a different conclusion by asking a different question. That record
asked which primitive could be the *authoritative store* for media bytes,
found none, and concluded a real store was needed. But media has an
authoritative store already:
`2026-08-21-store-media-in-the-linked-repository-rather-than-in-object-storage.md`
put the bytes in the linked repository, and
`2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md`
settled that what lands there is already re-encoded and already small.
Nothing downstream of that needs to be authoritative. It needs to be a
cache, in front of an origin that exists.

Vercel's CDN cache is exactly that, and the objection the superseded record
raised against it — that it "needs an origin to serve on a miss; it cannot
be that origin itself" — is satisfied rather than violated by a route
handler whose origin is GitHub.

Two of the superseded record's findings still hold and are not re-litigated
here: Incremental Static Regeneration's cache does not carry across
deployments, and Vercel steers "Complete HTTP responses (images, fonts,
etc.)" away from the data cache and toward the CDN cache. Both are quoted
with their sources in that record, which stays readable.

## Session state: an encrypted cookie, and no server-side record

**Chosen, and this is the recommendation the maintainer decides at review.**
The session cookie carries the GitHub user access token itself, encrypted
with a key held only in server-side environment configuration, rather than
an opaque identifier pointing at a record this application stores. The
cookie keeps every attribute the existing conventions and
`2026-08-22-carry-the-reader-session-in-a-cross-site-cookie.md` already
require of it.

Three properties of the surrounding design are what make this defensible
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

- **A server-side session record in the Vercel Runtime Cache.** This was the
  only candidate inside the constraint that would have preserved the
  existing convention untouched, and Vercel's own documentation rules it out
  for this use. The Runtime Cache page lists what it "is not a good fit for"
  and names "User-specific data that differs for each request" first — which
  is what a session record is. It is also "Regional: Each region has its own
  cache", so a session written where the user signed in is absent where
  their next request lands, and "Ephemeral", evicted by a
  least-recently-used policy when the cache fills, so a signed-in user is
  signed out at a moment nothing in this application chose ([Runtime
  Cache](https://vercel.com/docs/caching/runtime-cache), read 2026-08-22).
  Building sessions on a cache the vendor documents as unsuitable for them,
  in order to avoid rewriting a convention, would be the worse trade.
- **A session record in the linked repository.** Sessions are per-reader and
  per-author, not per-blog, so there is no repository that owns one; and a
  write per sign-in runs straight into the six-pushes-per-minute
  recommendation `docs/conventions/github-platform-limits.md` records.
  Rejected on its merits.
- **A Vercel Marketplace key-value store**, the superseded record's choice.
  **Excluded by the constraint**, not by its merits — it remains a good fit
  for the shape of the data. Recorded here so the exclusion is legible:
  Upstash's own pricing page states a free tier of "256 MB" data, "500K"
  monthly commands and "10 GB" monthly bandwidth, and that "The database is
  deleted after 3 days unless you claim it into your account from the
  console link" ([Upstash Redis pricing](https://upstash.com/pricing/redis),
  read 2026-08-22). Even had free-tier third parties been permitted, that
  deletion policy is a poor custodian for anything whose loss is not a
  rebuild.
- **Vercel Global Config.** **Excluded by the constraint**, and
  independently unsuitable: its "Maximum store size" is "1 MB" on every plan
  including Pro, and a write takes "Up to 10 seconds globally" to propagate,
  with the page warning to "avoid using Global Configs for frequently
  updated data or data that needs to be accessed immediately after updating"
  ([Global Config Limits and
  pricing](https://vercel.com/docs/global-config/global-config-limits), read
  2026-08-22). A store that grows with every login fits neither.

**Cost model.** No store, so no storage cost. The cookie adds bytes to every
request that carries it; on the reader path those requests are cross-site
and the cookie is sent with them, which is a bandwidth cost rather than a
billed product.

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
closed: a record the verifier cannot find is an invalid key, never an
unrestricted one.

**The key itself is 256 bits of randomness, so the stored hash is plain
SHA-256 with no secret in it.** A slow key-derivation function protects
low-entropy secrets against guessing; there is nothing to guess here, and a
peppered hash would only add a secret whose loss silently invalidates every
key a blog ever issued. Keeping the hash self-contained is what lets the
repository remain sufficient on its own — an author can read their own key
list, and nothing outside their account is needed to verify against it.

**Two reads and one window.** A verifier list is read through two cache
tiers: the Runtime Cache, keyed per blog and tagged so a revocation can
expire it, and a very short-lived in-process tier inside each Function
instance that bounds the worst case when a tag expiry has not reached a
region. Revoking runs inside this application's own Function, so it commits
the deletion *and* expires the tag in the same operation rather than waiting
for the webhook — so a request served by the region that ran the revoke is
rejected immediately. Elsewhere the delay is bounded by the in-process
tier's TTL, because whether a tag expiry reaches another region promptly is
one of the figures this record leaves unverified below. The `push` webhook
covers the other path, an author editing the file by hand, and that same TTL
is the floor under both.

**What happens when the signal is lost.** A `push` webhook that never
arrives leaves a hand-edited revocation in place only until the cached entry
expires. A GitHub outage leaves cached entries verifying until they expire
and then fails closed, so an outage degrades to rejecting keys rather than
to accepting revoked ones. Neither failure can widen the window past the
shorter cache tier's TTL.

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
  without a lookup, by tolerating a revocation delay — is a benefit this
  design already takes, through the cache tiers, without the extra scheme.
- **The Runtime Cache as the authoritative home.** Rejected on its merits,
  and emphatically: it is documented as "Ephemeral", LRU-evicted when full
  ([Runtime Cache](https://vercel.com/docs/caching/runtime-cache), read
  2026-08-22). An evicted verifier is an issued key that stops working, and
  which scopes it carried would be recoverable from nowhere. It is used
  above only as a cache in front of an authoritative file.
- **Vercel Global Config.** Excluded by the constraint, and independently
  unfit: its documented "Up to 10 seconds globally" write propagation is
  exactly the window a "revoke" action must not have, and its 1 MB ceiling
  is shared across every blog.
- **A Vercel Marketplace store.** Excluded by the constraint, as above.

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
list lives in the source of truth itself. Losing every cache costs a re-read.
Losing the repository is the author losing their blog, which is a condition
this application has never claimed to survive.

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

## Media: a route handler of our own, and the CDN cache behind it

**Chosen.** A request for media reaches a route handler on this
application's own origin. On a cache hit the CDN answers and no code runs.
On a miss the handler fetches the object from the linked repository through
the installation token and returns it with a one-year `Cache-Control`.
Nothing is stored anywhere.

Content addressing is what makes a one-year TTL correct rather than
reckless. `docs/conventions/github-platform-limits.md` already shards media
by content hash, so a media URL names its bytes: the bytes behind a URL can
never change, and an immutable response can be cached for as long as the
platform allows. Vercel's maximum is "1 year" for `s-maxage`, `max-age`, and
`stale-while-revalidate` alike ([Vercel CDN
Cache](https://vercel.com/docs/caching/cdn-cache), read 2026-08-22).

The delivery rule this satisfies is
`docs/conventions/github-platform-limits.md` § "Never Link
`raw.githubusercontent.com`", which requires media to be delivered through
this application's own cache layer on its own origin. A route handler on our
own origin satisfies it by construction — which is worth noting, because the
superseded record had to reach for Vercel Blob's more expensive private mode
to satisfy the same rule against a Vercel-owned hostname.

**Two consequences worth stating before anyone is surprised by them.**

The first is that Vercel will not cache a response to a request carrying an
`Authorization` header. Its cacheable-response criteria require that the
"Request doesn't contain `Authorization` header", and separately that the
"Response doesn't contain the `set-cookie` header" and does not "exceed
`10MB` in content length" (same citation). Public, keyless media — the
surface issue #37 covers — is cacheable and will be served from the CDN.
Media for a blog that requires a key on every request is **not**
CDN-cacheable while the key travels in `Authorization`, so those requests
reach the Function and GitHub every time. That is a real limit on the
private-repository case and it belongs in the design of the key-bearing
media path, not in a footnote.

The second is that the CDN is a cache and says so: "cache times are
best-effort and not guaranteed. If an asset is requested often, it is more
likely to live the entire duration. If your asset is rarely requested (e.g.
once a day), it may be evicted from the regional cache" (same citation), and
the cache is segmented by region. A cold or evicted object costs one GitHub
read. This is compatible with § "Never Read GitHub Per Request" — reads are
proportional to cache misses, not to page views, and an immutable one-year
entry makes a miss a rare event — but it is not the webhook-driven zero that
section describes, and the honest statement is that media reads are
miss-driven rather than edit-driven.

**Rejected candidates:**

- **A Vercel Blob store**, the superseded record's choice, in its private
  mode. **Excluded by the constraint.** Its own pricing page describes what
  the exclusion costs: within the Pro plan Blob usage draws on the "monthly
  credit allocation", and only past that is it on-demand ([Vercel Blob
  Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), read
  2026-08-22). It would have bought lower-latency misses and a store that
  never re-reads GitHub. It is excluded, not refuted.
- **The Runtime Cache as a second tier under the CDN.** Rejected on the
  vendor's own guidance: the Runtime Cache page names "Complete HTTP
  responses (use CDN cache instead)" among what it "is not a good fit for",
  and its item size caps at "2 MB" ([Runtime
  Cache](https://vercel.com/docs/caching/runtime-cache), read 2026-08-22).
  Our objects fit the cap comfortably; the guidance is the reason, and
  saying otherwise would overstate the case.
- **The ISR cache** and **the Next.js Data Cache**, both rejected in the
  superseded record on grounds this record does not disturb.

**Cost model.** No store, so no storage cost. Each miss costs one Function
invocation, one Fast Origin Transfer, and one GitHub read; each hit costs
one Edge Request. All three are billed at the CDN and Function rates the
hosting decision already accepted.

**Adds a vendor: no.**

**What is lost if it is lost: a rebuild, and a fast one.** There is nothing
to lose but cache entries. The bytes are in the linked repository, and the
next request re-fetches them.

## Total vendor count, and what is billed anyway

`README.md`'s tech-stack table already names three external vendors: GitHub,
Vercel, and Sentry. **This decision adds none.** The total stays at three,
where the superseded record made it four.

"No metered storage product" is not "no metered anything", and reading it
that way would be wrong. Every recommendation above consumes billed Vercel
resources: Function invocations and Active CPU, Edge Requests, Fast Origin
Transfer on a cache miss, and — for the API-key verifier cache — the Runtime
Cache, of which Vercel states plainly that "Usage of runtime cache is
charged" ([Runtime Cache](https://vercel.com/docs/caching/runtime-cache),
read 2026-08-22). What distinguishes these from the products excluded above
is that they are the cost of running an application on Vercel at all, which
`2026-08-21-host-on-vercel-and-split-media-transfer.md` already accepted,
rather than a separate store provisioned and billed as its own thing.

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
Runtime Cache an obvious fit — but obvious is not decided, and it is not
decided here.

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

Two things this application does hold are worth being precise about, so the
claim is not read as more absolute than it is: the encryption key behind the
session cookie, and — should the maintainer accept the recommendation above
— nothing else. A key in environment configuration is not a persistence
layer, and this project already holds several: the companion app's private
key, and the MCP signing key
`2026-08-22-be-our-own-authorization-server-and-serve-mcp-statelessly.md`
introduced. This adds one more of the same kind.

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

Issue #32's acceptance criterion on recording a key's last use, which this
record coarsens to a date.

`README.md` and `AGENTS.md` — **not** invalidated, reversing the superseded
record's finding.

## What was not measured, and what is unverified

No measurement was run, and none was intended: the plan this record was
written against replaced the superseded record's throwaway redeploy-survival
experiment with reading the vendors' own current documentation, and this
record does the same. Everything above is the vendors' documented behaviour
on 2026-08-22, not this project's measured behaviour, and a managed platform
can change an internal without any test here catching it.

Recorded as unverified rather than supplied from memory:

- **Whether expiring a Runtime Cache tag propagates across regions, and how
  quickly.** The page states each region has its own cache and that entries
  can be invalidated "by calling `expireTag`", but says nothing about
  cross-region propagation. The API-key revocation window depends on it. The
  in-process TTL above is the design's answer to not knowing, and this is
  the single figure most worth measuring before issue #32 ships.
- **The unit behind Vercel Global Config's Pro prices.** Its pricing table
  gives "$3.00" for reads and "$5.00" for writes with no unit stated on the
  page. Nothing here depends on the number, since Global Config is excluded.
- **Whether the Blob included allowances the superseded record quoted are
  the Pro ones.** That record recorded the same gap; nothing here depends on
  it.
- **The Runtime Cache's storage limit.** The page states there is "a fixed
  storage limit" per cache and that eviction is least-recently-used, without
  giving the figure. How much verifier-cache pressure it takes to start
  evicting is therefore not known.