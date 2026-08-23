# Preview Deployment

Every pull request gets its own deployed copy of the application, so a change
can be exercised before it is merged rather than after. The pipeline lives in
[`preview-deployment.yaml`](../../.github/workflows/preview-deployment.yaml)
and deploys **one named Cloudflare Worker per pull request**, `tsuzuri-pr-<number>`,
through the `@opennextjs/cloudflare` CLI.

## The Pipeline Is Inert Until an Operator Arms It

The workflow checks for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
before it does anything. With either one missing it prints a notice, deploys
nothing, comments nothing, and **concludes green**.

This is deliberate and MUST be preserved: the pipeline has to merge before the
Cloudflare account it deploys to is configured, and a preflight that failed
instead would make every pull request red for a reason no author could fix. A
change to this workflow MUST keep the guard covering both secrets — a guard
checking only one lets a half-configured repository fail at deploy time
instead. A pull request from a fork gets no secrets either, and lands in the
same green no-op rather than an error.

## Arming It

An operator with access to both the repository and the Cloudflare account
does this once:

1. Create a Cloudflare API token scoped to what this pipeline actually needs:
   **Workers Scripts** (Edit) for building, deploying, and listing Workers,
   and **Workers KV Storage** (Edit) for what teardown additionally touches.
   **This project takes the union in one token, and the union is required
   rather than merely cautious** — narrowing it makes teardown exit 1 on
   every pull-request close. That is a measured fact, not an inherited
   caution: on 2026-08-23, against a real deployed throwaway Worker binding
   no KV namespace at all (only `ASSETS` and `CF_VERSION_METADATA`), a token
   carrying **Workers Scripts: Edit and nothing else** — KV deliberately
   withheld, and confirmed withheld because listing KV namespaces returned
   `Authentication error [code: 10000]` — deployed the Worker successfully,
   and then `wrangler delete --force` **exited 1**, with `A request to the
   Cloudflare API (/accounts/{id}/storage/kv/namespaces) failed`, even
   though the Worker was **in fact deleted**, confirmed absent from the
   account's Worker list immediately afterwards. So `wrangler delete`
   enumerates KV namespaces **unconditionally** — independently of whether
   the Worker being deleted binds any KV namespace at all, which this one
   didn't. This is exactly why teardown (below) verifies deletion against
   the account's Worker list instead of trusting `wrangler delete`'s exit
   code: that exit code fails on every teardown unless the token can list
   KV, whether or not the deletion actually worked. **Do not narrow this
   token's scope** — minting two narrower tokens instead would make
   teardown fail its exit-code check on every run.
2. Add two repository secrets under Settings → Secrets and variables →
   Actions:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard
3. Re-run the workflow on an open pull request and confirm a comment appears
   carrying the deployed URL and the short SHA.

Nothing else has to be configured. The workflow uses the job's own
`GITHUB_TOKEN` to comment.

## What a Run Does

Opening, updating, or reopening a pull request builds the application through
`npx opennextjs-cloudflare build`, templates a per-pull-request copy of
`wrangler.jsonc` whose `name` is `tsuzuri-pr-<number>`, and deploys it through
the `@opennextjs/cloudflare` CLI (`npx opennextjs-cloudflare deploy`) rather
than through `wrangler deploy` directly — so that any cache-population step a
future binding set requires runs rather than being silently skipped, per
issue #70. Both are invoked directly rather than through an npm script: a
workflow is each one's only caller, so neither lives in `package.json`.
The config is templated per pull request rather than deployed with a bare
`--name` override, because `--name` renames the script without rewriting a
`WORKER_SELF_REFERENCE` service binding that carries the old name; this tree
binds no such service today, but the pipeline stays written to avoid the trap
because issue #37 will grow the binding set.

A fresh comment is posted per deploy — naming the deployed URL and the short
SHA it was built from — rather than editing the previous one, so the thread
reads as a history of what was deployed when.

