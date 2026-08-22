/**
 * Throwaway measurement harness — issue #5.
 *
 * Timing, peak-memory sampling, the size ladder, and the shared
 * request/response shape for the four `spike-*` route handlers. Each handler
 * imports only its own candidate encoder plus this module and
 * `./fixtures.ts`; the encoder-specific decode/resize/encode calls stay in
 * the route file so this module never imports a candidate package itself.
 *
 * This whole directory is deleted before the pull request that carries it
 * goes ready.
 */

import { createHash } from "node:crypto";
import {
	FIXTURE_USER_AGENT,
	FIXTURES,
	type FixtureKey,
	isFixtureKey,
} from "./fixtures";

export const SUPPORTED_FORMATS = ["webp", "avif", "jpeg"] as const;
export type FormatKey = (typeof SUPPORTED_FORMATS)[number];

function isFormatKey(value: string | null): value is FormatKey {
	return (
		value !== null && (SUPPORTED_FORMATS as readonly string[]).includes(value)
	);
}

export interface ParsedSpikeParams {
	fixtureKey: FixtureKey;
	format: FormatKey;
	longEdge: number;
	quality: number;
	ladder: boolean;
}

/**
 * Resolves `fixture` and `format` against the hard-coded allowlists and
 * clamps `longEdge` / `quality` to sane ranges. Returns a 400 body (never a
 * Response — the caller decides how to send it) when `fixture` or `format`
 * does not resolve, since those two are rejected outright rather than
 * defaulted.
 */
export function parseSpikeParams(
	searchParams: URLSearchParams,
):
	| { ok: true; params: ParsedSpikeParams }
	| { ok: false; body: { error: { name: string; message: string } } } {
	const fixtureRaw = searchParams.get("fixture");
	if (!isFixtureKey(fixtureRaw)) {
		return {
			ok: false,
			body: {
				error: {
					name: "InvalidFixture",
					message: `fixture must be one of: ${Object.keys(FIXTURES).join(", ")}`,
				},
			},
		};
	}

	const formatRaw = searchParams.get("format");
	if (!isFormatKey(formatRaw)) {
		return {
			ok: false,
			body: {
				error: {
					name: "InvalidFormat",
					message: `format must be one of: ${SUPPORTED_FORMATS.join(", ")}`,
				},
			},
		};
	}

	return {
		ok: true,
		params: {
			fixtureKey: fixtureRaw,
			format: formatRaw,
			longEdge: clampInt(searchParams.get("longEdge"), 2000, 256, 8192),
			quality: clampInt(searchParams.get("quality"), 80, 1, 100),
			ladder: searchParams.get("ladder") === "1",
		},
	};
}

