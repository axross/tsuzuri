---
status: accepted
---

# Re-encode uploads with sharp to WebP at a 2000px long edge

Storing media in the linked repository is only defensible if an uploaded image
is re-encoded under the size GitHub recommends an object stay below, and that
re-encoding has to run on a Vercel Function. This record settles what does the
re-encoding, what it produces, and what happens to the inputs that are not
photographs. Every figure below was measured on a preview deployment on
2026-08-22, not locally: local timings do not represent the deployed runtime.

**We re-encode with `sharp` 0.35.3, to WebP, at a 2000px long edge and quality
80.** One pass at that setting brought every input we tried under the target,
so the fallback ladder that steps quality and then dimensions down was never
needed on any of them.

## What the Measurements Say

Each figure is the median of three serialised runs against the deployed
preview. Peak memory is this function's own resident set, sampled in-process
on a 25ms interval — it is not a figure the platform reported, and the two are
not interchangeable.

| Input | Source | Output | Duration | Peak RSS |
| ----- | ------ | ------ | -------- | -------- |
| Photograph, 7952×5304 | 54.3 MB JPEG | 226 KB, 2000×1334 | 1.6 s | 505 MB |
| Phone photograph, 4032×3024 | 4.3 MB JPEG | 684 KB, 2000×1500 | 0.9 s | 342 MB |
| Screenshot, 1920×1080 | 757 KB PNG | 348 KB, unchanged | 0.4 s | 324 MB |
| Logo with transparency, 4020×1601 | 111 KB PNG | 77 KB, 2000×797 | 0.6 s | 350 MB |
| Animated GIF, 300×200, 15 frames | 568 KB | 95 KB, 15 frames | 0.2 s | 323 MB |
| Small photograph, 1500×1000 | 44.7 KB JPEG | 30 KB, unchanged | 0.2 s | 227 MB |

The largest output is the 12-megapixel phone photograph at 684 KB, not the
54 MB one. A 54 MB source is a large, smooth scene that downsamples cheaply; a
phone photograph of a detailed street scene does not. Sizing the policy against
the biggest *file* would have been the wrong instinct.

The worst peak `sharp` reached in any run was 779 MB, on the 54 MB photograph
encoded to AVIF; the AVIF table below carries the rest. A function on this
plan gets **2 GB** by default and can be configured up to **4 GB**, so the
worst case leaves around 1.2 GB unused and there is a second lever beyond
that. Duration is not close to a limit either: the slowest WebP run was 1.6 s
against a **300 s** default, itself raisable to **800 s**. One rejected
candidate ran hotter than `sharp` ever did — see `@cf-wasm/photon` below — so
779 MB is the chosen encoder's ceiling, not the spike's.

## Why WebP and Not AVIF

The convention this project already carries names WebP or AVIF as
interchangeable. They are not, on this workload:

| Input | WebP | AVIF | AVIF peak RSS |
| ----- | ---- | ---- | ------------- |
| Phone photograph | 684 KB in 0.9 s | 838 KB in 29.6 s | 684 MB |
| 54 MB photograph | 226 KB in 1.6 s | 297 KB in 15.0 s | 779 MB |
| Screenshot | 348 KB in 0.4 s | 317 KB in 10.8 s | 640 MB |
| Logo with transparency | 77 KB in 0.6 s | 64 KB in 4.5 s | 571 MB |
| Small photograph | 30 KB in 0.2 s | 43 KB in 4.8 s | 514 MB |

The WebP peaks are in the table above; AVIF costs more memory as well as more
time, on every input.

At the same nominal quality AVIF is between 7× and 33× slower and, on the two
photographs that matter most, larger. It wins slightly on the screenshot and
the logo — the two inputs already far under the target, where winning is worth
nothing. A quality number does not mean the same thing to both encoders, so a
tuned AVIF would land differently; what this rules out is adopting AVIF at the
same setting and expecting it to be free. JPEG was measured too, for a floor:
778 KB on the phone photograph in 0.5 s at a 635 MB peak — worse than WebP on
size while being no more compatible than WebP now is.

## Why Not the Other Encoders

Three of the four candidates failed on the deployed runtime rather than merely
scoring worse, which is the kind of thing only a deployed measurement finds.

**`wasm-vips` 0.0.18 hangs.** A 44 KB input returned
`FUNCTION_INVOCATION_TIMEOUT` after 801 seconds — the configured ceiling, not a
slow encode. Reproduced twice. Nothing about its build output suggests this;
it compiles and deploys cleanly.