The Build step also carries this pull request's Sentry identity. `SENTRY_RELEASE`
is set to `context.payload.pull_request.head.sha` — the same commit the
deploy comment above names, not `github.sha`, which on a `pull_request`
trigger is a merge commit rather than a commit on this branch — and reaches
both halves of the deploy: `next.config.ts`'s explicit `release.name` picks
it up for the client bundle and the source-map upload, and the templated
`wrangler.preview.json`'s `vars` carries the same value to the deployed
Worker (`worker.ts`'s `env.SENTRY_RELEASE`). One value reaching both is what
lets a preview's client and server events correlate under one release in
Sentry. `SENTRY_AUTH_TOKEN` (the same repository secret production's build
uses) arms the source-map upload here too, so a preview's client errors
symbolicate the same way production's do; its absence degrades the build
rather than failing it. `SENTRY_ORG` and `SENTRY_PROJECT` (repository
*variables*, the Sentry org/project slug rather than a credential — see
[docs/conventions/security.md](../conventions/security.md)) are what
`next.config.ts`'s `canUploadSourceMaps` check needs to attempt that upload
at all. `SENTRY_PROJECT` is unconditionally required; `SENTRY_ORG` is
required too unless `SENTRY_AUTH_TOKEN` is org-scoped (starts with
`sntrys_`, which already carries the org). With a required one unset it
warns and skips the upload rather than failing the build, and a dedicated
step here logs an `::warning::` beforehand, the same shape the DSN warning
below uses — though the guard checks both variables regardless of the
token's scope, so it can warn even when an org-scoped token would still let
the upload succeed with `SENTRY_ORG` unset. `NEXT_PUBLIC_SENTRY_DSN` (a
repository *variable*, not a secret) is what lets the deployed client report
to Sentry at all, since Next.js inlines it at build time; its absence is
logged as an `::warning::` by a dedicated step immediately before the build
runs, rather
than failing it, so a missing or misspelled variable shows up in the Actions
log instead of being discovered only when a preview's errors go unreported.

The templating step that produces `wrangler.preview.json` also carries
`SENTRY_DSN` into the deployed Worker's `vars`, reusing
`NEXT_PUBLIC_SENTRY_DSN`'s value rather than a dedicated secret — a DSN is
public by design, it already ships inside the client bundle the Build step
above produces — and as a plain `var` rather than a Wrangler secret, because
each pull request deploys a distinct Worker script (`tsuzuri-pr-<number>`)
that `wrangler` creates fresh on every deploy, so no secret pre-set on any
other script name ever reaches it (see `worker.ts`'s own comment on the
`Env` type). With `NEXT_PUBLIC_SENTRY_DSN` unset, the templating script
omits the `SENTRY_DSN` key from the written config entirely rather than
writing `null`, so the deployed Worker gets no binding and `worker.ts`'s
existing dsn-unset path applies unchanged: it starts, serves requests, and
reports nothing. This is what makes the release-correlation claim above true
in practice rather than only in principle — before this, no preview Worker
carried a DSN at all, so there were no server-side events for a preview's
client events to correlate with.

Closing the pull request tears the Worker down. `wrangler delete` was
measured (issue #70, and reproduced exactly by the 2026-08-23 measurement
above) exiting non-zero after having already deleted the script, so its exit
code is not trusted: teardown instead calls Cloudflare's "List Workers" API
(`GET /accounts/{account_id}/workers/scripts`, the same endpoint `wrangler`
itself uses for this) and fails only if the Worker's name still appears in
the account's Worker list — that is the actual pass/fail gate. This is the
same design the Workers KV Storage scope above exists for: `wrangler delete`
enumerates KV namespaces on every deletion regardless of the token's scope,
so the verify-by-Worker-list gate is what actually decides pass or fail
rather than an exit code that can be non-zero on a deletion that worked.

## Reading a Preview That Looks Wrong

Each deploy posts its own comment naming both the URL and the short SHA it
was built from, so — unlike an alias that silently keeps serving a previous
successful build — there is no comment on a failed deploy pointing at stale
content. If a push's build or deploy step fails, the workflow run fails and
no new comment appears; the most recent comment already on the pull request
is then the one accurate description of what is currently deployed. Check the
short SHA in the newest comment against the branch head before concluding a
change did not work, and check the workflow run itself if no new comment
appeared after a push.

A preview carries no production data and no production credentials. Treat
anything it stores as disposable.
