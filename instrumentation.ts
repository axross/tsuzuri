import { env } from "@/shared/lib/env";

/**
 * Registers Sentry for the Node.js and edge runtimes. `NEXT_RUNTIME` is a
 * framework-injected marker (not an app secret), read directly here per
 * Next.js's own instrumentation convention.
 *
 * With `SENTRY_DSN` unset, `Sentry.init` is inert: no error, no warning, no
 * network attempt.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const Sentry = await import("@sentry/nextjs");

		Sentry.init({
			dsn: env.SENTRY_DSN,
			tracesSampleRate: 0,
		});
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		const Sentry = await import("@sentry/nextjs");

		Sentry.init({
			dsn: env.SENTRY_DSN,
			tracesSampleRate: 0,
		});
	}
}
