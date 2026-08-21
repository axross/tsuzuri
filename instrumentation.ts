import * as Sentry from "@sentry/nextjs";
import { env } from "@/shared/lib/env";

/**
 * Registers Sentry for the Node.js and edge runtimes. `NEXT_RUNTIME` is a
 * framework-injected marker (not an app secret), read directly here per
 * Next.js's own instrumentation convention.
 *
 * With `SENTRY_DSN` unset, `Sentry.init` is inert: no error, no warning, no
 * network attempt.
 *
 * The logger is imported dynamically inside the Node.js branch rather than at
 * module scope: this file is loaded in the edge runtime too, and Pino's
 * Node.js-only dependencies must not be pulled into that bundle.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		Sentry.init({
			dsn: env.SENTRY_DSN,
			tracesSampleRate: 0,
		});

		const { logger } = await import("@/shared/lib/logger");

		logger.info(
			{ errorTracking: env.SENTRY_DSN ? "enabled" : "inert" },
			"server instrumentation registered",
		);
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		Sentry.init({
			dsn: env.SENTRY_DSN,
			tracesSampleRate: 0,
		});
	}
}

/**
 * The framework's server error hook. Every server-side error Next.js catches —
 * from server components, route handlers, server functions, and request-time
 * proxy code — arrives here with the request and routing context that produced
 * it. Without this export those errors are never reported, and nothing says so:
 * the application keeps working and Sentry simply stays empty.
 */
export const onRequestError = Sentry.captureRequestError;
