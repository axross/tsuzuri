import * as Sentry from "@sentry/nextjs";

/**
 * Registers Sentry for the browser bundle. Reads `NEXT_PUBLIC_SENTRY_DSN` as
 * a literal `process.env.NEXT_PUBLIC_*` expression rather than through
 * `src/shared/lib/env.ts` — Next.js only inlines a public env var into the
 * client bundle when it finds that literal expression in browser-bundled
 * source, so routing it through a dynamic whole-object parse would leave it
 * undefined on the client. See the comment on `envSchema` for the other half
 * of this split.
 *
 * With `NEXT_PUBLIC_SENTRY_DSN` unset, `Sentry.init` is inert: no error, no
 * warning, no network attempt.
 */
Sentry.init({
	// `|| undefined` for the same reason `src/shared/lib/env.ts` normalizes an
	// empty string: copying `.env.example` to `.env.local` sets this to `""`,
	// not to nothing.
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
	tracesSampleRate: 0,
});

/**
 * The framework's router transition hook. It fires as a client navigation
 * begins, which is what scopes errors and spans to the route being entered
 * rather than to wherever the visitor happened to start.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
