# Production Deployment

Deploying to production and cutting a release both happen in one workflow,
[`production-deployment.yaml`](../../.github/workflows/production-deployment.yaml).
It exists to put a human decision in front of every production deploy: it
runs on a manual `workflow_dispatch` **only** — never on a push to the default
branch, never on a published GitHub Release — because that is what the
maintainer decided at this pipeline's own planning interview (issue #79).
Nothing reaches production without an operator choosing, in the moment, to
dispatch this workflow.

## What a Run Does

The workflow enforces that it deploys the default branch's head rather than
assuming it: immediately after preflight, a dedicated step compares the
dispatched `github.ref` against `refs/heads/main` and, if they differ while
the Cloudflare secrets are present, fails the job with `::error::` before
Checkout runs — so a dispatch from any other branch is told loudly that
nothing was built or deployed, rather than building and deploying that
branch's code to the production Worker. The release half needs no equivalent
check: `release.config.js`'s own `branches: ["main"]` already confines
semantic-release to the default branch, and it exits 0 without releasing from
any other one.

Dispatching the workflow from the default branch does two things, in order:

1. **Cuts a release with semantic-release**, from
   [`release.config.js`](../../release.config.js). It resolves the next
   version from the commits since the last Git tag, generates release notes,
   commits the resulting `package.json` version and `CHANGELOG.md` entry back
   to the default branch, creates the Git tag, and creates the GitHub
   Release. This step needs only the job's own `GITHUB_TOKEN`, so it always
   runs, independent of whether Cloudflare is configured (below). A dispatch
   whose commits since the last tag warrant no release exits without
   releasing — semantic-release's own behavior — and the deploy step below
   still runs, because deploying is what the operator dispatched this
   workflow to do.
2. **Deploys the default branch's head to the production Worker**, through
   `npx opennextjs-cloudflare build` and then `npx opennextjs-cloudflare
   deploy` — invoked directly rather than through an npm script, since a
   workflow is each one's only caller. Unlike the preview pipeline,
   production is one fixed Worker — `wrangler.jsonc`'s own `name` ("tsuzuri")
   is used as-is, with nothing templated per run.

Only the deploy half is preflight-gated on `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, the same two secrets and the same step-level
`armed` guard [preview-deployment.md](./preview-deployment.md) documents.
With either missing, the release above still runs, the deploy is skipped,
and the workflow still concludes green — the same inert-until-armed shape the
preview pipeline uses, so this pipeline can merge before Cloudflare is
configured for this repository.

`SENTRY_AUTH_TOKEN` gates only the client source-map upload inside the build
(see `next.config.ts`); its absence degrades that build rather than blocking
it, so it is not part of the preflight guard.

## The Operator's One-Time Setup

Three things need doing by hand before this pipeline can do its job, none of
which it can do for itself:

**1. Tag `v0.1.0` on the default branch, once.** semantic-release resolves
the *previous* version from the last Git tag reachable from the branch it
runs on. With no tag at all, it would publish `1.0.0` for a project whose
`package.json` already carries `0.1.0` and whose maintainer wants every
release to stay inside `0.x` (below) — so the operator tags the version
`package.json` already states, once:

```
git tag v0.1.0 <commit>
git push origin v0.1.0
```

Seeding `v0.0.0` instead was considered and rejected: with no shipped history
to anchor it, the first version semantic-release would then compute depends
on which commit types happen to fall in the range, rather than being the
version this project already states.

**2. Let the release commit reach the default branch.** `@semantic-release/git`
pushes the version-bump commit (`package.json`, `CHANGELOG.md`) straight to
the default branch using the job's own `GITHUB_TOKEN`. This is the **one
place in this repository where an automated actor pushes to the default
branch.** [`AGENTS.md`](../../AGENTS.md)'s "never push to the default branch"
governs agent sessions, not this job — but a branch protection rule admitting
no bypass for that token rejects the push regardless of who it governs, and
fails the release step. Arming this pipeline includes configuring branch
protection to admit this one push (for example, an allowed-actor exception
for `github-actions[bot]`, or excluding `contents: write` Actions jobs from
the rule that would otherwise block it) — an operator decision, made once,
outside this repository's own files.

**3. Set the Worker's own runtime secrets.** `worker.ts` reads `env.SENTRY_DSN`
at the fetch boundary — this is **not** a GitHub Actions secret; nothing in
either workflow ever sets it. It is set directly on the deployed Worker, once,
from the operator's own machine:

```
npx wrangler secret put SENTRY_DSN
```

run against this repository (Wrangler reads `wrangler.jsonc`'s `name` —
`tsuzuri`, the production Worker — from the current directory), authenticated
either via `wrangler login` or via `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` in the operator's own shell. The command prompts for
the secret's value on stdin and stores it directly against the named Worker;
it is never written to this repository, to a workflow log, or to a pull
request. With `SENTRY_DSN` left unset, the Worker starts, serves requests,
and reports nothing — no error, no warning, no network attempt — which is the
deliberate inert-when-unconfigured shape `worker.ts`'s own comment states,
not a bug in the pipeline.

## Staying Inside `0.x`

Every release this project cuts stays inside `0.x` until the maintainer
decides otherwise — including the version a commit carrying a breaking
change would otherwise produce. This rests on one custom rule in
`release.config.js`'s `@semantic-release/commit-analyzer` configuration,
`{ breaking: true, release: "minor" }`, which displaces the shipped default
`{ breaking: true, release: "major" }`: `@semantic-release/commit-analyzer`'s
own README states a commit is evaluated against the default rules only when
no custom `releaseRules` entry matched it first, and `breaking` is the same
matching property both rules use, so the custom rule is fully supported on
its own.

**What is not supported, and stated as such rather than hidden, is the
arrangement as a whole.** semantic-release's own FAQ puts major version zero
out of scope for the project to support: *"This is not supported by
semantic-release. Semantic Versioning rules apply differently to major
version zero and supporting those differences is out of scope and not one of
the goals of the semantic-release project."* Staying on `0.x` here is
therefore a deliberate workaround built from one supported rule, not a
supported mode of the tool — and its risk follows from that: an upgrade to
`semantic-release` or `@semantic-release/commit-analyzer` can change how
default and custom rules interact without treating it as a breaking change of
its own, because nothing about staying on `0.x` this way is a documented
contract. Removing the custom rule (and letting the shipped default apply) is
how a future change leaves `0.x` once the maintainer decides to.
