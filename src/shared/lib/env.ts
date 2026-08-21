import { z } from "zod";

/**
 * The project's single env-var boundary for server/edge code: every
 * server-visible runtime environment variable is parsed here, and every
 * other server or edge module reads the typed `env` export instead of
 * touching `process.env` directly.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` deliberately has no field here even though it is
 * documented in `.env.example`: Next.js only inlines a `NEXT_PUBLIC_*` value
 * into the client bundle when the literal `process.env.NEXT_PUBLIC_*`
 * expression appears in browser-bundled source, so `instrumentation-client.ts`
 * reads it directly rather than through this dynamic, whole-object parse.
 *
 * Every field below is optional at this stage. No deployment secret exists
 * yet, so parsing MUST NOT throw merely because one is absent — an unset
 * Sentry DSN keeps error tracking inert rather than failing the build or the
 * server.
 */

/**
 * Treats an empty string as absent, then applies the field's own schema.
 *
 * This is not a nicety. `.env.example` documents each variable as a bare
 * `NAME=`, and the documented setup copies that file to `.env.local`, so a
 * contributor who follows the README hands the process an empty string for
 * every variable rather than no value at all. Zod's `.optional()` does not
 * treat `""` as absent, so without this the server refuses to boot for anyone
 * who did exactly what the README told them to.
 */
function optional<Schema extends z.ZodTypeAny>(schema: Schema) {
	return z.preprocess(
		(value) => (value === "" ? undefined : value),
		schema.optional(),
	);
}

const envSchema = z.object({
	/** Server- and edge-side Sentry DSN. Unset keeps Sentry inert. */
	SENTRY_DSN: optional(z.string().url()),
	/** Pino root logger level. Defaults to "info" when unset. */
	LOG_LEVEL: optional(z.enum(["debug", "info", "warn", "error"])),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
	source: Record<string, string | undefined> = process.env,
): Env {
	return envSchema.parse(source);
}

export const env = parseEnv();
