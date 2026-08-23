import pino from "pino";
import { env } from "./env";

/**
 * The project's shared root logger. On Node this writes structured JSON to
 * stdout with no transport configured; on the deployed Cloudflare Worker this
 * project now runs on, it does not —
 * docs/decisions/2026-08-22-build-the-logger-on-the-platform-console-rather-than-on-pino.md
 * measured Pino there resolving to a browser entry that emits no JSON at
 * all, or, forced to its Node entry, JSON trapped inside a string value with
 * no `level` key. That record's replacement is separate, still-open work —
 * this logger is unchanged here. Derive a per-module child logger from this
 * instance (`logger.child({ module: "..." })`) rather than constructing a
 * new Pino instance elsewhere.
 */
export const logger = pino({
	level: env.LOG_LEVEL ?? "info",
});
