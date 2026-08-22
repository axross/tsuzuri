/**
 * Throwaway measurement harness — issue #5. Deleted before the pull request
 * that carries it goes ready; see the decision record this spike produces.
 *
 * Measures the jSquash family (`@jsquash/*`, per-codec WebAssembly) against
 * the fixture allowlist. This route imports only `@jsquash/*` packages plus
 * the two shared modules, so its own traced bundle reflects what jSquash
 * alone adds.
 *
 * jSquash has no GIF decoder (known going in, per the plan). The
 * `animated-gif` fixture is therefore reported as `unsupported` before any
 * fetch is spent on it, rather than left to throw partway through decode.
 *
 * Every other jSquash call here is expected to fail with a structured
 * `error` rather than a result: jSquash's own automatic WASM loader calls
 * `fetch(new URL('*.wasm', import.meta.url))`, and that fails on this stack
 * — verified on 2026-08-22, reproduced identically under both `next dev`
 * and a production `next build && next start` — because Node's `fetch`
 * rejects a `file://` URL with "not implemented... yet". A documented
 * manual-init workaround (pre-compiling the codec's own `.wasm` file and
 * handing it to that codec's `init()`) does fix this in a plain Node
 * process, but every way tried to locate that `.wasm` file from inside a
 * route at runtime broke under Next's Turbopack server bundle — see the
 * long comment above `EncodedOutput` in `../spike-encode-shared/measure.ts`
 * for what was tried and why this wasn't pursued further. This is itself
 * the accurate result for "does jSquash run in the deployed Vercel Node
 * runtime out of the box": no, and here is exactly why.
 */

import decodeJpeg from "@jsquash/jpeg/decode";
import encodeJpeg from "@jsquash/jpeg/encode";
import decodePng from "@jsquash/png/decode";
import resizeImageData from "@jsquash/resize";
import { FIXTURES } from "../spike-encode-shared/fixtures";
import {
	computeResizedDimensions,
	detectAlphaInRgba,
	type EncodedOutput,
	type FormatKey,
	parseSpikeParams,
	runPipeline,
	unsupportedReport,
} from "../spike-encode-shared/measure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The Pro maximum (verified from https://vercel.com/docs/functions/limitations
// on 2026-08-22) — the 300s default would time out on the 54 MB fixture.
export const maxDuration = 800;

const ENCODER = "@jsquash";
// Pinned exactly in package.json: @jsquash/webp 1.5.0, @jsquash/avif 2.1.1,
// @jsquash/jpeg 1.6.0, @jsquash/resize 2.1.1, @jsquash/png 3.1.1.
const ENCODER_VERSION =
	"webp@1.5.0,avif@2.1.1,jpeg@1.6.0,resize@2.1.1,png@3.1.1";

async function decodeByMime(
	bytes: Uint8Array,
	mime: string,
): Promise<ImageData> {
	const buffer = toArrayBuffer(bytes);
	if (mime === "image/jpeg") return decodeJpeg(buffer);
	if (mime === "image/png") return decodePng(buffer);
	throw new Error(`@jsquash has no decoder for ${mime}`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	// The fixtures are always fetched into a freshly-allocated Uint8Array
	// (byteOffset 0, no over-allocation), so its backing buffer is safe to
	// hand over directly.
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

async function resize(data: ImageData, longEdge: number): Promise<ImageData> {
	const target = computeResizedDimensions(data.width, data.height, longEdge);
	if (target.width === data.width && target.height === data.height) {
		return data;
	}
	return resizeImageData(data, {
		width: target.width,
		height: target.height,
		fitMethod: "stretch",
		method: "lanczos3",
		premultiply: true,
		linearRGB: false,
	});
}

async function encode(
	data: ImageData,
	format: FormatKey,
	quality: number,
): Promise<EncodedOutput> {
	let bytes: Uint8Array;
	if (format === "webp") {
		const { default: encodeWebp } = await import("@jsquash/webp/encode");
		bytes = new Uint8Array(await encodeWebp(data, { quality }));
	} else if (format === "avif") {
		const { default: encodeAvif } = await import("@jsquash/avif/encode");
		bytes = new Uint8Array(await encodeAvif(data, { quality }));
	} else {
		bytes = new Uint8Array(await encodeJpeg(data, { quality }));
	}
	return {
		bytes,
		width: data.width,
		height: data.height,
		hasAlpha: format !== "jpeg" && detectAlphaInRgba(data.data),
	};
}

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const parsed = parseSpikeParams(url.searchParams);
	if (!parsed.ok) {
		return Response.json(parsed.body, { status: 400 });
	}
	const { params } = parsed;
	const fixture = FIXTURES[params.fixtureKey];

	if (fixture.mime !== "image/jpeg" && fixture.mime !== "image/png") {
		return Response.json(
			unsupportedReport({
				encoder: ENCODER,
				encoderVersion: ENCODER_VERSION,
				fixtureKey: params.fixtureKey,
				format: params.format,
				reason: `@jsquash has no decoder for ${fixture.mime}; only image/jpeg and image/png inputs are supported.`,
			}),
		);
	}

	const report = await runPipeline({
		encoder: ENCODER,
		encoderVersion: ENCODER_VERSION,
		fixtureKey: params.fixtureKey,
		format: params.format,
		longEdge: params.longEdge,
		quality: params.quality,
		ladder: params.ladder,
		decode: (bytes) => decodeByMime(bytes, fixture.mime),
		// The only animated fixture (GIF) was already excluded above, since
		// jSquash cannot decode it at all.
		isInputAnimated: () => false,
		resize,
		encode,
	});

	// Always 200: a failing encoder still produces a data point, in `error`.
	return Response.json(report);
}
