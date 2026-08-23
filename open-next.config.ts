import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache, tag cache, or revalidation queue is configured: this
 * tree has no ISR route, no `"use cache"` usage, and no `revalidateTag`
 * call, so none of the three is provisioned — an explicit non-goal recorded
 * in issue #79. OpenNext runs with no cache when none of `defineCloudflareConfig`'s
 * overrides is set.
 */
const config = defineCloudflareConfig();

/**
 * `buildCommand` is a top-level field on `@opennextjs/aws`'s own
 * `OpenNextConfig` (`node_modules/@opennextjs/aws/dist/types/open-next.d.ts`),
 * which the Cloudflare adapter's `OpenNextConfig` extends — it is not one of
 * `defineCloudflareConfig`'s own `CloudflareOverrides`, so it is set here on
 * the object that function returns rather than passed as an argument to it.
 *
 * `buildNextjsApp` (`@opennextjs/aws/dist/build/buildNextApp.js`, reached by
 * `@opennextjs/cloudflare`) shells out to `` `${packager} run build` `` —
 * literally `npm run build` — when this is unset. `package.json` carries no
 * `build` script (issue #79's command-surface reduction), so this MUST be
 * set to whatever actually produces `.next/standalone`, or the Worker build
 * fails looking for a script that no longer exists.
 */
config.buildCommand = "next build";

export default config;
