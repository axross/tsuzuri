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

	describe("when SENTRY_DSN is invalid", () => {
		it("rejects a value that is not a URL", () => {
			expect(() => parseEnv({ SENTRY_DSN: "not-a-url" })).toThrow();
		});
	});

	describe("when LOG_LEVEL is invalid", () => {
		it("rejects a level outside the allowed set", () => {
			expect(() => parseEnv({ LOG_LEVEL: "verbose" })).toThrow();
		});
	});
});
