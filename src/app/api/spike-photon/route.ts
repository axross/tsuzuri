/**
 * Throwaway measurement harness — issue #5. Deleted before the pull request
 * that carries it goes ready; see the decision record this spike produces.
 *
 * Measures the `@cf-wasm/photon` candidate (Photon compiled to WebAssembly)
 * against the fixture allowlist. This route imports only `@cf-wasm/photon`
 * plus the two shared modules, so its own traced bundle reflects what
 * Photon alone adds.
 *
 * Photon's own API exposes no AVIF encoder (`PhotonImage` only offers
 * `get_bytes` (PNG), `get_bytes_jpeg`, and `get_bytes_webp` — known going
 * in, per the plan). `?format=avif` is therefore reported as `unsupported`
 * rather than left to throw.
 */

import {
	PhotonImage,
	resize as photonResize,
	SamplingFilter,
} from "@cf-wasm/photon/node";
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

const ENCODER = "@cf-wasm/photon";
// Pinned exactly in package.json.
const ENCODER_VERSION = "0.4.0";

async function decode(bytes: Uint8Array): Promise<PhotonImage> {
	return PhotonImage.new_from_byteslice(bytes);
}

async function resize(
	image: PhotonImage,
	longEdge: number,
): Promise<PhotonImage> {
	const target = computeResizedDimensions(
		image.get_width(),
		image.get_height(),
		longEdge,
	);
	if (
		target.width === image.get_width() &&
		target.height === image.get_height()
	) {
		return image;
	}
	return photonResize(
		image,
		target.width,
		target.height,
		SamplingFilter.Lanczos3,
	);
}

async function encode(
	image: PhotonImage,
	format: FormatKey,
	quality: number,
): Promise<EncodedOutput> {
	const width = image.get_width();
	const height = image.get_height();
	const hasAlpha =
		format !== "jpeg" && detectAlphaInRgba(image.get_raw_pixels());
	const bytes =
		format === "webp" ? image.get_bytes_webp() : image.get_bytes_jpeg(quality);
	return { bytes, width, height, hasAlpha };
}

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const parsed = parseSpikeParams(url.searchParams);
	if (!parsed.ok) {
		return Response.json(parsed.body, { status: 400 });
	}
	const { params } = parsed;

	if (params.format === "avif") {
		return Response.json(
			unsupportedReport({
				encoder: ENCODER,
				encoderVersion: ENCODER_VERSION,
				fixtureKey: params.fixtureKey,
				format: params.format,
				reason:
					"@cf-wasm/photon exposes no AVIF encoder (only get_bytes for PNG, get_bytes_jpeg, and get_bytes_webp).",
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
		decode,
		// Photon decodes a GIF as a single static frame (the `image` crate's
		// `load_from_memory` does not carry multiple frames into a
		// `DynamicImage`); the fixture is objectively animated even though
		// Photon flattens it, so this reports the fixture's own nature rather
		// than what Photon retained.
		isInputAnimated: () => params.fixtureKey === "animated-gif",
		resize,
		encode,
	});

	// Always 200: a failing encoder still produces a data point, in `error`.
	return Response.json(report);
}
