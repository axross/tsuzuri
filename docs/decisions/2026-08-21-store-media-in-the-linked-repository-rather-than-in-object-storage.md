---
status: accepted
---

# Store media in the linked repository rather than in object storage

An image embedded in a post has to live somewhere. The obvious engineering
answer is an object store — S3, R2, or the hosting platform's own blob
service — which is built for serving bytes and imposes no size ceiling worth
worrying about.

We chose to keep media inside the user's own repository instead. The reason is
not technical elegance; it is that this project's premise is that the user's
repository *is* the blog, portable and complete on its own. A repository whose
images live somewhere else is not a backup of anything: clone it and the posts
render as broken boxes. Adding an object store would also add a metered,
billable persistence layer to a product deliberately designed without one, and
a second place where a user's content can be lost or held.

An object store was rejected for those reasons. Git LFS was rejected for a
different and more concrete one: the Contents API returns an LFS-tracked file
as its pointer text rather than its bytes, so the content would be
unreachable through the same API everything else uses, and LFS bills past its
free quota anyway.

The consequences are real and we accept them.

Large files cannot be supported at all, because GitHub's blob ceiling is a
hard limit rather than a recommendation. Video is out of scope as a result.

Uploaded images must be re-encoded server-side before they are committed. The
size GitHub recommends an object stay under is far below what a phone camera
produces, so a product that committed untouched uploads would be operating
orders of magnitude outside that advice. Re-encoding is what makes this decision defensible
rather than merely permitted, so it is a requirement of the storage design and
not a feature that can be deferred.

Deleted posts leave their media behind in Git history, and nothing reclaims
that space. We accept the slow growth rather than rewriting a user's history
to reclaim it.
