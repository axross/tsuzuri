---
status: accepted
---

# Build the logger on the platform console rather than on pino

This project's logger **must not depend on Node-specific runtime APIs** —
`process.stdout`, a raw file descriptor, or `worker_threads` — and it
satisfies that constraint by being a **project-owned module that emits one
JSON line per record through the platform console**:
`console[level](JSON.stringify(record))`. Both halves are decided now, on the
strength of what #69 measured against a deployed Worker, not on an assumption
about which platform this project ends up hosted on.

**Why now, without deciding the platform.** #67, #68, #69 and #70 are open
spikes and the hosting question stays undecided; nothing here presupposes
Cloudflare. `console[level](JSON.stringify(record))` is not a Workers-specific
construction — it yields JSON on Node's own console and on `workerd` alike, so
the constraint can be adopted while the platform question is still open, and
whichever platform is eventually chosen inherits a logger that already
satisfies it rather than one that has to be redone.

**What #69 measured, on a deployed paid-plan Worker.** Two independent
failures, not one. Under Wrangler's default resolution, pino 10.3.1 resolves
to its `browser` entry — established from the bundle's own source map, not
inferred — and that entry "calls per-level `console` methods with the raw
arguments"; there is "no `JSON.stringify` anywhere in that file." It emits no
JSON at all, and the module's own comment ("Writes structured JSON to stdout
with no transport configured") describes a codepath that never runs on this
build. Forced to its `main` entry through `WRANGLER_BUILD_CONDITIONS=""` and
`WRANGLER_BUILD_PLATFORM="node"`, pino does emit correct JSON, but every line
arrives wrapped: `{"message":"stdout: {\"level\":30,\"time\":...,\"module\":
\"spike\",\"msg\":\"spike child-logger line\"}"}` — the entire record trapped
inside one string value, with **no `level` key at all**
(`$metadata.level` was `null`). Field extraction confirms the consequence
rather than leaving it to impression: filtering Workers Logs on
`module = "spike"` returned **4** matches on the browser-build Worker and
**0** on the Node-build one.

