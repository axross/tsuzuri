import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

/**
 * `withSentryConfig` uploads client source maps at build time, keyed by
 * `SENTRY_AUTH_TOKEN` from the environment (its own default, made explicit
 * here). With the token unset, the Sentry build plugin logs that it is
 * skipping the upload and the build still succeeds — confirmed by reading
 * `@sentry/bundler-plugins`' own source rather than assumed, since neither
 * vendor's documentation states it.
 */
export default withSentryConfig(withNextIntl(nextConfig), {
	authToken: process.env.SENTRY_AUTH_TOKEN,
});
