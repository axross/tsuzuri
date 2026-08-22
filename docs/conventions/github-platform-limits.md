# GitHub Platform Limits

Every byte this project reads or writes crosses GitHub's API, and GitHub
publishes both hard limits that reject a request and soft recommendations that
degrade a repository's health without ever failing. A change that touches the
GitHub surface MUST satisfy the rules below.

Most of these figures were established from GitHub's own documentation on
2026-08-20. The Discussions section is younger and different in kind: it was
measured against the live API on 2026-08-22, because GitHub publishes almost
none of what it states — each section says which of the two it rests on.

GitHub changes any of it without notice, so a change that turns on one of these
numbers MUST re-check the primary source this document cites for it, listed
near the end, rather than trusting the number here. For a figure that was
measured rather than read, re-checking means measuring again: there is no
primary source to consult.

## Never Read GitHub Per Request

GitHub is this project's source of truth, not its delivery origin. A design
that calls the API once per page view multiplies one article's reads by its
traffic, and two separate limits catch it: the installation token's hourly
quota, and a recommended ceiling of **15 Git read operations per second per
repository** that no error message mentions.

Reads MUST therefore be driven by the `push` webhook rather than by traffic:
an event invalidates or refreshes what changed, and delivery is served from
the cache. Under that design GitHub sees a read count proportional to *edits*,
not to page views.

An installation token starts at **5,000 requests per hour**, gains 50 per
repository past the twentieth, and caps at **12,500 per hour**. The quota is
per installation, so a second user brings their own — growth adds capacity
rather than consuming it.

## Batch Text Reads Through GraphQL

The GraphQL API bills an aliased multi-file query at one or two points
regardless of how many files it names, where the REST Contents API bills one
request per file. Reading fifty posts MUST use one aliased GraphQL query
rather than fifty REST calls.

Two constraints bound it. `Blob.text` returns UTF-8 text only and is `null`
for binary, so **media can never be fetched this way**; and a large blob can
be truncated, so a query reading `text` MUST also read `isTruncated` and treat
a truncated result as a miss rather than as content. Keep a query to roughly
50–100 aliases; the practical ceiling is the request and response size, not a
documented alias count.

## Respect the File-Size Tiers

| Size | What works |
| --- | --- |
| Up to 1 MB | The Contents API returns base64 `content` in an ordinary response |
| 1 MB – 100 MB | `Accept: application/vnd.github.raw+json`, or the object media type, both work; the object media type returns empty `content` |
| Over 100 MB | Unsupported for reading, through either API. **Creating** a Git blob is refused well before that — see below |

Files over 100 MB are out of scope for this project, so **video is effectively
unsupported** and a change MUST NOT introduce a path that assumes otherwise.

GitHub's *recommended* single-object size is **1 MB** — the 100 MB figure is
the hard limit, not the advice. Uploaded images MUST therefore be re-encoded
server-side before they are committed, targeting under 1 MB. A 2000px long
edge in WebP at quality 80 was measured on 2026-08-22 to land between **77 KB
and 684 KB** across a 54 MB photograph, a 12-megapixel phone photograph, a
screenshot, and a logo with transparency — one pass, no fallback needed. Do
**not** read AVIF as interchangeable with WebP here: at the same nominal
quality it was 7–33× slower and larger on both photographs. This is a
condition of the project's own justification for storing media in the
repository at all, not a nice-to-have: see
[the decision to store media in the linked repository](../decisions/2026-08-21-store-media-in-the-linked-repository-rather-than-in-object-storage.md),
and [the decision on the encoder and the output policy](../decisions/2026-08-22-re-encode-uploads-with-sharp-to-webp-at-a-2000px-long-edge.md)
for where these figures came from and why AVIF is not a drop-in alternative.

Creating a blob has its own, lower, and wholly undocumented ceiling — the
100 MB figure above is the Git Blobs API's *read* limit, not its create one.
A bisect run on 2026-08-22 found the largest blob GitHub's Git Blobs API
would create at 39 MiB and the smallest it refused at 40 MiB, roughly 2.5x
below the 100 MB read limit and unstated anywhere in GitHub's own
documentation. A design MUST NOT assume 100 MB is available to a blob write;
re-encoding under 1 MB (above) is what keeps every object this project
commits well clear of that ceiling. See
[the decision to hold in-flight upload chunks in a managed key-value store](../decisions/2026-08-22-hold-in-flight-upload-chunks-in-a-managed-key-value-store.md)
for the measurement and what it means for media transfer.

