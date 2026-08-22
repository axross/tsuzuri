# GitHub Platform Limits

Every byte this project reads or writes crosses GitHub's API, and GitHub
publishes both hard limits that reject a request and soft recommendations that
degrade a repository's health without ever failing. A change that touches the
GitHub surface MUST satisfy the rules below.

These figures were established from GitHub's own documentation on 2026-08-20.
GitHub changes them without notice, so a change that turns on one of these
numbers MUST re-check the primary source this document cites for it, listed
near the end, rather than trusting the number here.

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
| 1 MB – 100 MB | `Accept: application/vnd.github.raw` is **required**; the object media type returns empty `content` |
| Over 100 MB | Unsupported. The Git Blobs API stops at 100 MB too |

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
[the decision to store media in the linked repository](../decisions/2026-08-21-store-media-in-the-linked-repository-rather-than-in-object-storage.md).

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
Handling that event by writing again is an infinite loop. Webhook handling
MUST filter out commits authored by the application's own bot identity before
acting on them.

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
limit no configuration changes. Since media never goes to external storage,
every uploaded byte crosses that boundary, so media transfer MUST be split
into chunks in both directions. Base64 inflates a payload by about a third, so
size the chunks against 4.5 MB of *encoded* bytes.

## Where These Figures Came From

- [Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — directory width and depth, push rate, Git read operations, and the guidance that an integration stores user data in the user's own account
- [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) — the 1 MB recommendation and the 100 MiB hard limit
- [Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) — §9 on excessive bandwidth use, which defers to the document above for what storing objects in a repository may look like
- [REST API endpoints for Git trees](https://docs.github.com/en/rest/git/trees) — the recursive ceiling and `truncated`
- [GraphQL reference: Commits](https://docs.github.com/en/graphql/reference/commits) — `createCommitOnBranch` and `expectedHeadOid`
- [Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs) — the quotas that rule LFS out
- [Vercel Functions limitations](https://vercel.com/docs/functions/limitations) — the 4.5 MB request body cap

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
