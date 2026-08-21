---
status: accepted
---

# Derive the post index instead of committing it

Listing posts by date, tag, or title without parsing every Markdown file on
every request needs an index. The question was where it lives: committed into
the repository beside the posts, or derived into our cache.

Committing it is genuinely attractive. The index would update in the same
atomic commit as the post it describes, so the two could never disagree, and
the repository would stay self-describing — clone it and everything needed to
render the blog is there.

We chose to derive it into the cache instead, on one argument that outweighs
both.

Half the value of using a repository as a backend is that the author can write
locally and `git push`, or edit a file in GitHub's web UI. Any of those
bypasses this application entirely — and a committed index goes stale the
instant one happens. We would then be validating the index against the posts
on every read, which is the work the index existed to avoid, or shipping a
product where hand-editing quietly corrupts the listing.

Deriving it also removes a self-inflicted problem: an index-updating commit
fires our own push webhook, so the thing that keeps the index current is also
a thing that can loop.

The consequences are that the index is not portable — a clone of the
repository has the posts but not the listing, which must be rebuilt — and that
we depend on a cache layer being present. We accept the first because the
posts are the artifact worth keeping portable. The second costs nothing we
were not already paying, because the index is a derived artifact by
construction: losing it is a rebuild, never a data loss, so it needs no
durable, billable store to live in.
