---
status: accepted
---

# Bind a node address to the body revision it was read from

An agent editing a post through MCP needs to change one part of the body
without loading the whole article, which means it needs a way to name that
part — a node address — that a later write can present back. Saving already
carries a file-level guard: the write path verifies the branch head server
side, in the same call that writes, so two editors cannot silently overwrite
each other's whole file. That guard says nothing about what happens inside
the file. A body can change between an agent's read and its write in ways the
file-level guard never sees, and a node address has to have an answer for
every one of them: resolve to the exact node the agent read, or refuse.
Landing on a different node is not an acceptable third outcome, because the
agent would then apply its write to content it never saw.

## The chosen scheme

We chose to bind the address to the revision it was read from, and to refuse
it outright whenever that revision has moved.

A node is a root-level child of the body's Markdown syntax tree, minus the
front-matter node — a heading, a paragraph, a list, a table, and so on. A node
address is four values: the node's index among its siblings, its type, a
sha256 digest of its own source bytes, and a sha256 digest of the post file it
was read from.

That last value is called the **document digest** throughout what follows, and
it covers the post file's stored bytes in full — front matter included, even
though no node ever addresses front matter. Covering only the body below the
front matter would be the more obvious reading and is the wrong one: a node's
offsets are absolute positions in the file, so editing front matter to a
different length shifts every one of them. Including front matter in the
digest is what makes a metadata edit invalidate outstanding node addresses,
which is the correct outcome and would not happen otherwise.

An address is honoured only when the current document digest matches the one
it carries; if it does not, the address is refused outright, without
attempting to locate the node by any other means. Once the digest matches, the
index is exact by construction — the file has not changed since it was read —
and the node digest and type are checked as an internal consistency
cross-check, not as the thing providing safety.

An edit is applied as a structural operation, not a rewrite of the tree:
replace, insert-before, or delete, each expressed by splicing the node's
byte range out of the source rather than by re-serializing the parsed tree.
A replace is `body.slice(0, start) + newMarkdown + body.slice(end)`; an
insert-before places new source ahead of `start` together with its own
trailing separator; a delete removes the node's range together with one
adjoining blank-line separator so it does not leave a double gap.

## Why the four other candidates were rejected

Four candidates were run against 17 concurrent-edit scenarios apiece, across
three fixture documents, counting a misfire as an address resolving to a node
other than the one the agent read:

| Scheme | Misfires |
| --- | --- |
| Heading path | 6 / 17 |
| Ordinal node index | 6 / 17 |
| Content digest alone | 2 / 17 |
| Source offset range | 1 / 17 |
| Chosen scheme (refusing on any document-digest mismatch) | 0 / 17 |

**Heading path** — a node named by the path of headings above it, plus its
offset within that section — misfired on an insertion before it and on an
edit inside its own section, because either one shifts its offset within the
section without changing the path. It was also *refused* when an unrelated
heading elsewhere in the document was renamed, since the rename changes the
path of every node nested under it — a purely cosmetic edit invalidating
addresses it had no business touching. And it has no path at all for content
that precedes every heading, such as an opening paragraph before the first
section.

**Ordinal node index** — the node's position, counted from the top, and
nothing else — misfired on exactly the edits it was expected to: an
insertion or deletion earlier in the document shifts every later index
without changing anything about the node itself, so the same number
silently comes to mean a different node. This is the precise failure the
spike exists to rule out.

**Content digest alone** — a digest of the node's own source, with no index
attached — does not locate a node so much as recognize one, and it collided
whenever two nodes held identical source. Against a fixture built from two
headings each followed by the same paragraph, editing or deleting the second
occurrence still left the first occurrence's digest sitting in the document,
so the address resolved to the *first* paragraph — the wrong one — instead of
being refused.

**Source offset range** — the node's raw start and end byte position — is
exact against the document it was read from and is invalidated by any edit
above it, including one that changes nothing structurally, such as
lengthening an unrelated paragraph far above. Its one misfire came from a
different direction: the addressed node itself was edited to exactly the
same byte length, so its own offsets stayed valid by coincidence and the
range resolved to content that was no longer what the agent had read.

## The re-anchoring refinement, and why it was rejected too

A composite of index, node digest, and document digest looks safe if a
mismatched document digest triggers "re-anchoring" — searching the edited
body for the node whose digest still matches, on the theory that if the
digest is unique, it must be the same node relocated. That refinement was
tried and rejected: it inherits the content digest's collision. Against the
duplicate-paragraph fixture, editing or deleting the addressed occurrence
left its byte-identical twin in the document, the twin's digest was the only
one left matching, and the re-anchor logic landed the write on the twin —
two more misfires, on precisely the fixture built to surface this.

