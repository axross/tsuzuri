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
	SENTRY_DSN?: string;
	// Bound in wrangler.jsonc as `version_metadata`. Read automatically by
	// @sentry/cloudflare's own `getFinalOptions` — this file never reads it
	// directly — to fill `release` on every event, since the options
	// callback below does not set one itself. `id` is the only field that
	// matters here; `getFinalOptions` checks for it before trusting the
	// binding at all.
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
 * fills it from `env.CF_VERSION_METADATA.id` whenever the returned options
 * omit the key, and `wrangler.jsonc` binds that Worker Version metadata for
 * exactly this — so every server-side event carries the same build
 * identifier the client half already does via `withSentryConfig`.
 */
export default Sentry.withSentry(
	(env: Env) => ({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 0,
	}),
	handler,
);
