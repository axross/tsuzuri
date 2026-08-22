---
status: accepted
---

# Cap comments at the shape GitHub Discussions stores

Reader comments live on GitHub Discussions, so the product could either expose
what GitHub already stores or build something richer on top of it. We chose the
former: the comment model this product offers is GitHub's, and we add nothing to
it that GitHub would not round-trip.

One fact drove most of what follows. A comment can be written on GitHub
directly, without ever passing through this application, so anything we layer on
top has to survive text an author typed into GitHub's own interface. A structure
only we understand is a structure that is wrong whenever someone uses the
platform we chose to build on.

## Replies stop at two levels because we did not fake a third

The platform imposes a ceiling on how deep a reply can sit. The platform limits
document states what it is, how it was measured, and what a write past it
returns.

We took the cap as the product's own rather than representing a deeper tree on
top of it. Representing one is possible: a reply's body could carry a marker
naming its real parent, and this application could rebuild the tree on read. It
was rejected because it puts a parsing contract into text that readers type by
hand and authors edit on GitHub. The first comment written through GitHub's own
interface would carry no marker, and the tree would be wrong from then on. A
representation that only holds while everyone uses our API is not a
representation of a repository we do not control.

## Serve the Markdown, and own the sanitization that comes with it

GitHub keeps two representations of a comment: the source a reader wrote, and
GitHub's own rendering of it. We could have served either, and the platform
limits document records what each one actually contains.

We chose the source. A consumer site renders comments into its own page, in its
own design, and handing it GitHub's HTML would mean handing it GitHub's markup
decisions, GitHub's class names, and GitHub's image proxy along with them. That
is a rendering this product does not control and cannot restyle, which
contradicts the whole reason it serves data rather than pages.

The price is the whole of the sanitization burden: of the two, we chose the
representation GitHub does not clean, which the platform limits document states
in full. The read-path neutralization the comment-subset work specifies is
therefore not a second line of defence behind GitHub's — it is the only line,
and nothing upstream of it does the job. That was the cost accepted, not an
oversight to be discovered later.

Serving GitHub's rendering instead was rejected on the styling loss above.
Serving both, and letting each consumer pick, was rejected too: it doubles the
contract and guarantees that some consumer renders the unsanitized one anyway.

## Moderation belongs to the author's GitHub workflow

This product offers none. Deleting a comment, hiding it, and locking a thread
are done by the author on the Discussion itself, with GitHub's own tools and
GitHub's own record of who did what.

We chose that because the alternative is reimplementing a moderation surface,
its permission checks, and its audit trail for content that is already sitting
in a place the author has an account on and administers. The cost is that an
author moderating a comment leaves this application and comes back; the benefit
is that comments stay a read-and-post feature here, and that the moderation
that does happen is attributable on the platform where the comment lives.