## Always Check `truncated`

The Contents API lists at most **1,000 entries per directory**, and the Git
Trees API's recursive mode returns at most **100,000 entries or 7 MB**,
whichever comes first — and the 7 MB ceiling usually arrives first, sooner the
deeper and longer the paths are.

Past either ceiling the response sets `truncated: true` and **succeeds**. Code
that reads a tree MUST check that flag and walk sub-trees non-recursively when
it is set. Skipping the check does not raise an error; it silently loses
posts.

## Keep Directories Narrow

GitHub recommends at most **3,000 entries per directory**, because a wide
directory's tree object is rewritten on every change to anything inside it.
Posts MUST therefore be partitioned by date and media MUST be sharded by
content hash:

```
posts/2026/08/hello-world.md
media/a3/f8/a3f8c2e1….webp
```

Two hash levels spread media across up to ~65,000 directories. Content
addressing also means Git deduplicates an image used in ten posts down to one
blob, and that renaming a post never moves its media.

## Do Not Use Git LFS

An LFS-managed file comes back from the Contents API as its **pointer file** —
a few hundred bytes of text — not as the object. Nothing about the response
says so. LFS also carries bandwidth and storage quotas that bill past 10 GiB,
which contradicts this project's premise of adding no paid storage layer. A
change MUST NOT put project content under LFS.

## Write Through the Path That Fits the Payload

Text-only changes — a post body, front matter, a metadata JSON — MUST use the
GraphQL `createCommitOnBranch` mutation. It is one request, it is atomic
across files, GitHub signs the resulting commit so a branch requiring signed
commits accepts it, and `expectedHeadOid` gives server-verified optimistic
locking that collapses read-modify-write into a single call.

Changes carrying media MUST use the REST Git Data API instead, because
`createCommitOnBranch` inlines every file's content as base64 and cannot
reference an existing blob. The Git Data path posts blobs individually, lets
media be uploaded before the post that references it, and reuses a blob's SHA
so a rename never re-uploads bytes.

When building a tree, `base_tree` is **mandatory**. Omitting it does not fail:
it produces a commit whose tree contains only the entries passed in, which
means every other file in the repository is deleted. Any wrapper around the
Git Data API MUST take `base_tree` as a required argument. Deleting a path is
expressed as `sha: null`, never by omitting the entry.

## Never Commit on a Timer

GitHub's recommended push rate is **6 pushes per minute per repository** —
one every ten seconds — and that binds well before the API's own roughly
80-per-minute content-generating ceiling.

Autosave therefore MUST NOT produce commits. Drafts live in the browser's
IndexedDB, and only an explicit save commits, debounced to at least ten
seconds apart. See
[the decision to keep drafts out of commits](../decisions/2026-08-21-keep-drafts-out-of-git-history.md).

## Exclude Our Own Commits From the Webhook

A commit this application writes fires the same `push` webhook it listens to.
Handling that event by writing again is an infinite loop. The author's
identity cannot be the filter: a save commit is authored as the user rather
than as the application's own bot identity, so nothing in its author field
distinguishes a save this application wrote from one the same author pushed
by hand from their laptop. The committer is no help either, being the same
GitHub web identity every web-UI edit already carries. See
[the decision to author save commits as the user](../decisions/2026-08-22-author-save-commits-as-the-user.md).

Webhook handling MUST instead filter on **the commit OID the write itself
returned**: `createCommitOnBranch` returns `commit.oid`, and the Git Data API
returns the created commit's SHA. Match that OID against the SHAs the `push`
event delivers, and skip a commit whose SHA is one of ours. Keeping a
short-lived record of recently written OIDs is cache-like in the sense this
project already accepts elsewhere: it is rebuildable, and losing it before a
webhook arrives costs at most one redundant, idempotent cache refresh rather
than an infinite loop.

## Treat a Discussion Comment as Two Levels Deep and Unsanitized

Discussions are reachable through GraphQL only; there is no REST equivalent for
a repository's discussions, so a change that touches them MUST go through the
GraphQL API.

A discussion holds top-level comments, and each top-level comment holds replies.
**A reply holds nothing.** Passing `replyToId` a comment that is itself a reply
fails with type `UNPROCESSABLE` and the message `Parent comment is already in a
thread, cannot reply to it`. A change MUST NOT design a comment tree deeper than
those two levels, and MUST NOT assume the ceiling is permanent: GitHub publishes
no maximum depth, so this figure was measured rather than read, and re-measuring
is the only way to know it still holds.