**The decisive argument is not "pino breaks."** Under default resolution pino
does not break — it works, and Workers Logs indexes it, at `module = "spike"`
returning those 4 matches. The reasons to leave it anyway sit past that fact.
First, what runs is not what `logger.ts` says runs: the comment promises
structured JSON to stdout, and the bundle that actually ships calls bare
`console` methods with unstructured arguments — the fields that survive do so
because Cloudflare's own extraction builds the record, not because pino
wrote one. Second, fields the current logger emits are simply gone on that
build — `time`, `pid`, `hostname`, and pino's numeric `level` convention
(30/40/50) all disappear, replaced by whatever Workers Logs supplies on its
own. Third, and most concretely, the resolution that decides which of these
two loggers you get is implicit and one environment variable from silent
breakage: OpenNext's own troubleshooting page *recommends* setting
`WRANGLER_BUILD_CONDITIONS=""` and `WRANGLER_BUILD_PLATFORM="node"` to fix
unrelated packages that mis-resolve
(<https://opennext.js.org/cloudflare/troubleshooting>, read 2026-08-22).
Anyone who flips those for some other dependency's sake converts every log
line in this project into an unindexed, level-less, `stdout: `-prefixed
string — with no error, no warning, and passing tests. `process.stdout` on
Workers is documented as a "non-TTY writable stream, which output[s] to
normal logging output only with `stdout: ` and `stderr: ` prefixing"
(<https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/>,
read 2026-08-22), and a prefixed line is not JSON — exactly the tension #69
set out to measure, and exactly what the forced build reproduced.

**What the decision gives up.** `redact`, pino's redaction option, is not
carried forward and would have to be hand-rolled if ever needed. Neither is
`pino.stdSerializers` — the `err`/`req`/`res` serializers — so an `Error`
object needs explicit serialization at the call site. The pino transport
ecosystem goes with it, including `pino-pretty` for local development, so
local log readability changes. So does pino's numeric level convention
(30/40/50), replaced by the string levels the platform console and Workers
Logs already use. None of this lands on live call sites: `src/shared/lib/logger.ts`
is this project's single construction point and has zero call sites today, so
the migration this decision requires touches exactly one file.

**Rejected: keeping pino on its browser entry.** This is the build that
passes and indexes cleanly today, and rejecting it is not free. It is rejected
because "passes today" and "documents what it does" are different properties:
the module comment would keep claiming a stdout-JSON write that this build
never performs, and the arrangement's correctness depends on nobody ever
setting the two build-condition variables OpenNext itself recommends for
unrelated reasons.

**Rejected: pinning the browser entry explicitly.** Forcing resolution to
`pino/browser.js` would fix the entry pino resolves to but not the underlying
problem: that entry emits no JSON, only bare `console` calls with raw
arguments, so the fields it "recovers" are recovered by Workers Logs'
extraction rather than by pino producing a structured record. Pinning it
would still leave the module's own comment false and would still not use any
of pino's stated feature surface — nothing pino provides is actually being
used on that path, at which point pinning it forecloses nothing that a
project-owned module doesn't already foreclose more honestly.

**Rejected: `@logtape/logtape`.** The fairest of the alternatives, and
genuinely strong on the runtime question: measured at 2.3.2 on `workerd`, zero
dependencies, no `browser`/`worker` split in its `exports` map at all — so
there is no second build for a build-condition change to silently switch
to — and its bundle contains zero occurrences of `worker_threads`, `node:fs`,
`node:process`, `process.stdout`, `AsyncLocalStorage`, or `async_hooks`.
Rejected on a narrower ground than pino's: its stock `getConsoleSink()` uses
`defaultConsoleFormatter`, which writes `%c` DevTools directives and CSS
strings into the record — readable in a terminal that consumes those
directives when rendering, but the underlying `message` is an array carrying
the raw format string plus five CSS strings, invisible as a problem until
something reads the record rather than the rendering. `getAnsiColorFormatter()`
embeds ANSI into the record instead. Only a custom sink producing
`console[method](JSON.stringify(record))` is safe, which is exactly this
decision's own approach — at which point what LogTape still buys over a
project-owned module (a level filter, its category hierarchy, `.with()`) is
small against zero dependencies being the only feature not already free.
Three further mismatches count against convenience specifically: `getChild()`
extends LogTape's category path rather than adding a field, so this project's
`module` convention would still need `.with()` rather than the more natural
child call; LogTape's `warning` level would need mapping to and from this
project's `warn`; and `getJsonLinesFormatter()` nests caller fields under
`properties`, which is unverified as an indexing shape (below).

**Rejected: Sentry's own structured logging.** Rejected on two grounds neither
of which #69 needed a Worker to measure. It sends logs off-platform, to
Sentry's own store, rather than to wherever this project's logs already land;
and `README.md`'s "read by Vercel Runtime Logs" claim is itself an open
question this decision does not resolve — whether that phrase states a
requirement or only describes today's incidental destination is unsettled
from #69, so a decision to route logs off-platform cannot rest on it.

**What is still unverified**, named so a later reader does not mistake
inference for measurement:

- **LogTape's behaviour in production Workers Logs.** Everything measured
  above ran locally against `workerd` through `wrangler dev`; nothing was
  deployed, so LogTape's output was never checked against a live Workers Logs
  index the way pino's was.
- **Whether `properties.*` indexes as nested keys** under Workers Logs —
  the shape `getJsonLinesFormatter()` produces, never measured against the
  live indexer.
- **`Error` object rendering and indexing** under Workers Logs, for any of
  the loggers considered here.
- **Vercel Runtime Logs' own retention and size limits.** #69 measured
  Workers Logs' figures directly — 3-day retention on the Free plan, 7-day on
  Paid, and a 256 KB per-log cap before truncation
  (<https://developers.cloudflare.com/workers/observability/logs/workers-logs/>,
  read 2026-08-22) — but the current arrangement's own retention and size
  limits were out of scope for that spike and were never measured.

**Consequence, and what is deliberately left alone.** `src/shared/lib/logger.ts`
still constructs a pino instance today, and `README.md`'s tech-stack row still
reads "Pino, to stdout, read by Vercel Runtime Logs." Both are corrected by
the change that implements this decision, not by this one — this record
states what was decided, not what has yet been carried out.
`src/shared/lib/env.ts` already parses `LOG_LEVEL` as
`debug | info | warn | error`; the replacement keeps that surface rather than
adopting a different level set, and `error` stays effectively unused on it
because Sentry remains this project's error tracker, per this project's
logging convention.
