---
status: accepted
---

# Keep drafts out of Git history

An editor autosaves. The natural implementation, in a product whose storage is
a Git repository, is to commit each autosave — which would also synchronize
drafts across a user's devices for free and give them a revision history of
their own writing.

We chose not to. Drafts are held in the browser's IndexedDB, and only an
explicit save produces a commit.

GitHub recommends no more than six pushes per minute per repository — one
every ten seconds. That is the binding constraint on this product's write
path, well before any API rate limit, and an editor that autosaves every few
seconds would exceed it while a single person types. Committing drafts would
also fill the repository's history with hundreds of commits per article, which
degrades every clone and every tree operation for as long as the repository
exists, and there is no way to un-write them afterwards.

Committing to a separate `drafts/` directory or branch was rejected: it keeps
the history of published posts clean but is subject to exactly the same push
rate, so it solves the wrong half of the problem.

The consequences are that a draft lives on one device in one browser and is
lost if that browser's storage is cleared, and that explicit saves must still
be debounced to at least ten seconds apart. Cross-device draft sync would need
a store outside the repository, which this project does not have and has
deliberately not added.
