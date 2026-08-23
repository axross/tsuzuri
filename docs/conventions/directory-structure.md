# Directory Structure

This project is organized **by domain**, not by kind of file. A change that
adds behaviour adds it under the feature it belongs to; a change that reaches
for a `components/` or `hooks/` bucket is working against the layout rather
than with it.

## Where Each Thing Lives

```
src/
  app/          Next.js App Router — routes, layouts, and nothing else
  features/     one directory per product domain
  shared/
    lib/        cross-feature helpers with no React in them
    state/      cross-feature Zustand stores
    styles/     the theme layer
    ui/         cross-feature presentational components
  i18n/         next-intl request configuration
messages/       one message catalog per locale
e2e/            Playwright specs and the journey catalog
```

`src/features/` currently holds only a `.gitkeep`. That is deliberate: this
repository has its toolchain and its constraints, and no product behaviour yet.
The first feature creates the first directory under it.

`src/shared/ui/` holds only the placeholder route's theme preference control.
It belongs to no feature — it is app shell — so the promotion rule below does
not apply to it.

## The Import Direction Is One Way

Imports MUST flow in one direction only: `app` → `features` → `shared`.

- `src/app/` MAY import from `features` and `shared`. Nothing MAY import
  **from** `src/app/`; a route is an entry point, never a library.
- A feature MAY import from `shared`. A feature MUST NOT import from another
  feature. Two features that need the same thing are telling you it belongs in
  `shared`, and the promotion rule below says when to move it.
- `src/shared/` MUST NOT import from `features` or `app`. A helper that needs
  to know about a product domain is not shared; it belongs to that domain.

A violation of any of these is visible in an import statement, which is what
makes this a convention rather than a matter of taste.

## Promote to `shared/` on the Second Caller, Not the First

A module MUST stay inside the feature that introduced it until a **second**
feature needs it. Promoting on the first caller is how a `shared/` directory
fills with things one feature owns, at which point nobody can change them
safely because nobody knows who depends on them.

Moving a module into `shared/` when the second caller arrives is cheap. Moving
it back out once four features import it is not.

## Routes Carry No Locale Segment

Every route lives directly under `src/app/`, with no `[locale]` segment in
front of it: `/` is the landing route, not `/en`. next-intl resolves the
single locale this project ships, `en`, from `src/i18n/request.ts` rather
than from a URL segment, negotiated by no proxy or middleware file — see
[build-toolchain.md](./build-toolchain.md) for why a proxy is what this setup
was chosen to avoid.

Adding a second locale later is a matter of extending `src/i18n/request.ts`
and adding its message catalog under `messages/`, not of restructuring routes
or reinstating a proxy — next-intl's own locale-negotiation setup is a
separate, larger change this document does not anticipate, and would need
its own decision if this project ever needs it.

## Names

Files and directories are **kebab-case** — `preferences-store.ts`,
`github-platform-limits.md` — with one exception the framework imposes:
Next.js's own reserved filenames, `layout.tsx` and `page.tsx` today. A
bracketed dynamic segment (for example `[slug]`) would be a second exception
if this tree had one; it does not — no route here takes a dynamic segment.

A unit test sits beside the module it covers as `<module>.test.ts`, never in a
parallel test tree. What a test belongs in, and where an end-to-end test goes
instead, is [testing.md](./testing.md)'s subject.

A CSS Module is named for its component — `page.module.css` beside `page.tsx`.

## Configuration Stays at the Root

`biome.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`,
`playwright.config.ts`, `instrumentation-client.ts`, `wrangler.jsonc`,
`open-next.config.ts`, and `release.config.js` sit at the repository root
because their tools look for them there. Do not relocate one behind a config
path option to tidy the root; the cost lands on every contributor who then
cannot find it.

`worker.ts` also sits at the root, but it is not configuration in the same
sense as the rest of that list — it is the Worker's own entrypoint, the
module that actually runs on every request. `wrangler.jsonc`'s `main` field
points at it, rather than at the OpenNext-generated `.open-next/worker.js`
directly, because Wrangler needs a concrete file of this project's own to
build and to produce a source map for, and because this is where
`@sentry/cloudflare`'s `withSentry` wraps the OpenNext handler for
server-side error capture. [build-toolchain.md](./build-toolchain.md) states
what that wrapping does and why `worker.ts` and `.open-next` are excluded
from `tsconfig.json`.

## What Biome Sees Is an Allowlist

`biome.json` names the paths Biome may format and lint — `src/`, `e2e/`,
`messages/`, and the root config files — rather than listing what to skip.

This MUST stay an allowlist. `.claude/skills/` holds installed copies generated
from `skills-lock.json`, and formatting one is a hand-edit that the next
install discards while breaking the directory's correspondence with its
lockfile. Under an exclude list, that directory was in scope until someone
remembered to exclude it — and it had already been rewritten by then. Under an
allowlist, a new generated directory is out of scope by default.

A change that adds a top-level source directory MUST add it to
`files.includes`, or it silently goes unformatted and unlinted.