Tightening the rule to "re-anchor only if the digest was already unique in
the *original* document" does not rescue it. A concurrent edit can delete the
addressed node and, independently, produce a different node whose source
happens to equal it — a paragraph edited elsewhere into matching text, say.
The digest is then unique in the original document, unique again in the
edited one, and the re-anchor still lands on the wrong node. That scenario is
contrived, but the standard this spike set was that a misfire be impossible,
not merely unlikely, and re-anchoring by digest cannot meet it no matter how
the uniqueness check is tightened. The scheme that was chosen instead simply
refuses whenever the document digest does not match, rather than trying to
recover a node identity from content that duplication can always confuse.

## What each kind of concurrent edit does to an outstanding address

| Scenario | What happens to the addressed node | Resolution |
| --- | --- | --- |
| No edit; the write arrives against the same revision | Index, offsets, and node digest are exactly as read | Resolves — the address is exact by construction |
| An edit before the addressed node (e.g. a paragraph inserted earlier in the body) | The node's own content is untouched, but its index and byte offsets shift | Refused — the document digest no longer matches |
| An edit inside the addressed node | The node's source bytes, and its own digest, change | Refused |
| An edit that deletes the addressed node | The node no longer exists at that index | Refused |
| An edit that appends a byte-identical copy of the node elsewhere in the body | A second node now shares the original's node digest | Refused — resolution never searches by digest to find a node, only cross-checks one already located by index |

Across all 17 edited-document scenarios recorded, every one was refused and
none misfired. No scenario resolves to a node other than the one the address
names; the only two outcomes it produces are "the node exactly as read" and
"refused."

## A worked read response and write request

`nested-headings.md` is a small fixture used to derive the values below: YAML
front matter, an opening paragraph before any heading, two sections — `##
Setup` and `## Rollout` — each carrying a `### Notes` subheading with the same
title, a list, and a fenced code block whose contents look like Markdown but
are not parsed as such because they sit inside a code fence. Its body is 387
bytes, and its whole-body sha256 digest is
`3d2dd3c0bc35c3f30c444a2979d50fc78c81a99c1faaedac5b13e3d9a340c0c8`.

Reading node index 6 — the paragraph "Roll it out slowly." under `## Rollout`
— returns:

```json
{
  "documentDigest": "3d2dd3c0bc35c3f30c444a2979d50fc78c81a99c1faaedac5b13e3d9a340c0c8",
  "index": 6,
  "type": "paragraph",
  "start": 187,
  "end": 206,
  "nodeDigest": "8537af656ab8b095602c3124f6da0e3ff05c202437f9c74bea67d7b63c02a400",
  "markdown": "Roll it out slowly."
}
```

A write replacing that paragraph presents the same index and both digests
back, alongside the new content and the operation to perform:

```json
{
  "documentDigest": "3d2dd3c0bc35c3f30c444a2979d50fc78c81a99c1faaedac5b13e3d9a340c0c8",
  "index": 6,
  "nodeDigest": "8537af656ab8b095602c3124f6da0e3ff05c202437f9c74bea67d7b63c02a400",
  "operation": "replace",
  "markdown": "Roll it out over three days, staged by region."
}
```

If any other write had landed on this body in the meantime — anywhere in it,
not only inside this paragraph — the document digest would no longer match
and this write would be refused rather than applied.

## Untouched regions stay byte-identical because the edit splices bytes

Applying a replace by slicing the source at the node's own offsets, rather
than re-serializing the parsed tree, is what keeps everything outside the
edited node byte-for-byte the same. Splicing was verified against two
fixtures: the bytes before and after the edited node came back identical in
both, and in the fixture carrying a GFM table and a directive, the table
node and the directive node — neither one touched by the edit — came back
byte-identical as well. Re-serializing the tree would not have this
property; only slicing the original source does, because re-serialization
regenerates every node's formatting from the parsed representation rather
than leaving what it did not touch alone.

Node ranges do not cover the whole body: in a small probe document, node
ranges accounted for 59 of 63 bytes, because the blank line separating one
node from the next falls outside both nodes' ranges. That is exactly what
makes the splice safe — a replace never touches a separator it does not own,
an insert-before has to supply its own trailing separator, and a delete has
to absorb one adjoining separator itself, or it would leave a double gap
where the node used to be.

## What the parser has to guarantee

