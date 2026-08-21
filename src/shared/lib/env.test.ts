import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
	it("parses an empty environment to an object with every field undefined", () => {
		expect(parseEnv({})).toEqual({});
	});

	it("accepts a well-formed Sentry DSN", () => {
		const result = parseEnv({
			SENTRY_DSN: "https://key@o0.ingest.sentry.io/1",
		});

		expect(result.SENTRY_DSN).toBe("https://key@o0.ingest.sentry.io/1");
	});

	it("treats an empty string as an absent value for every field", () => {
		// `.env.example` documents each variable as a bare `NAME=`, and the
		// documented setup copies that file to `.env.local` — so this is the
		// shape the process actually sees when a contributor follows the README,
		// not a hypothetical.
		expect(parseEnv({ SENTRY_DSN: "", LOG_LEVEL: "" })).toEqual({
			SENTRY_DSN: undefined,
			LOG_LEVEL: undefined,
		});
	});

	describe("when SENTRY_DSN is invalid", () => {
		it("rejects a value that is not a URL", () => {
			expect(() => parseEnv({ SENTRY_DSN: "not-a-url" })).toThrow();
		});

		it("rejects a URL whose scheme is not HTTP or HTTPS", () => {
			// The SDK fetches this address, so a parseable URL is not enough —
			// only a scheme that is safe to follow passes.
			expect(() =>
				parseEnv({ SENTRY_DSN: "ftp://key@o0.ingest.sentry.io/1" }),
			).toThrow();
		});
	});

	describe("when LOG_LEVEL is invalid", () => {
		it("rejects a level outside the allowed set", () => {
			expect(() => parseEnv({ LOG_LEVEL: "verbose" })).toThrow();
		});
	});
});
