---
status: accepted
---

# Hold in-flight upload chunks in a managed key-value store

`2026-08-21-host-on-vercel-and-split-media-transfer.md` accepted chunking
media transfer as the price of the Vercel body cap, and left the chunk size,
the intermediate store, the write sequence, and whether the download
direction needed the same treatment as open questions for issue #6 to settle.
That issue ran a spike that measured the mechanism end to end — a byte-exact
bisect of the body cap, a joined 50 MB upload through to an attempted
committed blob, a mid-upload abandonment, and both a buffered and a streamed
download — on this pull request's preview deployment, against a throwaway
scratch repository, `axross/tsuzuri-spike-scratch`, deleted once the
measurement was reported. This record is written from that measurement. The
maintainer chose a managed key-value store, added through the Vercel
Marketplace, as the place an in-flight upload's chunks live, over the
alternatives weighed below.

Vercel's own current documentation
([vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations),
read 2026-08-22) states the cap as "4.5 MB" on a Function's request and
response bodies alike, with no byte figure — so the spike measured it
directly rather than assuming 4,500,000 or 4,718,592. A byte-exact bisect
against a do-nothing echo route found the largest accepted request body at
4,493,986 bytes with ordinary headers, and 4,492,478 bytes once a 2,000-byte
header value was added: a delta of 1,508 bytes, smaller than the header value
itself because HTTP/2's HPACK compresses it in transit, which is why the
accounting has to be read as wire-encoded size rather than logical size.
Request headers therefore count against the same budget as the body. Base64
does not enter this arithmetic at all: chunks travel the browser-to-Function
hop as raw bytes, not base64 — encoding is forced only at the GitHub
boundary, where the Git Blobs API takes base64 or UTF-8 content, never on the
hop this budget governs. Against a ~4,493,986-byte budget, 4 MiB (4,194,304
bytes) leaves about 300 KB of headroom for whatever the request's own headers
cost; that is the chunk size the measurement used, and the one this decision
adopts.

The bisect ran against a route that does nothing but read and discard its
body, so what it found is the platform's own ceiling rather than anything
application code adds. Every probe in the spike, including this one, refused
redirects (`redirect: "manual"`): an earlier run had been voided because
Node's `fetch` silently followed a 302 that Vercel Authentication served in
front of the preview URL to a vercel.com login page, and returned that page's
200 — indistinguishable from a successful upload unless redirects are
refused.

An in-flight upload's chunks are held in a managed key-value store reached
through the Vercel Marketplace, keyed by an upload id the client generates
and keeps, and reclaimed by a time-to-live rather than by an explicit delete
call the application must remember to make. #3, the state-placement spike,
adopts this as a fixed constraint for its own kinds of state rather than
reopening the choice.

