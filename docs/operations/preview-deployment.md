# Preview Deployment

Every pull request gets its own deployed copy of the application, so a change
can be exercised before it is merged rather than after. The pipeline lives in
[`preview-deployment.yaml`](../../.github/workflows/preview-deployment.yaml)
and deploys through Vercel.

## The Pipeline Is Inert Until an Operator Arms It

The workflow checks for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID` before it does anything. With any one of them missing it
prints a notice, deploys nothing, comments nothing, and **concludes green**.

This is deliberate and MUST be preserved: the pipeline has to merge before the
Vercel project it deploys to exists, and a preflight that failed instead would
make every pull request red for a reason no author could fix. A change to this
workflow MUST keep the guard covering all three secrets — a guard checking only
one lets a half-configured repository fail at deploy time instead.

## Arming It

An operator with access to both the repository and the Vercel project does
this once:

1. Create the Vercel project, and disable its Git integration's own preview
   deployments if it has any — otherwise every pull request deploys twice and
   the two comments disagree about which URL is current.
2. Create a Vercel access token, then add three repository secrets under
   Settings → Secrets and variables → Actions:
   - `VERCEL_TOKEN` — the access token
   - `VERCEL_ORG_ID` — from the Vercel project's settings
   - `VERCEL_PROJECT_ID` — from the same place
3. Re-run the workflow on an open pull request and confirm a comment appears
   carrying the deployed short SHA.

Nothing else has to be configured. The workflow uses the job's own
`GITHUB_TOKEN` to comment.

## What a Run Does

The workflow builds and deploys the pull request's head, then points a
deterministic alias — `tsuzuri-pr-<number>` — at that deployment and posts a
comment naming the alias and the short SHA it was built from. The alias is
stable across pushes, so a link shared early keeps working; the SHA in the
comment is what tells a reader whether the deployment is current.

A fresh comment is posted per deploy rather than editing the previous one, so
the thread reads as a history of what was deployed when.

## Reading a Preview That Looks Wrong

The alias always points at the newest **successful** deploy. If a push failed
to build, the alias still serves the previous commit — which is the one case
where a preview URL silently shows something other than the branch head.
Check the short SHA in the newest comment against the branch head before
concluding a change did not work.

A preview carries no production data and no production credentials. Treat
anything it stores as disposable.
