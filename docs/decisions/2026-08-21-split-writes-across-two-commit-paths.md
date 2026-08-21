---
status: accepted
---

# Split writes across two commit paths

GitHub offers three ways to commit through the API: the REST Contents API, the
REST Git Data API, and the GraphQL `createCommitOnBranch` mutation. Using one
of them everywhere would have been simpler to build and simpler to explain. We
chose to use two, selected by whether the change carries binary content.

The decisive property was concurrency control. `createCommitOnBranch` verifies
the branch head server-side as part of the same call that writes, so two
editors saving the same post cannot silently overwrite each other; the REST
path needs four requests and a hand-rolled conflict check to reach the same
guarantee, and a hand-rolled one is a thing to get wrong. Atomicity across
files, a single round trip, and a signed commit came with it rather than
driving the choice.

That mutation cannot carry media, which is what forced a second path rather
than a preference for one. The Git Data API was chosen for anything binary
because it buys three things the mutation cannot offer at any price: an upload
that can be reported on and resumed rather than packed into one request, media
that can be uploaded before the post referencing it exists, and a rename that
costs nothing because the bytes are already stored.

The Contents API was rejected for both roles: it writes one file per request,
so a post and its metadata cannot land in the same commit.

The consequences are that there are two write paths to maintain and test rather
than one, and that the Git Data path carries a destructive failure mode that
reports itself as success. Any wrapper over it must make the affected argument
required rather than optional, because nothing downstream will catch its
absence — `conventions/github-platform-limits.md` states which argument and
what omitting it does.
