---
status: accepted
---

# Cap comments at the shape GitHub Discussions stores

Reader comments live on GitHub Discussions, so the product could either expose
what GitHub already stores or build something richer on top of it. We chose the
former: the comment model this product offers is GitHub's, and we add nothing to
it that GitHub would not round-trip.

The reason is the same in every section below. A comment can be written on
GitHub directly, without ever passing through this application, so anything we
layer on top has to survive text an author typed into GitHub's own interface.
A structure only we understand is a structure that is wrong whenever someone
uses the platform we chose to build on.

Every figure below was confirmed against the live GraphQL API on 2026-08-22,
except where a paragraph says otherwise. Identifiers are elided from the quoted
responses; the probes ran against a throwaway repository.

## Replies are two levels deep

A discussion holds top-level comments, and each top-level comment holds replies.
A reply holds nothing. Posting the third level fails:

```
"type": "UNPROCESSABLE",
"message": "Parent comment is already in a thread, cannot reply to it"
```

The read shape agrees. `Discussion.comments` returns only the top-level
comments — the reply posted in the same probe is absent from that connection —
and each of them carries its own `replies` connection. A reply's own node
carries no further replies beneath it.

GitHub does not publish this ceiling. Its documentation describes `replyToId`
only as "The node ID of the discussion comment to reply to. If absent, the
created comment will be a top-level comment," and states no maximum depth
anywhere we could find (read 2026-08-22). The ceiling is therefore observed
rather than documented, and it can move without notice — a change that depends
on it MUST re-probe rather than trust this record.

We capped the product at those two levels rather than representing a deeper
tree. Representing one is possible: a reply's body could carry a marker naming
its real parent, and this application could rebuild the tree on read. It was
rejected because it puts a parsing contract into text that readers type by hand
and authors edit on GitHub. The first comment written through GitHub's own
interface would carry no marker, and the tree would be wrong from then on. A
representation that only holds while everyone uses our API is not a
representation of a repository we do not control.

## Which token performs which write

| Write | Token |
| ----- | ----- |
| Creating a **comment thread** that does not exist yet | the **installation access token** |
| Posting a top-level **reader comment** | that reader's **user access token** |
| Posting a reply | that reader's **user access token** |

The first row is the one write the security conventions allow on the
application's own identity, so that the first reader to comment does not become
the person who opened the discussion. The other two carry the reader's own name
and count against the reader's own quota.

The companion app must therefore hold the **Discussions** repository permission
at write level. That is a registration-time decision, which is why this spike
ran before comments are built.

All three mutations were confirmed to succeed. What was **not** exercised is
which identity performed them: every probe ran with a fine-grained personal
access token belonging to the repository's own owner. Neither an installation
access token nor a reader who is not a collaborator was tested. The token
column above is what the permission model says, not what this run observed, and
a change that turns it on MUST verify it against the real identities.

## What a blog backed by a private repository reports

A user access token reaches only what the person and the app can both reach.
That is how the token's scope is defined, so no arrangement of the flow changes
it, and a reader who is not a collaborator on a private repository cannot post
to its discussions.

The operative condition is *access*, not privacy. A discussion was created and
commented on inside a private repository during this probe, using a token that
reached it — privacy alone stops nothing. What stops a reader is that they are
not the one holding that access.

So a blog backed by a private repository reports comments as **unavailable**,
and says that the repository's visibility is why. It MUST NOT show an empty
thread, which reads as "nobody has commented", and MUST NOT surface an
authorization error, which reads as a fault. This holds whether the product
supports private repositories or not: while it does not, the case never arises;
when it does, it is a per-blog difference in what the blog can offer.

## GitHub stores a comment exactly as written and sanitizes only when rendering

A comment carrying raw HTML, dangerous link schemes, and every Markdown
construct outside the intended subset was posted and read back. Two things came
out of it.

`body` returned **byte-identical** to what was sent — `<script>` tags,
`javascript:` links, `onerror` attributes and all. GitHub does not sanitize what
it stores.

`bodyHTML` — GitHub's own rendering — is sanitized, and selectively rather than
wholesale. `<b>` and `<details>` survive as markup. `<script>`, `<iframe>`, and
`<style>` come back escaped. An `<img>` keeps its tag but loses its `onerror`
attribute, and is reissued through GitHub's image proxy. An anchor whose href is
`javascript:`, `data:`, or `vbscript:` loses the anchor entirely, leaving only
its text.

The subset this product intends to expose — bold, italics, and links — is not
exempt from either half of that. All three store verbatim; `**bold**` renders as
`<strong>` and `*italic*` as `<em>` untouched; and a link comes back as
`<a href="…" rel="nofollow">`, with the `rel` **added** by GitHub. Nothing in
the subset is rejected, but the link is rewritten, and rewritten only on
GitHub's side: a consumer reading the stored Markdown sees no `rel` at all and
must add it itself.

A bare URL is the same asymmetry in the other direction. It stays bare text in
storage and renders as a link anyway, so validation written against link
*syntax* does not limit links — a rule about links has to act on what a renderer
will produce rather than on what the reader typed.

This product serves Markdown rather than GitHub's HTML, so what a consumer
receives is `body` — the unsanitized one. The read-path neutralization the
comment-subset work specifies is therefore not a second line of defence behind
GitHub's: it is the **only** sanitization between a stranger's text and a
consumer's renderer. Nothing upstream of it does the job.

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
