# tsuzuri

A web application that treats a GitHub repository a user has linked to it as
the blog's backend, formatting and serving the posts, media, and metadata it
holds.

Posts are Markdown files with front matter, media are ordinary files committed
beside them, and both live in the author's own repository rather than in a
database we operate. The application reads that repository through a companion
GitHub App, serves the blog from its own cache, writes authored changes back as
commits, and carries reader comments on GitHub Discussions under each reader's
own GitHub identity. There is no persistence layer of its own: everything
outside the linked repository is derived, and can be rebuilt from it.

The repository is currently at its starting point — the toolchain, the
constraints, and the decisions are in place; the product behaviour is not.

## Tech stack

| Area | Tool |
| ---- | ---- |
| Language | TypeScript |
| App framework / runtime | Next.js (App Router) |
| Package manager | npm |
| Linting & formatting | Biome (both) |
| Unit tests | Vitest |
| E2E tests | Playwright |
| Data / content layer | the linked GitHub repository, read and written through the GitHub API |
| Hosting | Vercel |
| Client state | Zustand |
| Validation | Zod |
| Styling | CSS Modules |
| Theming | CSS variables over Radix Colors |
| Components | Base UI (headless), composed with clsx |
| Internationalization | next-intl — one locale, `en`, structured to extend |
| Error tracking | Sentry |
| Logging | Pino, to stdout, read by Vercel Runtime Logs |

## Getting started

Node is pinned in [`.nvmrc`](./.nvmrc); use a version manager that reads it, or
match it by hand.

1. Install dependencies: `npm install`
2. Start developing: `npm run dev`
3. Production build and start: `npm run build`, then `npm run start`

No service, database, or credential is required to run the application
locally. Every integration is inert until it is configured: with no
`SENTRY_DSN`, Sentry initializes as a no-op and makes no network call.

Copy [`.env.example`](./.env.example) to `.env.local` to set any of them. That
file carries variable **names** only — real values never enter the repository,
and `.gitignore` keeps `.env.local` out. In a cloud agent session
[`session-start.sh`](./.claude/hooks/session-start.sh) materializes it for you.

Two repository secrets sets are configured by an operator rather than a
contributor, and both are optional until someone wants what they enable:
`CLAUDE_CODE_OAUTH_TOKEN` for the CI reviewer (see
[`claude-review.yaml`](./.github/workflows/claude-review.yaml)), and
`VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` for preview deployments
(see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)).

## Development workflow

Development in this repository is agent-assisted via
[Claude Code](https://claude.com/claude-code). The working agreement lives in
[`AGENTS.md`](./AGENTS.md) (loaded through `CLAUDE.md`), which routes to the
installed skills under [`.claude/skills/`](./.claude/skills) and to this
project's own documents under [`docs/`](./docs/index.md). Human and agent
contributors follow the same loop.

### The change loop

Every change — code or document, one line or one feature — goes through the
`loop-engineering` skill: **plan → approve → code → verify → independent review
→ address → ready**.

There is no command to type. The skill is model-invoked, so naming the work is
what starts it: *"deliver issue #42"*, *"pick up PR 57"*, or a description of a
change with no issue behind it yet. To carry on after it stops, continue the
session and tell it to.

1. **Plan** — reads the issue and its thread, asks you the product and scope
   questions the spec leaves open, and rewrites the issue body into a
   reviewable plan with acceptance criteria. It then **always stops for your
   approval**: nothing gets built until you review the plan and resume.
2. **Code + verify** — implements the approved plan on an agent-namespaced
   branch (on a separate worktree when it shares your working copy, so it never
   blocks you), runs the checks the changed surface requires, and self-reviews
   the diff. Implementation runs in the `implementer` subagent where the
   harness allows one.
3. **Independent review** — opens a draft pull request and requests the CI
   reviewer, a separate session under a separate identity, so the code's author
   never certifies its own work.
4. **Address** — fixes review findings and CI failures, tying each resolved
   thread to the resolving commit, for a capped number of rounds.
5. **Ready** — flips the pull request to ready once CI is green and the review
   is clean. Merging always stays a human decision.

[docs/operations/development-workflow.md](./docs/operations/development-workflow.md)
holds this project's own part: the branch prefix, what audits the loop from
outside a session, and how the review is requested.

### `@claude review` — get findings on any PR

Comment **`@claude review`** on a pull request to run this repository's review
policy ([`REVIEW.md`](./REVIEW.md)) — severity-tagged findings with `file:line`
evidence and concrete fixes, posted as inline comments by the CI reviewer
([`claude-review.yaml`](./.github/workflows/claude-review.yaml)). Use it for a
pre-merge check on a hand-written change or a second opinion before merging; it
is the same reviewer the change loop requests for itself.

### Preview environments — review every PR live

Each pull request gets its own preview deployment behind a **stable per-PR
link**, posted to the pull request as a fresh comment on every deploy (each
recording the deployed commit) and torn down when the pull request closes. The
pipeline is inert until the three Vercel secrets above are configured; see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)
for arming it and for the one case where a preview URL shows something other
than the branch head.

Changes made without an agent follow the same bar: branch, implement, run the
checks below, open a pull request, and get it reviewed before merge.

## Testing

Unit tests under Vitest cover the transformations — parsing front matter,
deriving a media path, building a commit payload, validating configuration —
and never reach the network. End-to-end tests under Playwright drive a
production build in Chromium and cover the journeys catalogued in
[`e2e/scenarios.md`](./e2e/scenarios.md), which is what this project counts
coverage against rather than a line percentage.
[docs/conventions/testing.md](./docs/conventions/testing.md) states which suite
a given test belongs in.

Lint, type-check, and the unit suite gate a merge, alongside a relative-link
check and the `docs/` validators. The end-to-end suite does not gate; run it
before opening a pull request that touches a rendered surface.

| Check | Command |
| ----- | ------- |
| Format | `npm run format` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Unit tests | `npm run test:unit` |
| E2E tests | `npm run test:e2e` |

This table is the authoritative list of the project's commands, for human
contributors and agents alike. Run format and lint after every change, and the
suites relevant to the changed surface before opening a pull request; the
`software-development` skill owns why, and [`AGENTS.md`](./AGENTS.md) requires
reading this file before running any of them.

If a required command cannot be run, say so — naming the command, the reason,
and the residual risk — rather than presenting the change as fully verified.