function clampInt(
	raw: string | null,
	fallback: number,
	min: number,
	max: number,
): number {
	const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
	const value = Number.isFinite(parsed) ? parsed : fallback;
	return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Fixture fetch + verification
// ---------------------------------------------------------------------------

export interface FetchedFixture {
	bytes: Uint8Array;
	sizeMatchesExpected: boolean;
	sha1MatchesExpected: boolean;
}

export async function fetchAndVerifyFixture(
	fixtureKey: FixtureKey,
): Promise<FetchedFixture> {
	const fixture = FIXTURES[fixtureKey];
	const res = await fetch(fixture.url, {
		headers: { "User-Agent": FIXTURE_USER_AGENT },
	});
	if (!res.ok) {
		throw new Error(
			`fixture fetch failed: ${res.status} ${res.statusText} (${fixture.url})`,
		);
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	const sha1 = createHash("sha1").update(bytes).digest("hex");
	return {
		bytes,
		sizeMatchesExpected: bytes.byteLength === fixture.expectedBytes,
		sha1MatchesExpected: sha1 === fixture.expectedSha1,
	};
}

// ---------------------------------------------------------------------------
// Peak memory sampling
// ---------------------------------------------------------------------------

export interface PeakMemory {
	peakRssBytes: number;
	peakHeapUsedBytes: number;
}

/**
 * Samples `process.memoryUsage()` on a ~25ms interval and keeps the maximum
 * of `rss` and `heapUsed` seen. This is an in-process sample of this
 * function's own memory, not the platform's own reported figure — Vercel
 * Runtime Logs are the source of truth for what the deployed function
 * actually used, and the decision record this spike produces is expected to
 * cross-check this figure against that one rather than presenting this one
 * as authoritative.
 *
 * Always call `.stop()` from a `finally` block so the interval is cleared
 * even when the measured work throws.
 */
export function startPeakMemorySampler(): { stop: () => PeakMemory } {
	const initial = process.memoryUsage();
	let peakRssBytes = initial.rss;
	let peakHeapUsedBytes = initial.heapUsed;
	const interval = setInterval(() => {
		const usage = process.memoryUsage();
		if (usage.rss > peakRssBytes) peakRssBytes = usage.rss;
		if (usage.heapUsed > peakHeapUsedBytes) peakHeapUsedBytes = usage.heapUsed;
	}, 25);
	// A route's total run can exceed the default Node timer cap on a long
	// fixture; unref so a stray sampler never keeps the process alive on its
	// own, though `.stop()` below is still always called from a `finally`.
	interval.unref?.();
	return {
		stop: () => {
			clearInterval(interval);
			return { peakRssBytes, peakHeapUsedBytes };
		},
	};
}

/**
 * Vercel's Node runtime sets this the same way AWS Lambda does, since
 * Vercel Functions run on Lambda underneath. `null` when absent (e.g. running
 * locally via `next dev`) rather than a guessed number.
 */
export function readConfiguredMemoryMb(): number | null {
	const raw = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
	if (!raw) return null;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ErrorInfo {
	name: string;
	message: string;
	stack: string;
}

export function toErrorInfo(err: unknown): ErrorInfo {
	if (err instanceof Error) {
		const firstFrame = (err.stack ?? "").split("\n").slice(1, 2)[0]?.trim();
		return { name: err.name, message: err.message, stack: firstFrame ?? "" };
	}
	return { name: "UnknownError", message: String(err), stack: "" };
}

// ---------------------------------------------------------------------------
// The size ladder
// ---------------------------------------------------------------------------

export interface LadderRung {
	longEdge: number;
	quality: number;
}

export const ONE_MB = 1024 * 1024;

export const LADDER: readonly LadderRung[] = [
	{ longEdge: 2000, quality: 80 },
	{ longEdge: 2000, quality: 75 },
	{ longEdge: 2000, quality: 70 },
	{ longEdge: 2000, quality: 65 },
	{ longEdge: 2000, quality: 60 },
	{ longEdge: 1600, quality: 80 },
	{ longEdge: 1600, quality: 75 },
	{ longEdge: 1600, quality: 70 },
	{ longEdge: 1600, quality: 65 },
	{ longEdge: 1600, quality: 60 },
	{ longEdge: 1280, quality: 80 },
	{ longEdge: 1280, quality: 75 },
	{ longEdge: 1280, quality: 70 },
	{ longEdge: 1280, quality: 65 },
	{ longEdge: 1280, quality: 60 },
];

export interface LadderTrial {
	longEdge: number;
	quality: number;
	outputBytes: number | null;
	underOneMb: boolean;
	durationMs: number | null;
	error: ErrorInfo | null;
}

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface EncodedOutput {
	bytes: Uint8Array;
	width: number;
	height: number;
	hasAlpha: boolean;
}

/*
 * A candidate whose Emscripten/wasm-bindgen glue calls
 * `fetch(new URL('*.wasm', import.meta.url))` to load its own WASM binary
 * (`@jsquash/*`, confirmed by inspecting its published glue) fails on this
 * stack — verified on 2026-08-22 under both `next dev` and a production
 * `next build && next start` — because Node's `fetch` rejects a `file://`
 * URL with "not implemented... yet", even though the same package works
 * fine in a browser bundle. Each codec also documents a manual-init path
 * for exactly this situation: hand a pre-compiled `WebAssembly.Module` to
 * its own `init()` instead of letting it fetch. That workaround was tried
 * here and works in a plain Node process (`node -e`, no bundler), but
 * every way to locate the package's own `.wasm` file at runtime from
 * *inside* a route breaks under Next's Turbopack server bundle:
 * `import.meta.resolve(dynamicSpecifier)` survives the build but is
 * stubbed at runtime (`i.resolve is not a function`), and
 * `require.resolve(dynamicSpecifier)` is refused outright ("Cannot find
 * module as expression is too dynamic") — Turbopack only resolves a
 * specifier that is a string literal at the call site, and jSquash's own
 * `.wasm` paths differ per codec and per SIMD/thread capability, so they
 * cannot all be literals in one shared helper. A per-codec literal
 * `new URL("../../../../node_modules/@jsquash/.../foo.wasm", import.meta.url)`
 * in each route might thread Turbopack's static asset detection, and
 * `next.config.ts`'s `experiments.asyncWebAssembly` is the other documented
 * escape hatch — both are next steps for whoever picks this candidate back
 * up, not attempted here since the second changes `next.config.ts`, which
 * is outside this session's authority. The `spike-jsquash` route below
 * therefore reports jSquash's own automatic loader failing as `error`,
 * which is itself the accurate result for "out of the box, on this stack".
 */

/**
 * Scales `width`x`height` down so its longer edge is at most `longEdge`,
 * preserving aspect ratio and never upsizing — the same "fit inside,
 * don't enlarge" policy `sharp`'s `fit: "inside"` and `wasm-vips`'s
 * `size: "down"` apply natively. Used by the two candidates (jSquash,
 * Photon) whose resize call takes literal target dimensions rather than a
 * long-edge constraint.
 */
export function computeResizedDimensions(
	width: number,
	height: number,
	longEdge: number,
): { width: number; height: number } {
	const currentLongEdge = Math.max(width, height);
	if (currentLongEdge <= longEdge) {
		return { width, height };
	}
	const scale = longEdge / currentLongEdge;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/**
 * Scans the alpha channel of RGBA pixel data and reports whether any pixel
 * is not fully opaque. Used by the two candidates (jSquash, Photon) whose
 * decoded representation is raw RGBA rather than a handle that already
 * knows its own alpha state (`sharp`'s and `wasm-vips`'s own `hasAlpha()`
 * are cheaper and used directly instead).
 */
export function detectAlphaInRgba(
	data: Uint8Array | Uint8ClampedArray,
): boolean {
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) return true;
	}
	return false;
}

export interface RunReport {
	encoder: string;
	encoderVersion: string;
	fixture: FixtureKey;
	input: {
		bytes: number;
		mime: string;
		expectedBytes: number;
		sizeMatchesExpected: boolean;
		sha1MatchesExpected: boolean;
	} | null;
	output: {
		bytes: number;
		format: FormatKey;
		width: number;
		height: number;
		hasAlpha: boolean;
	} | null;
	durationsMs: {
		fetch: number | null;
		decode: number | null;
		resize: number | null;
		encode: number | null;
	};
	memory: {
		peakRssBytes: number | null;
		peakHeapUsedBytes: number | null;
		configuredMemoryMb: number | null;
	};
	animated: {
		input: boolean | null;
		outputPreserved: boolean | null;
	};
	ladder: LadderTrial[] | null;
	unsupported: { reason: string } | null;
	error: ErrorInfo | null;
}

/**
 * Builds a report for an (encoder, fixture, format) combination that is
 * known not to work ahead of time — e.g. a decoder the candidate genuinely
 * lacks — without spending a fetch or a decode on it. This is itself a data
 * point the spike wants, not a failure to hide.
 */
export function unsupportedReport(opts: {
	encoder: string;
	encoderVersion: string;
	fixtureKey: FixtureKey;
	format: FormatKey;
	reason: string;
}): RunReport {
	return {
		encoder: opts.encoder,
		encoderVersion: opts.encoderVersion,
		fixture: opts.fixtureKey,
		input: null,
		output: null,
		durationsMs: { fetch: null, decode: null, resize: null, encode: null },
		memory: {
			peakRssBytes: null,
			peakHeapUsedBytes: null,
			configuredMemoryMb: readConfiguredMemoryMb(),
		},
		animated: { input: null, outputPreserved: null },
		ladder: null,
		unsupported: { reason: opts.reason },
		error: null,
	};
}

export interface RunPipelineOptions<Decoded, Resized> {
	encoder: string;
	encoderVersion: string;
	fixtureKey: FixtureKey;
	format: FormatKey;
	longEdge: number;
	quality: number;
	ladder: boolean;
	decode: (bytes: Uint8Array) => Promise<Decoded>;
	isInputAnimated: (decoded: Decoded) => boolean;
	resize: (decoded: Decoded, longEdge: number) => Promise<Resized>;
	encode: (
		resized: Resized,
		format: FormatKey,
		quality: number,
	) => Promise<EncodedOutput>;
	/** Only meaningful for the animated-gif fixture; `null` elsewhere. */
	isOutputAnimated?: (encoded: EncodedOutput) => boolean;
}

/**
 * Drives one full (encoder, fixture, format) run: fetch, decode, resize,
 * encode (once, or walking the ladder), timing every phase and sampling
 * peak memory around the whole operation. Never throws — a failure at any
 * stage becomes `error` on the returned report so the route can always
 * respond 200 with a data point.
 */
export async function runPipeline<Decoded, Resized>(
	opts: RunPipelineOptions<Decoded, Resized>,
): Promise<RunReport> {
	const fixture = FIXTURES[opts.fixtureKey];
	const sampler = startPeakMemorySampler();
	const durationsMs: RunReport["durationsMs"] = {
		fetch: null,
		decode: null,
		resize: null,
		encode: null,
	};
	let input: RunReport["input"] = null;
	let inputAnimated: boolean | null = null;

	try {
		const fetchStart = performance.now();
		const fetched = await fetchAndVerifyFixture(opts.fixtureKey);
		durationsMs.fetch = performance.now() - fetchStart;
		input = {
			bytes: fetched.bytes.byteLength,
			mime: fixture.mime,
			expectedBytes: fixture.expectedBytes,
			sizeMatchesExpected: fetched.sizeMatchesExpected,
			sha1MatchesExpected: fetched.sha1MatchesExpected,
		};

		const decodeStart = performance.now();
		const decoded = await opts.decode(fetched.bytes);
		durationsMs.decode = performance.now() - decodeStart;
		inputAnimated = opts.isInputAnimated(decoded);

		if (opts.ladder) {
			return await runLadder(opts, decoded, {
				input,
				inputAnimated,
				durationsMs,
				sampler,
			});
		}

		const resizeStart = performance.now();
		const resized = await opts.resize(decoded, opts.longEdge);
		durationsMs.resize = performance.now() - resizeStart;

		const encodeStart = performance.now();
		const encoded = await opts.encode(resized, opts.format, opts.quality);
		durationsMs.encode = performance.now() - encodeStart;

		const memory = sampler.stop();
		return {
			encoder: opts.encoder,
			encoderVersion: opts.encoderVersion,
			fixture: opts.fixtureKey,
			input,
			output: {
				bytes: encoded.bytes.byteLength,
				format: opts.format,
				width: encoded.width,
				height: encoded.height,
				hasAlpha: encoded.hasAlpha,
			},
			durationsMs,
			memory: {
				peakRssBytes: memory.peakRssBytes,
				peakHeapUsedBytes: memory.peakHeapUsedBytes,
				configuredMemoryMb: readConfiguredMemoryMb(),
			},
			animated: {
				input: inputAnimated,
				outputPreserved: opts.isOutputAnimated
					? opts.isOutputAnimated(encoded)
					: null,
			},
			ladder: null,
			unsupported: null,
			error: null,
		};
	} catch (err) {
		const memory = sampler.stop();
		return {
			encoder: opts.encoder,
			encoderVersion: opts.encoderVersion,
			fixture: opts.fixtureKey,
			input,
			output: null,
			durationsMs,
			memory: {
				peakRssBytes: memory.peakRssBytes,
				peakHeapUsedBytes: memory.peakHeapUsedBytes,
				configuredMemoryMb: readConfiguredMemoryMb(),
			},
			animated: { input: inputAnimated, outputPreserved: null },
			ladder: null,
			unsupported: null,
			error: toErrorInfo(err),
		};
	} finally {
		// In case any early return above did not already stop it (defensive —
		// calling stop() twice is harmless, clearInterval is idempotent).
		sampler.stop();
	}
}

async function runLadder<Decoded, Resized>(
	opts: RunPipelineOptions<Decoded, Resized>,
	decoded: Decoded,
	ctx: {
		input: RunReport["input"];
		inputAnimated: boolean | null;
		durationsMs: RunReport["durationsMs"];
		sampler: { stop: () => PeakMemory };
	},
): Promise<RunReport> {
	const trials: LadderTrial[] = [];
	let chosenEncoded: EncodedOutput | null = null;
	let chosenRung: LadderRung | null = null;

	for (const rung of LADDER) {
		const rungStart = performance.now();
		try {
			const resized = await opts.resize(decoded, rung.longEdge);
			const encoded = await opts.encode(resized, opts.format, rung.quality);
			const durationMs = performance.now() - rungStart;
			const underOneMb = encoded.bytes.byteLength < ONE_MB;
			trials.push({
				longEdge: rung.longEdge,
				quality: rung.quality,
				outputBytes: encoded.bytes.byteLength,
				underOneMb,
				durationMs,
				error: null,
			});
			chosenEncoded = encoded;
			chosenRung = rung;
			if (underOneMb) break;
		} catch (err) {
			trials.push({
				longEdge: rung.longEdge,
				quality: rung.quality,
				outputBytes: null,
				underOneMb: false,
				durationMs: performance.now() - rungStart,
				error: toErrorInfo(err),
			});
		}
	}

	const memory = ctx.sampler.stop();
	return {
		encoder: opts.encoder,
		encoderVersion: opts.encoderVersion,
		fixture: opts.fixtureKey,
		input: ctx.input,
		output:
			chosenEncoded && chosenRung
				? {
						bytes: chosenEncoded.bytes.byteLength,
						format: opts.format,
						width: chosenEncoded.width,
						height: chosenEncoded.height,
						hasAlpha: chosenEncoded.hasAlpha,
					}
				: null,
		durationsMs: ctx.durationsMs,
		memory: {
			peakRssBytes: memory.peakRssBytes,
			peakHeapUsedBytes: memory.peakHeapUsedBytes,
			configuredMemoryMb: readConfiguredMemoryMb(),
		},
		animated: {
			input: ctx.inputAnimated,
			outputPreserved:
				opts.isOutputAnimated && chosenEncoded
					? opts.isOutputAnimated(chosenEncoded)
					: null,
		},
		ladder: trials,
		unsupported: null,
		error: trials.every((t) => t.error)
			? trials[trials.length - 1].error
			: null,
	};
}
