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

1. Create a Cloudflare API token scoped to what this pipeline actually needs.
   Deploying and tearing down want different scopes — teardown additionally
   reaches Workers KV Storage, to verify a script is really gone rather than
   trusting a command's exit code (below) — so this project takes **the union
   in one token** rather than minting two: **Workers Scripts** (Edit) for
   building, deploying, and listing Workers, and **Workers KV Storage**
   (Edit) for what teardown additionally touches. Minting two narrower tokens
   instead is a reasonable alternative an operator MAY take; this project
   just doesn't require it.
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

Closing the pull request tears the Worker down. `wrangler delete` was
measured (issue #70) exiting non-zero after having already deleted the
script, so its exit code is not trusted: teardown instead calls Cloudflare's
"List Workers" API (`GET /accounts/{account_id}/workers/scripts`, the same
endpoint `wrangler` itself uses for this) and fails only if the Worker's name
still appears in the account's Worker list — that is the actual pass/fail
gate, per the same spike (issue #70), which is also where the Workers KV
Storage scope named above comes from: it recorded that tearing a Worker down
reaches further than deploying one does.

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
