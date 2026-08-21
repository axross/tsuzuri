---
status: accepted
---

# Serve media from our own cache rather than GitHub's raw host

With media committed to a public repository, `raw.githubusercontent.com`
serves it for free, needs no authentication, and costs us no bandwidth. It was
the cheapest delivery path available and we deliberately did not take it.

We chose to serve every byte through this application's own cache layer, with
GitHub read only on a cache miss.

The raw host was rejected because it is the one part of this architecture with
a real precedent of being shut off. It is not a CDN, it rate-limits by IP, and
pages hotlinking many images from it are already observed getting HTTP 429
with individually-loadable images and broken thumbnails. GitHub's Acceptable
Use Policy reserves the right to throttle file hosting or suspend an account
over exactly this pattern, and RawGit's own shutdown notice warned that
sustained traffic could get a whole GitHub account blocked.

That is worth separating from the previous decision carefully, because the two
get conflated: storing media in a repository is a pattern GitHub's own
documentation endorses, and serving production traffic from its raw host is
not. Keeping them apart is what lets us do the first without incurring the
risk of the second.

jsDelivr was considered as a middle path — it supports GitHub repositories
officially and is a real CDN — and rejected because it makes a third party a
hard dependency of every page load. Its own package-size ceiling counted
against it too, though the decision did not rest on that figure.

The consequences: we operate a cache layer and pay for its egress, and GitHub
sees a read volume proportional to how often content changes rather than to
how often it is read. We also have to rewrite raw URLs that appear in post
content, because an author writing Markdown by hand will paste one eventually,
and a single hotlinked image would reintroduce the risk this decision exists
to remove.
