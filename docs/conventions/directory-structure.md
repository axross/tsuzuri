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
  i18n/         next-intl routing and request configuration
  proxy.ts      next-intl locale negotiation, in front of every matched request
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

## Route Segments Carry the Locale

Every route lives under `src/app/[locale]/`, because next-intl resolves the
active locale from that segment. A route added outside it will not resolve
messages, and the failure looks like a missing translation rather than a
misplaced file.

The project currently ships one locale, `en`. The segment stays regardless: it
is what makes adding a second locale a data change rather than a restructuring.

## Names

Files and directories are **kebab-case** — `preferences-store.ts`,
`github-platform-limits.md` — with two exceptions the framework imposes:
Next.js's own reserved filenames (`layout.tsx`, `page.tsx`, `proxy.ts`,
`instrumentation.ts`) and its bracketed dynamic segments (`[locale]`).

A unit test sits beside the module it covers as `<module>.test.ts`, never in a
parallel test tree. What a test belongs in, and where an end-to-end test goes
instead, is [testing.md](./testing.md)'s subject.

A CSS Module is named for its component — `page.module.css` beside `page.tsx`.

## Configuration Stays at the Root

`biome.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`,
`playwright.config.ts`, `instrumentation.ts`, and `instrumentation-client.ts`
sit at the repository root because their tools look for them there. Do not
relocate one behind a config path option to tidy the root; the cost lands on
every contributor who then cannot find it.

`proxy.ts` is the exception, and it MUST stay at `src/proxy.ts`: Next.js looks
for it beside `app/`, which lives under `src/` here. At the repository root it
is not an error — the build simply does not list a proxy, and locale
negotiation stops happening with nothing to point at.

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