Why the product takes that ceiling as its own rather than representing a deeper
tree on top of it — and what representing one would have cost — is in
[the decision to cap comments at the shape GitHub Discussions stores](../decisions/2026-08-22-cap-comments-at-the-shape-github-discussions-stores.md).
The rules in this section hold without it; the record is where the alternative
that was considered and dropped is kept.

The read shape follows the same two levels. `Discussion.comments` returns **only
top-level comments** — a reply is absent from it — and each node carries its own
`replies` connection. Code that counts comments from `comments.totalCount` is
counting threads, not comments.

Three writes, three tokens:

| Write | Token |
| ----- | ----- |
| Creating a comment thread that does not exist yet | the installation access token |
| Posting a reader's top-level comment | that reader's user access token |
| Posting a reader's reply | that reader's user access token |

Both token kinds depend on the companion app holding the **Discussions**
repository permission at write level, which is fixed when the app is registered
rather than at runtime. A user access token additionally reaches only what the
reader and the app can *both* reach, so a reader who is not a collaborator can
never comment on a private repository's discussions, however the flow is
arranged. The operative condition there is access rather than visibility: a
token that *does* reach a private repository creates and comments on its
discussions without difficulty. A surface that meets this case MUST report
comments as unavailable and name the repository's visibility as the reason —
never an empty thread, which reads as "nobody has commented", and never an
authorization error, which reads as a fault.

**GitHub stores a comment body exactly as written.** Reading `body` back returns
the bytes that were posted, including raw `<script>` tags, `onerror` attributes,
and `javascript:` link targets. Only `bodyHTML` — GitHub's own rendering — is
sanitized, and only partly: `<b>` and `<details>` survive as markup, `<script>`,
`<iframe>` and `<style>` come back escaped, an `<img>` loses its `onerror`, and
an anchor with a `javascript:`, `data:`, or `vbscript:` target loses the anchor
and keeps its text.

Since this project serves Markdown rather than GitHub's HTML, it serves `body`.
Any path that returns a comment to a consumer MUST therefore sanitize it here.
There is no upstream sanitization to fall back on, and a change that assumes
GitHub already cleaned the text is wrong. Serving the source rather than
GitHub's rendering was a choice, and the sanitization burden was its accepted
price rather than an oversight; what was weighed is in
[the decision to cap comments at the shape GitHub Discussions stores](../decisions/2026-08-22-cap-comments-at-the-shape-github-discussions-stores.md).

The restricted subset this product intends to expose to readers — bold,
italics, and links, and nothing else — behaves like this. All three are stored
byte-for-byte, because the whole body is:

| Construct | Stored | Rendered by GitHub |
| --------- | ------ | ------------------ |
| `**bold**` | verbatim | `<strong>` |
| `*italic*` | verbatim | `<em>` |
| `[text](https://…)` | verbatim | `<a href="…" rel="nofollow">` — the `rel` is **added** |

GitHub rejects none of the three. The link row is the one rewrite inside the
subset, and it happens only on GitHub's side: a consumer reading `body` gets no
`rel` attribute, because that attribute exists nowhere but in GitHub's own
render. A consumer that wants `nofollow` on a reader's link MUST add it itself,
and this project's own contract MUST say so rather than letting a consumer
assume the platform did it.

One more asymmetry belongs with the subset rather than outside it. **A bare URL
is a link once rendered**: `https://example.com/…` stays bare text in `body` and
comes back as an `<a … rel="nofollow">` in `bodyHTML`, with no link syntax
anywhere in the source. Validation that rejects link *syntax* therefore does not
stop a reader from posting a link, and a change that limits links MUST act on
the rendered result rather than on what the reader typed.

## Never Link `raw.githubusercontent.com`

Storing media in a repository is sanctioned; serving it from GitHub's raw host
is what GitHub's Acceptable Use Policy calls excessive bandwidth use, and it
is already observed returning HTTP 429 to pages that hotlink many images.

Media MUST be delivered through this application's own cache layer. Because an
author writing Markdown by hand will paste a raw URL sooner or later, the
render path MUST rewrite a `raw.githubusercontent.com` URL in post content to
an equivalent URL on this application's own origin. jsDelivr is not an
acceptable substitute: it makes a third party a hard dependency of every page
load, and it imposes a package-size ceiling of its own, whose
figure this document has not verified — see the last section.

## Stay Inside the Hosting Platform's Body Limit

