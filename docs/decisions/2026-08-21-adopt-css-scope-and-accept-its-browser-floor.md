---
status: accepted
---

# Adopt CSS `@scope` and accept its browser floor

The styling capability this project follows mandates a cascade-layer skeleton
for CSS Modules built on `@layer`, `@scope`, and `:where(:scope)` — and, in the
same breath, requires each project to check that skeleton against its own
browser support matrix and record what it decided.

The two at-rules are not equivalent bets. `@layer` has been Baseline widely
available since March 2022; adopting it costs nothing and we would have anyway.
`@scope` reached Baseline newly available only in March 2026, five months before
this decision, which makes it the whole of the question.

We adopted it.

What that costs is unusually blunt, because neither at-rule can be given a
fallback: a browser that does not understand `@scope` discards the block and
everything inside it. There is no degraded rendering — a reader on an older
browser gets an unstyled page, not an approximate one. This application serves
public blog readers rather than developers, so that reader is a real person we
are choosing not to serve rather than a hypothetical.

The alternative was to take `@layer` and skip `@scope`, which the capability
itself contemplates: a matrix that cannot accommodate the skeleton is supposed
to get a different structure rather than a degraded version of this one. The
argument for it was strong — CSS Modules already hash class names per file, so
the isolation `@scope` adds on top is modest, and the floor it buys is measured
in years of devices.

It was overridden deliberately. The scaffolding is being written now and read
for years, and a skeleton retrofitted across every module later is a far more
expensive change than one written in from the start; the floor also rises on its
own as the Baseline date recedes, where a missing skeleton does not.

The consequence is that the floor is now a project-wide property rather than a
per-file one. Lowering it means removing the skeleton everywhere and superseding
this record — never carving out an exception in one module, which would leave
the floor in place while losing the isolation that justified it.
