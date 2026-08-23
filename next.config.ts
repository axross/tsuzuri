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
 *
 * `org` and `project` are also required for `canUploadSourceMaps`
 * (`@sentry/bundler-plugin-core`) to attempt the upload at all — with either
 * missing it warns "No org/project provided. Will not upload source maps."
 * and the build succeeds anyway, which is how the upload went silently
 * unconfigured before this. They're a Sentry organization and project slug,
 * not a token, key, DSN, or internal hostname, so `docs/conventions/
 * security.md` § "Secrets Stay Out of the Tree" doesn't apply to them —
 * hardcoded here rather than added as two more secrets an operator has to
 * set. `SENTRY_AUTH_TOKEN` stays the only secret this needs; its absence
 * (or an invalid value) degrades the upload rather than failing the build —
 * `debugIdUploadPlugin`'s own writeBundle hook catches an upload error and
 * logs it (`handleRecoverableError(e, false)`, throwByDefault: false),
 * rather than re-throwing it into the build.
 */
export default withSentryConfig(withNextIntl(nextConfig), {
	org: "axross",
	project: "tsuzuri",
	authToken: process.env.SENTRY_AUTH_TOKEN,
});