Vercel Functions cap a request body at **4.5 MB**, and it is an infrastructure
limit no configuration changes. The same cap covers the response body too,
under its own `FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE` error code — but a bisect
run on 2026-08-22 delivered buffered responses up to 64 MiB and streamed
responses up to 200 MiB in full, and could not reproduce a response-side
rejection at any size tried. The **download** direction therefore needs no
chunking. The **upload** direction does, because its rejection was reproduced
directly: a byte-exact bisect against a do-nothing echo route found the
largest accepted request body at 4,493,986 measured bytes, with request
headers counted against that same budget rather than exempt from it. That
budget is **raw**, not encoded — chunks cross the browser-to-Function hop as
raw bytes, and base64 is forced only at the GitHub boundary, never on this
hop — so size chunks against raw bytes, not against 4.5 MB of *encoded* ones.
See
[the decision to hold in-flight upload chunks in a managed key-value store](../decisions/2026-08-22-hold-in-flight-upload-chunks-in-a-managed-key-value-store.md)
for the chunk size this project uses and the arithmetic behind it.

## Where These Figures Came From

- [Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — directory width and depth, push rate, Git read operations, and the guidance that an integration stores user data in the user's own account
- [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) — the 1 MB recommendation and the 100 MiB hard limit
- [Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) — §9 on excessive bandwidth use, which defers to the document above for what storing objects in a repository may look like
- [REST API endpoints for Git trees](https://docs.github.com/en/rest/git/trees) — the recursive ceiling and `truncated`
- [GraphQL reference: Commits](https://docs.github.com/en/graphql/reference/commits) — `createCommitOnBranch` and `expectedHeadOid`
- [Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs) — the quotas that rule LFS out
- [Git blobs](https://docs.github.com/en/rest/git/blobs) — the blob media types and the 100 MB *read* ceiling; blob **creation**'s own ceiling is undocumented and was measured directly (see the decision record cited above)
- [Repository contents](https://docs.github.com/en/rest/repos/contents) — the file-size tier media types
- [Vercel Functions limitations](https://vercel.com/docs/functions/limitations) — the 4.5 MB cap on both the request and the response body
- [Using the GraphQL API for Discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions) — that discussions are GraphQL-only, and `replyToId`'s meaning
- [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) — the "Discussions" repository permission a GitHub App needs
- [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) — that a user access token reaches only what the user and the app can both reach

The two-level reply ceiling, the `UNPROCESSABLE` message, the storage and
rendering behaviour of a comment body, and the per-construct subset table have
no documented source. They were measured against the live GraphQL API on
2026-08-22 — one comment carrying the intended subset, every construct outside
it, raw HTML, and dangerous link schemes, posted and then read back through
`body`, `bodyText`, and `bodyHTML` — and are recorded here because nothing
published states them.

## What Is Still Unverified

These were not settled from a primary source and MUST be measured before a
change depends on them:

- The GraphQL API's own request-body size ceiling. No documented figure was
  found, so the effective limit for a large `createCommitOnBranch` payload is
  unknown — which is one more reason media goes through the Git Data path.
- Whether `createCommitOnBranch` counts against the same content-generating
  budget as the REST write endpoints.
- The practical alias count per GraphQL query. The 50–100 range above is
  judgment, not a published limit.
- The blob size at which `Blob.isTruncated` becomes true.
- jsDelivr's package-size ceiling. A figure of 50 MB was carried in from the
  research memo, but no primary source for it was confirmed. Nothing here
  depends on the number — jsDelivr is ruled out on the external-dependency
  argument alone — so it is recorded as unverified rather than cited.
- The thresholds at which GitHub Support actually contacts a repository owner
  about repository health. Only the recommendations are published.
- What retention period, if any, GitHub applies to a Git object nothing
  references. GitHub's own account of unreachable-object handling describes
  pruning as time-based (cruft packs, aged by an auxiliary `.mtimes` file) but
  does not publish the window. Searched 2026-08-22 across docs.github.com,
  github.blog, and support.github.com with nothing found.
- Whether the discussion writes above behave the same for the identities this
  project will actually use. Every measurement was taken with a fine-grained
  personal access token belonging to the repository's own owner; neither an
  installation access token nor a reader who is not a collaborator was
  exercised. The token table states what the permission model says, not what
  was observed, and a change that turns one of those rows on MUST verify it.
- Whether the two-level reply ceiling is a stable platform property or an
  implementation detail. It is measured and undocumented, so it may move
  without notice.
