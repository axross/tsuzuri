import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache, tag cache, or revalidation queue is configured: this
 * tree has no ISR route, no `"use cache"` usage, and no `revalidateTag`
 * call, so none of the three is provisioned — an explicit non-goal recorded
 * in issue #79. OpenNext runs with no cache when none of `defineCloudflareConfig`'s
 * overrides is set.
 */
export default defineCloudflareConfig();
