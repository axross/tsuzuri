# Product vocabulary

## Repository backend

**Linked repository** — the GitHub repository a user has connected to this
application, holding every **post**, **media object**, and metadata file the
blog is built from. It is the blog's only source of truth; nothing this
application stores elsewhere survives being thrown away.

**Post** — one blog article, kept as a single Markdown file in the **linked
repository**, opening with **front matter**.

**Front matter** — the metadata block at the head of a **post** file, carrying
what the article itself is not: its title, its publication date, its tags.

**Body node** — one root-level unit of a **post**'s body, such as a heading, a
paragraph, a list, or a table. It is what a **node address** names.

**Node address** — the identifier an agent uses to name one **body node** for
a targeted edit: the node's position among its siblings and its type, plus a
digest of the node and a digest of the whole **post** file it was read from.

**Media object** — an image or other binary a **post** embeds, kept in the
**linked repository** at a **content-addressed path**.

**Content-addressed path** — the location a **media object** takes, derived
from a hash of its own bytes rather than from a name someone chose, so
identical bytes land in one place and a renamed **post** never moves its
media.

**Post index** — the listing of every **post** with the **front matter** a
reader browses by, derived from the **linked repository** rather than stored
in it, and rebuilt from that repository whenever it is lost.

**Delivery cache** — the layer this application serves readers from, holding
what it derived from the **linked repository** so that a page view does not
become a GitHub request.

## Identity and access

**Companion app** — the GitHub App a user installs to connect a **linked
repository** to this application. It is the only channel through which this
application reaches GitHub on the user's behalf.

**Installation** — one grant of the **companion app** against a chosen set of
repositories, made by whoever owns them. It is what a user creates by
installing the app, and what they change when they revise which repositories
the app may see.

**Installation access token** — the short-lived credential this application
mints from an **installation** to act on the repositories that installation
covers. It carries the app's own identity, not any person's.

**User access token** — the short-lived credential a person grants this
application to act as themselves. It reaches only what both that person and
the **companion app** can already reach.

**Author** — the person who owns a **linked repository** and writes its
**posts**.

**Reader** — a person reading the published blog. A reader who leaves a
**reader comment** authenticates with their own GitHub account; one who only
reads needs no account at all.

## Comments

**Comment thread** — the GitHub Discussion that carries one **post**'s
**reader comments**, matched to that post by its slug.

**Reader comment** — a comment a **reader** posts into a **comment thread**
under their own GitHub identity, using their own **user access token**.

# Development vocabulary

## GitHub platform limits

**Text write path** — the way this application commits changes carrying no
binary: one GraphQL `createCommitOnBranch` mutation, atomic across files and
signed by GitHub.

**Media write path** — the way this application commits changes carrying a
**media object**: the REST Git Data API, which uploads each blob separately
and can reference one that already exists.

**Split media transfer** — the chunking this application applies to a **media
object** it is uploading, because the hosting platform caps a request body
below the sizes GitHub itself would accept. The download direction needs no
chunking.