**`@jsquash/*` cannot load its own WebAssembly.** Every codec call fails with
`TypeError: fetch failed`, because the Emscripten glue resolves its `.wasm`
beside the module and hands the resulting `file://` URL to `fetch`, which Node
refuses. Predicted from a local reproduction and then confirmed on the
deployed function against JPEG and PNG inputs alike. Two documented escape
hatches remain — a per-codec literal `new URL(...)`, or enabling asynchronous
WebAssembly in the framework configuration — so this is a "not without extra
configuration", not a "never". It also has no GIF decoder at all.

**`@cf-wasm/photon` 0.4.0 ignores quality.** It runs, but its WebP encoder
takes no quality argument and emits something close to lossless. It also
exposes no AVIF encoder. In full, against the same six inputs:

| Input | Output | Duration | Peak RSS |
| ----- | ------ | -------- | -------- |
| Photograph, 54.3 MB | 3.39 MB | 6.1 s | 833 MB |
| Phone photograph, 4.3 MB | 4.02 MB | 1.7 s | 869 MB |
| Screenshot, 757 KB | 900 KB | 0.1 s | 768 MB |
| Logo with transparency, 111 KB | 152 KB | 0.7 s | 768 MB |
| Animated GIF, 568 KB | 35 KB, 1 frame | 0.004 s | 768 MB |
| Small photograph, 44.7 KB | 369 KB | 0.07 s | 666 MB |

Three of the six came out **larger** than they went in. The two photographs
missed the target by three and four times over. Its 869 MB peak is the highest
figure this spike recorded from any encoder, and it dropped the GIF's
animation, returning a single 300×200 frame where `sharp` returned all fifteen
— which is why that row is both the smallest output and the fastest run in the
table. It is quick on small inputs, and only on those: it beats `sharp` on the
screenshot, the GIF, and the small photograph, and loses badly where it
matters, taking 6.1 s on the 54 MB photograph against `sharp`'s 1.6 s. Speed
on the easy inputs is not worth an encoder that cannot hit the size the whole
design depends on.

`@squoosh/lib` was excluded without measurement; its most recent release is
from January 2023.

What each candidate costs in bundle size, summed from the build's own
dependency trace on a local build: `sharp` 46.74 MB, `@jsquash/*` 9.90 MB,
`wasm-vips` 6.74 MB, `@cf-wasm/photon` 3.73 MB. `sharp` is by far the largest
because it ships a native libvips binary, and at 46.74 MB it still uses under
a fifth of the platform's **250 MB** uncompressed bundle ceiling. All four
deployed successfully, which is the deployed evidence that none of them
exceeds it; the per-candidate split is a local measurement, because the deploy
does not print per-function sizes.

## What Happens to Each Kind of Input

**Transparency is preserved.** The transparent PNG came back as a four-channel
WebP whose alpha channel still reaches zero — genuinely transparent pixels, not
a flattened background.

**Animation is preserved.** The 15-frame GIF came back as a 15-frame WebP with
its 15 frame delays intact, at 95 KB. This needs `sharp` to be told to read
every page of a multi-page source; the default reads the first frame only and
would silently turn an animation into a still.

**An image already under the target is re-encoded anyway.** The 44.7 KB
photograph became a 30 KB WebP. Committing it untouched would have been
defensible, but a second code path that sometimes stores the original means two
formats to serve, two things to test, and a decision to make per upload. One
path is worth 15 KB.

**Nothing hit the fallback.** Because no input needed a second rung, the
behaviour when one cannot be brought under the target is a design decision
rather than a measured one, and we settle it here: walk the ladder — quality
down to 60, then the long edge to 1600 and 1280 — and **reject the upload** if
the last rung still exceeds the target, telling the author the image could not
be made small enough and to crop or resize it. We do not commit an oversized
object. The whole justification for keeping media in the repository is that
what lands there respects the platform's advice; an escape hatch that quietly
commits a 3 MB object dissolves it. Since no input we tried came close, the
rejection path should be rare enough that the strict choice costs little — but
it is unmeasured, and the first real corpus may say otherwise.

## What This Leaves Open

`sharp` takes per-call quality and dimension arguments, so letting an author
override the output for one image is possible without changing the encoder.
Whether to offer it belongs to the media milestone; nothing here forecloses it.

Two figures are weaker than the rest and should not be read as strong. Peak
memory is sampled from inside the function, and the deployed runtime does not
expose its own configured memory to the code — the variable that would carry it
is among those made inaccessible by the compute mode this project runs under —
so headroom is stated against the plan's documented default rather than against
a value read back at runtime. And every duration was measured on a warm
instance; a cold start adds an unmeasured amount on top.

Platform limits cited here come from `vercel.com/docs/functions/limitations`,
read on 2026-08-22. They move without notice, so a change that turns on one of
them should re-read that page rather than trust this record.
