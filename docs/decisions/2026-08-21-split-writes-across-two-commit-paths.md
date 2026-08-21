---
status: accepted
---

# Split writes across two commit paths

GitHub offers three ways to commit through the API: the REST Contents API, the
REST Git Data API, and the GraphQL `createCommitOnBranch` mutation. Using one
of them everywhere would have been simpler to build and simpler to explain. We
chose to use two, selected by whether the change carries binary content.

`createCommitOnBranch` handles text-only changes because it is better at them
in four independent ways: it is a single request, it is atomic across multiple
files, GitHub signs the resulting commit so a branch that requires signed
commits accepts it, and `expectedHeadOid` provides server-verified optimistic
locking. That last point is the decisive one — it collapses read-modify-write
concurrency control into the same call that does the write, where the REST
path needs four requests and hand-rolled conflict detection.

The Git Data API handles anything carrying media, because `createCommitOnBranch`
can only inline file content as base64 and cannot reference a blob that already
exists. That makes three things possible that the mutation cannot do: uploading
each blob as its own request rather than packing an entire commit into one
body, uploading media before the post that references it so the editor can show
progress, and reusing an existing blob's hash so renaming a post does not
re-upload its images.

The Contents API was rejected for both roles: it writes one file per request,
so a post and its metadata cannot land in the same commit.

The consequences are that there are two write paths to maintain and test
rather than one, and that the Git Data path carries a failure mode with no
error attached to it — omitting `base_tree` when building a tree produces a
commit that deletes every file not named in the request, and it succeeds. Any
wrapper over that path must make the argument required rather than optional,
because nothing downstream will catch its absence.
