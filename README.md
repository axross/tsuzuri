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
| Hosting | Cloudflare Workers, via `@opennextjs/cloudflare` |
| Client state | Zustand |
| Validation | Zod |
| Styling | CSS Modules |
| Theming | CSS variables over Radix Colors |
| Components | Base UI (headless), composed with clsx |
| Internationalization | next-intl — one locale, `en`, structured to extend |
| Error tracking | Sentry |
| Logging | Pino, to stdout — not yet adapted to the Workers runtime; replacing it is a separate, still-open decision (see [the logger decision record](./docs/decisions/2026-08-22-build-the-logger-on-the-platform-console-rather-than-on-pino.md)) |

## Getting started

Node is pinned in [`.nvmrc`](./.nvmrc); use a version manager that reads it, or
match it by hand.

1. Install dependencies: `npm install`
2. Start developing: `npm run dev`

Building and deploying the Worker are not scripts a contributor runs day to
day — the preview and production pipelines invoke `npx opennextjs-cloudflare
build` and `npx opennextjs-cloudflare deploy` directly, since a workflow is
their only other caller. Run those same commands by hand to build or deploy a
personal or throwaway Worker; see [Testing](#testing) below for what each
does and what deploying needs.

No service, database, or credential is required to run the application
locally. Every integration is inert until it is configured: with no
`SENTRY_DSN`, Sentry initializes as a no-op and makes no network call.

Copy [`.env.example`](./.env.example) to `.env.local` to set any of them. That
file carries variable **names** only — real values never enter the repository,
and `.gitignore` keeps `.env.local` out. In a cloud agent session
[`session-start.sh`](./.claude/hooks/session-start.sh) materializes it for you.

Repository secrets are configured by an operator rather than a contributor,
and every one of them is optional until someone wants what it enables:
`CLAUDE_CODE_OAUTH_TOKEN` for the CI reviewer (see
[`claude-review.yaml`](./.github/workflows/claude-review.yaml)); the pair
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, which arms both the preview
and the production deployment pipelines (see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)
and
[docs/operations/production-deployment.md](./docs/operations/production-deployment.md));
and `SENTRY_AUTH_TOKEN`, which gates the client source-map upload in both
pipelines' builds — its absence degrades a build rather than blocking a
deployment.

Alongside those secrets, a repository **variable** —
`NEXT_PUBLIC_SENTRY_DSN` — feeds both pipelines' builds too. It is a
variable rather than a secret because a DSN is public by design: it ships
inside the browser bundle Next.js builds from it (see
[docs/conventions/security.md](./docs/conventions/security.md)). Its
absence does not fail a build either, but it does mean the deployed client
reports nothing to Sentry; both pipelines print an `::warning::` in that
case rather than leaving it to be discovered later.

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

Each pull request gets its own preview deployment as a **named Cloudflare
Worker**, `tsuzuri-pr-<number>`, posted to the pull request as a fresh comment
on every deploy (each recording the deployed commit) and torn down when the
pull request closes. The pipeline is inert until the two Cloudflare secrets
above are configured; see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)
for arming it, the one-time operator setup, and the one case where a preview
URL shows something other than the branch head.

Changes made without an agent follow the same bar: branch, implement, run the
checks below, open a pull request, and get it reviewed before merge.

### Production deployment and the release

Deploying to production and cutting a release both happen in one workflow, run
only when an operator dispatches it by hand — never on a push, never on a
published release. The same run cuts a release with semantic-release (staying
inside `0.x`) and then deploys the default branch's head to the production
Worker. It is inert the same way the preview pipeline is: with the Cloudflare
secrets absent the release still runs but the deploy is skipped, and the
workflow still concludes green. See
[docs/operations/production-deployment.md](./docs/operations/production-deployment.md)
for the one-time operator setup this needs, which the pipeline cannot
complete on its own.

## Testing

Unit tests under Vitest cover the transformations — parsing front matter,
deriving a media path, building a commit payload, validating configuration —
and never reach the network. End-to-end tests under Playwright build the
OpenNext output and drive it through `wrangler dev` in Chromium — the Worker
that actually gets deployed, rather than a `next start` build — and cover the
journeys catalogued in [`e2e/scenarios.md`](./e2e/scenarios.md), which is what
this project counts coverage against rather than a line percentage.
[docs/conventions/testing.md](./docs/conventions/testing.md) states which suite
a given test belongs in.

Lint, type-check, and the unit suite gate a merge, alongside a relative-link
check and the `docs/` validators. The end-to-end suite does not gate; run it
before opening a pull request that touches a rendered surface.

| Purpose | Command |
| ------- | ------- |
| Dev server | `npm run dev` |
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

Building and deploying the Worker are not in this table: they have no human
caller, only the deployment workflows, so they are workflow steps rather than
scripts. `npx opennextjs-cloudflare build` runs `next build` and then
transforms `.next/standalone` into the `.open-next/` directory Wrangler
deploys — the same build both deployment pipelines and the end-to-end suite
run. `npx opennextjs-cloudflare deploy` deploys an *already-built*
`.open-next/` output through Wrangler — run the build command first, as both
pipelines do. Deploying needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment, so a contributor runs it directly
only to push a personal or throwaway Worker for manual testing — the
pipelines are what deploy the preview and production Workers day to day.

If a required command cannot be run, say so — naming the command, the reason,
and the residual risk — rather than presenting the change as fully verified.
