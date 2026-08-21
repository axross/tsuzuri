import pino from "pino";
import { env } from "./env";

/**
 * The project's shared root logger. Writes structured JSON to stdout with no
 * transport configured, which is what Vercel Runtime Logs ingest. Derive a
 * per-module child logger from this instance (`logger.child({ module: "..." })`)
 * rather than constructing a new Pino instance elsewhere.
 */
export const logger = pino({
	level: env.LOG_LEVEL ?? "info",
});