The chunk phase touches only the store: a chunk lands in the key-value store
keyed by upload id and index, and nothing about receiving it calls GitHub.
Completion — reached once the client reports every chunk sent — reassembles
the chunks from the store, verifies the reassembled bytes against the
declared hash, re-encodes the result (issue #5's own decision, not this
one's, and not reopened here), mints one installation token, and then makes
the sequence of GitHub writes that token authorizes. Because the chunk phase
never touches GitHub, that mint happens once, immediately before the writes
that use it, which is exactly what `docs/conventions/security.md` already
requires — mint immediately before the request that uses it, and never reuse
one across a lengthy sequence. The rejected Git-blob alternative could not
offer that as cleanly: turning each chunk into a Git blob as it arrived means
the chunk phase itself touches GitHub on every request, spread across
whatever wall-clock window the user takes to send them, which forces either
minting a fresh token per chunk (the measured run's own per-chunk token mint
cost 0.17–0.33 s, paid thirteen times) or holding one token across a window
an hour-long expiry can outlast.

With chunks in the store, an abandoned upload is reclaimed by the store's own
TTL: nothing about it ever reached the user's repository, so there is nothing
there to clean up. That is the direct contrast to what the spike measured for
the Git-blob alternative: sending seven of thirteen chunks (28 MiB) and then
stopping left all seven blobs still reachable by SHA afterward, at their full
4,194,304 bytes each, with no call the application can make that removes
them.

Re-encoding under 1 MB is not an optimization this mechanism could skip; it
is what makes committing the source possible at all, independent of how the
bytes got there. GitHub's own documentation
([docs.github.com/en/rest/git/blobs](https://docs.github.com/en/rest/git/blobs),
read 2026-08-22) states a 100 MB limit for reading a blob back and documents
no limit on creating one. The measured run's own completion attempt tried to
commit the reassembled 50 MB as one Git blob and was refused outright, HTTP
422, with GitHub's own message that the input was too large to process and
its suggested remedy — pushing from a local clone — unavailable to a
serverless function. A bisect of the creation path specifically, at 1 MiB
resolution, found the actual ceiling undocumented and far below the read
limit: 39 MiB accepted, 40 MiB refused. A 50 MB source can never be committed
as one blob, whatever carries its bytes there.

The download direction needs no chunking. Buffered responses (sent with an
explicit `Content-Length`) up to 64 MiB and streamed responses (no
`Content-Length`) up to 200 MiB were both delivered in full, body length
verified rather than only status checked; the documented 4.5 MB response cap
([vercel.com/docs/errors/FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE](https://vercel.com/docs/errors/FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE),
read 2026-08-22) was not reproducible at any size tried, in either mode. One
caveat travels with that finding: on the Node runtime a `new Response(Buffer)`
may still be sent as a stream by the underlying server, so "buffered" here
means "sent with an explicit `Content-Length`," not "provably held whole in
memory" — the finding that nothing refused a large response holds regardless,
but the mechanism by which the buffered cases avoided the cap is not fully
pinned down.

The joined run moved a 50 MB fixture through the chosen chunk size end to
end: 26.31 s of transport over 13 requests, then a 4.88 s completion stage,
31.18 s total. The reassembled bytes matched the source by SHA-256 —
reassembly is byte-exact — which is the part of that run this decision rests
on. The completion stage's own attempt to then commit the full reassembled
bytes as one blob is the 422 already reported above under re-encoding, not
evidence about this decision's own completion path, which re-encodes before
that write rather than after it. The run wrote its chunks as individual Git
blobs rather than to a key-value store, because the same run also had to
produce the abandonment and blob-ceiling observations above; a chunk's
landing time in the eventual key-value store was not itself measured, and is
carried below as a residual risk rather than assumed to be faster.

Six alternatives were weighed against the store this decision adopts.
Unreferenced Git blobs in the linked repository were rejected on the residue
measured directly above: nothing in this application reclaims them, and
GitHub's own account of unreachable-object handling — cruft packs, pruned on
an unpublished schedule
([GitHub Engineering: Scaling Git's garbage collection](https://github.blog/engineering/architecture-optimization/scaling-gits-garbage-collection/),
read 2026-08-22) — gives no bound to reopen the option against; reopening it
would need GitHub to publish a retention period or an application-triggerable
way to reclaim an unreferenced object, neither of which exists today. A
short-lived branch in the linked repository was rejected for the same
residue: deleting a ref only makes its objects unreachable, which is already
what an abandoned chunk-blob is, so the branch buys nothing a plain blob did
not already have. The Function instance's own `/tmp` was rejected because it
does not survive across invocations, Fluid compute's instance reuse
notwithstanding. Next.js's own cache primitives were rejected because they
are a read cache, not a binary write-through store, and chunks are exactly
the kind of write this mechanism needs held. Client-side re-encoding before
upload — which would put the whole source under the single-request budget in
one step and remove the need for any intermediate store — was considered and
not taken, because where re-encoding happens is issue #5's decision and this
record does not reach past it to decide that this spike's mechanism should be
replaced rather than adopted; if #5 settles on client-side re-encoding, this
mechanism is the one to reopen. Vercel Blob, in both an intermediate-store
form and a presigned direct-to-storage form that would have removed the 4.5
MB problem outright, was excluded by the maintainer at this plan's approval
gate rather than left unexamined; reopening it is the maintainer's call to
make again, not a technical finding this record can supply.

This decision adds a vendor and a recurring bill, and it sits in real tension
with this project's own stated premise — carried in `README.md` and
`AGENTS.md` — that it adds no persistence layer of its own and that the
linked repository is the only source of truth. That tension is accepted here
rather than smoothed over. What stays true despite it: the store holds only
chunks of an upload still in flight, never a post or a media object once
committed, so losing the store fails an upload in progress rather than losing
anything the linked repository already has. `README.md` and `AGENTS.md` will
need revisiting once the store is actually added — their descriptions of this
project's stack and its no-persistence-layer premise both currently describe
a project with no such vendor — but neither is wrong yet, because the store
does not exist yet: this change decides what #3's implementation is to add,
it does not add it. That revisit belongs to the change that actually wires
the store in.

Resumability is costed here rather than built. With chunks keyed by upload id
and index in a store the server can query, the client can keep the upload id
across a page reload, ask which indices the server already has, and resend
only what is missing rather than the whole source. Building that costs an
endpoint that reports presence per index, client logic to resume from a
partial chunk list, and a chunk lifetime in the store long enough to outlast
a single request, which a store already reclaiming by TTL can offer without
redesign — none of which this record builds.

This record fixes the kind of store, not the vendor: which managed
key-value product to add through the Vercel Marketplace, its pricing, its
actual TTL and read/write latency, and its own per-operation limits against
this project's expected upload volume were not measured and are left to the
change that adds it. The joined measurement above exercised Git blobs as the
per-chunk landing point rather than a key-value store, so its transport and
completion timings describe that path, not the one this decision adopts; a
chunk write into the eventual store is expected to be faster than the Git
blob write the measured per-chunk time was dominated by (0.7–2.1 s per
chunk), but that expectation was not measured and is not evidence.