The scheme depends on three properties of whatever Markdown parser produces
the syntax tree, independent of which package supplies it. Every root-level
node must carry exact start and end byte offsets into the source, since the
node digest, the splice, and the address itself are all defined in terms of
those offsets. Every extension syntax actually in use in a body must be
recognized by the same parser that computes those offsets — a table or a
directive that the parser does not understand is not invalid, but every
offset downstream of a misread span would be wrong. And front matter must be
recognized as front matter, specifically, rather than left to fall through
to whatever the parser does with an unrecognized block.

That third property was measured directly, against a fixture carrying front
matter, a GFM table, and directives. Parsed without front-matter support,
its opening `---` fence is read as a thematic break and the line that
follows it as a setext heading — the metadata block is treated as body
syntax, every node index after it shifts by two, and every offset after it
shifts as well. Every address computed against that mis-parse would be
wrong from the very first node onward.

An unrecognized *body* extension is a materially smaller failure. Parsed
without table and directive support, that same fixture's GFM table
collapses into a single paragraph node and each directive collapses into a
paragraph node of its own — coarser, in that the internal structure of the
table or the directive is no longer separately addressable, but not
incorrect: the construct is still exactly one node, still carrying exact
start and end offsets, still addressable and splice-safe as a whole. Front
matter mis-parsing corrupts the document; an unrecognized body extension
only coarsens one node in it.

## Tables, directives, and unrecognized constructs

With the right extensions enabled, a GFM table is one addressable root node
of its own, and so is a block-level directive — a container directive and a
leaf directive both appear as their own node, each with exact offsets,
exactly like a heading or a paragraph. An inline directive is different in
kind: it lives inside the text of a paragraph rather than as a sibling of
one, so it is never a root-level node and is never separately addressable,
whether or not the parser recognizes directive syntax at all — editing it
means addressing and replacing the paragraph that contains it.

A construct the parser does not recognize at all — whether because the
relevant extension is missing or because the syntax is simply not
Markdown — still becomes some node with exact offsets, most often a
paragraph holding the raw text unparsed. It remains addressable by that
coarser node; nothing about an unrecognized construct breaks the addressing
scheme itself, only the granularity available inside it.

## What an agent does when its address is refused

A refusal means only that the body has moved since the address was read,
never that anything is wrong with the request. What an agent must do is
re-fetch the body's current structure and address the node again against
the fresh revision — there is no repair short of that, because the address
carries no information about what changed, only that something did.

That has a direct consequence for a sequence of writes against one read.
Simulated against a fixture, a first write using a freshly read address
succeeded; a second write reusing that same original address was refused,
because the first write had already moved the body — an agent can invalidate
its own address by writing once and trying to write again from the same
read. A second write built from the structure the *first write's own
response* handed back succeeded. So a write response has to return the
document's new digest and its new structure for the node just written, not
only confirmation that the write landed — without that, an agent has to
re-read the whole structure after every single write, defeating the purpose
of returning it inline in the first place.

## The per-node digest is not part of the address

One consequence of binding the address to the document digest is worth stating
because it is easy to get backwards: the per-node digest is a cross-check, not
a locator, so nothing needs it in order to address a node. The document digest
together with the index is already the whole address. The node digest earns
its place in the response to reading one specific node, where it confirms that
the node the caller thinks it read is the one the index names; it has no work
to do anywhere a node is merely being listed.

That matters because a digest is not cheap to carry. A sha256 rendered as hex
is sixty-four characters per node, which against a measurement post of eighty
nodes and 24,940 bytes — forty sections of prose, each a heading and a
paragraph — came to 8,645 bytes for a listing carrying one digest per node,
against 3,165 bytes for the same listing carrying each node's index, type and
byte count alone. Whether a listing is worth returning at all, and what else
it should carry, is a read-path question this record deliberately leaves open.

## MCP-only, not the public API

The scheme is exposed through MCP tools only; the public REST API contract
carries no part of it — no node index, no node digest, no structural
operation. The addressing scheme exists to let an agent economize on
context by touching one node instead of holding an entire article; a REST
consumer that fetches a post already receives its full body in the
response, so it has no analogous problem for node addressing to solve. The
consequence accepted is that extending this to REST later, should a need for
it appear, is new contract surface to design and version, not a change to a
contract that already carries some form of it today.

## Consequences

Any concurrent edit anywhere in the body invalidates every outstanding
address on it, not only an edit to the node the address names. This is
deliberate: the alternative is trying to prove an edit elsewhere in the
document could not possibly affect the addressed node, which is exactly the
proof the rejected schemes could not produce.

An agent holding a structure listing must re-fetch it after any edit lands
from elsewhere — another tool call, another session, a human editing the
same post — because nothing short of a fresh read tells it its addresses are
still good. And a write response must return the document's new digest and
the structure of the node it just changed, or every write after the first
in a sequence forces a full re-read to stay usable.
