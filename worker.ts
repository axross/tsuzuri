import * as Sentry from "@sentry/cloudflare";
// `.open-next/worker.js` exists only after the OpenNext build has run, which
// is why this file and `.open-next` are excluded from `tsconfig.json` — see
// the note there.
import handler, {
	BucketCachePurge,
	DOQueueHandler,
	DOShardedTagCache,
} from "./.open-next/worker.js";

// `wrangler.jsonc`'s `main` points at this file, so these are the classes
// Wrangler needs to find bound Durable Objects against, if any are ever
// bound. `.open-next/worker.js` exports them unconditionally regardless of
// which cache — if any — is configured in `open-next.config.ts`.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

type Env = {
	// Sourced differently per tier, asymmetrically and deliberately.
	// Production sets this as a Wrangler *secret*, out of band from both
	// workflows and from wrangler.jsonc's own `vars` — an operator runs
	// `wrangler secret put SENTRY_DSN` once, by hand (see
	// docs/operations/production-deployment.md), because a secret survives
	// every subsequent `wrangler deploy` where a dashboard variable would be
	// silently erased. Preview cannot use that same mechanism: each pull
	// request deploys a distinct Worker script (`tsuzuri-pr-<number>`) that
	// wrangler creates fresh, so no secret pre-set on any other script name
	// ever reaches it. The preview pipeline instead templates this as a
	// plain `var` into wrangler.preview.json, reusing the
	// `NEXT_PUBLIC_SENTRY_DSN` repository variable's value — safe to do
	// because a DSN is public by design (see docs/conventions/security.md);
	// see docs/operations/preview-deployment.md.
	SENTRY_DSN?: string;
	// Not declared here as a static wrangler.jsonc `vars` entry — it changes
	// per deploy, so it can't be. Each deploying workflow supplies it
	// instead: the preview pipeline templates it into wrangler.preview.json
	// alongside SENTRY_ENVIRONMENT, and the production one appends `--var`
	// directly to its `opennextjs-cloudflare deploy` invocation, forwarded
	// straight through to the underlying `wrangler deploy` (see both
	// workflow files). Read automatically
	// by @sentry/cloudflare's own `getFinalOptions` — this file never reads
	// it directly — to fill `release` on every event, since the options
	// callback below does not set one itself. This is what makes a
	// server-side event's release agree with a client-side one's: both are
	// ultimately the same commit SHA the workflow resolved for this deploy,
	// see next.config.ts.
	SENTRY_RELEASE?: string;
	// Bound in wrangler.jsonc as `version_metadata`. This is a
	// Cloudflare-assigned Worker Version UUID, not a build identifier this
	// repository controls — it has no relationship to the commit SHA
	// SENTRY_RELEASE above carries, and the two are not interchangeable.
	// getFinalOptions reads it only as a fallback, when env.SENTRY_RELEASE
	// is absent (checked first): a Worker deployed by hand with
	// `wrangler deploy`, bypassing the workflows that set SENTRY_RELEASE,
	// still gets *some* release value on its events rather than none. `id`
	// is the only field that matters here; `getFinalOptions` checks for it
	// before trusting the binding at all.
	CF_VERSION_METADATA?: { id: string };
};

/**
 * The Worker's own entrypoint. `wrangler.jsonc`'s `main` points here rather
 * than directly at `.open-next/worker.js`, so this is the file Wrangler
 * builds and can produce a source map for, and the one place server-side
 * Sentry capture is wired in: `@sentry/nextjs`'s `instrumentation.ts` hook
 * never runs under OpenNext (measured in issue #68), so `withSentry` is what
 * restores it, at the Worker's fetch boundary instead.
 *
 * `withSentry`'s options callback reads `env` per request rather than at
 * module load, so with `SENTRY_DSN` unset the Sentry client that gets
 * constructed is never given a DSN. Reading `@sentry/core`'s `Client`
 * constructor and `_isEnabled()` (neither vendor's documentation states this
 * directly) confirms that client then never opens a transport and every
 * capture call short-circuits on `_isEnabled()` before anything is sent — so
 * the Worker starts, serves requests, and makes no network call.
 *
 * The options callback below sets no `release`: `@sentry/cloudflare`'s own
 * `getFinalOptions` (node_modules/@sentry/cloudflare/build/esm/options.js)
 * fills it in, preferring `env.SENTRY_RELEASE` and falling back to
 * `env.CF_VERSION_METADATA.id` only when that's absent — see the `Env` type
 * above for what each binding actually is and where it comes from. It is
 * `SENTRY_RELEASE`, not the version-metadata fallback, that makes a
 * server-side event's `release` agree with a client-side one's: both
 * pipelines resolve one commit SHA per deploy and hand it to both halves
 * (see `next.config.ts` for the client half), rather than each half
 * auto-detecting a value of its own that happens to agree.
 */
export default Sentry.withSentry(
	(env: Env) => ({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 0,
	}),
	handler,
);
