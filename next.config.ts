import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Resolves Cloudflare bindings (`env`, `cf`, `ctx`) through Wrangler under
 * `next dev`, so `getCloudflareContext()` works in development instead of
 * throwing — confirmed by reading the installed package
 * (`@opennextjs/cloudflare`'s `dist/api/cloudflare-context.js`):
 * `getCloudflareContext` throws `initOpenNextCloudflareForDevErrorMsg`,
 * telling the caller to add exactly this call, whenever the context was
 * never initialized. Nothing under `src/` calls `getCloudflareContext()` yet,
 * which is why that throw has not been hit — but the first feature that
 * reads a Worker binding in development will hit it without this.
 *
 * Safe to call unconditionally from a config file a production build also
 * loads: `initOpenNextCloudflareForDev` itself no-ops outside `next dev`'s
 * two-process dev server — it returns immediately unless
 * `globalThis.AsyncLocalStorage` is already set, which is how the dev server
 * (and only the dev server) is distinguished from a `next build` process —
 * so it makes no Wrangler call and touches nothing during
 * `npx opennextjs-cloudflare build` or a production/preview deploy. Verified
 * empirically: the build and `npm run dev` both still succeed with this
 * call in place.
 */
initOpenNextCloudflareForDev();

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
 * `project` is unconditionally required for `canUploadSourceMaps`
 * (`@sentry/bundler-plugin-core`) to attempt the upload at all; `org` is
 * required too unless `authToken` is org-scoped (starts with `sntrys_`,
 * which already carries the org) — with either missing when required it
 * warns ("No org provided. Will not upload source maps." and "No project
 * provided. Will not upload source maps." are separate messages; there is no
 * combined one) and the build succeeds anyway, which is how the upload went
 * silently unconfigured before this. They're a Sentry organization and project slug,
 * not a token, key, DSN, or internal hostname, so `docs/conventions/
 * security.md` § "Secrets Stay Out of the Tree" doesn't apply to them —
 * but they're still read from repository *variables* (`SENTRY_ORG`,
 * `SENTRY_PROJECT`) rather than hardcoded, so an operator can point a fork
 * or a renamed project at a different Sentry org/project without editing
 * this file. Passed explicitly rather than left to `withSentryConfig`'s own
 * `process.env["SENTRY_ORG"]` / `process.env["SENTRY_PROJECT"]` fallback —
 * `normalizeUserOptions` (`@sentry/bundler-plugin-core`) resolves an
 * explicit option over the env var, so leaving these out is what would make
 * the fallback take effect, and being explicit here is what keeps this one
 * line the place a reader confirms where the value actually comes from,
 * matching `authToken` and `release.name` below. Both deploying workflows
 * print an `::warning::` when either variable is unset, so a missing or
 * misspelled one shows up in the Actions log rather than degrading the
 * upload unnoticed. `SENTRY_AUTH_TOKEN` stays the only secret this needs;
 * its absence (or an invalid value) degrades the upload rather than failing
 * the build — `debugIdUploadPlugin`'s own writeBundle hook catches an
 * upload error and logs it (`handleRecoverableError(e, false)`,
 * throwByDefault: false), rather than re-throwing it into the build.
 *
 * `release.name` is read from `SENTRY_RELEASE`, set by each deploying
 * workflow to the commit the deploy is actually built from — the pull
 * request's head SHA in the preview pipeline, the (possibly
 * semantic-release-advanced) HEAD in the production one; see both workflow
 * files. Passed explicitly rather than left to `withSentryConfig`'s own
 * fallback chain, so this one line is where a reader confirms client and
 * server share a source: `@sentry/nextjs`'s `resolveReleaseName`
 * (`getFinalConfigObjectUtils.js`) resolves this same string for both the
 * value the browser bundle reports at runtime and the value the source-map
 * upload is filed under, which is what lets a client event and its source
 * map find each other in Sentry. `worker.ts`'s `env.SENTRY_RELEASE` binding
 * — set by the same two workflows — is what makes the server half agree
 * with this one; see `worker.ts` and `wrangler.jsonc`. With `SENTRY_RELEASE`
 * unset (a local build, or a workflow run before Cloudflare/Sentry secrets
 * exist), `resolveReleaseName` falls through to `getSentryRelease()` (the
 * same env var, still unset) and then `getGitRevision()`
 * (`git rev-parse HEAD`), so the build still succeeds and still reports a
 * release — just not one guaranteed to match a server that was never
 * deployed either.
 */
export default withSentryConfig(withNextIntl(nextConfig), {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	release: {
		name: process.env.SENTRY_RELEASE,
	},
});
