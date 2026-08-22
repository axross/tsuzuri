/**
 * Throwaway measurement harness — issue #5. Deleted before the pull request
 * that carries it goes ready; see the decision record this spike produces.
 *
 * Measures the `sharp` candidate (native libvips) against the fixture
 * allowlist. This route imports only `sharp` plus the two shared modules —
 * no other candidate encoder is reachable from here, so this route's own
 * traced bundle reflects what `sharp` alone adds.
 */

import sharp, { type Metadata, type Sharp } from "sharp";
import {
	type EncodedOutput,
	type FormatKey,
	parseSpikeParams,
	runPipeline,
} from "../spike-encode-shared/measure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The Pro maximum (verified from https://vercel.com/docs/functions/limitations
// on 2026-08-22) — the 300s default would time out on the 54 MB fixture.
export const maxDuration = 800;

const ENCODER = "sharp";
// Pinned exactly in package.json; hardcoded rather than read from
// sharp/package.json so this route's own module graph stays about sharp's
// code alone, not a JSON-import mechanism.
const ENCODER_VERSION = "0.35.3";

interface Decoded {
	image: Sharp;
	metadata: Metadata;
}

async function decode(bytes: Uint8Array): Promise<Decoded> {
	// `animated: true` loads every page of a multi-page source (an animated
	// GIF) rather than only the first frame; `limitInputPixels: false`
	// disables sharp's default pixel-count ceiling, which the 50 MB / ~42MP
	// fixture would otherwise be close to.
	const image = sharp(bytes, { animated: true, limitInputPixels: false });
	const metadata = await image.metadata();
	return { image, metadata };
}

function isInputAnimated(decoded: Decoded): boolean {
	return (decoded.metadata.pages ?? 1) > 1;
}

async function resize(decoded: Decoded, longEdge: number): Promise<Sharp> {
	// `.clone()` because the ladder calls resize repeatedly from the same
	// decoded source, and a sharp pipeline can only be consumed once.
	return decoded.image.clone().resize({
		width: longEdge,
		height: longEdge,
		fit: "inside",
		withoutEnlargement: true,
	});
}

async function encode(
	resized: Sharp,
	format: FormatKey,
	quality: number,
): Promise<EncodedOutput> {
	const pipeline =
		format === "webp"
			? resized.webp({ quality })
			: format === "avif"
				? resized.avif({ quality })
				: resized.jpeg({ quality });

	const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
	return {
		bytes: data,
		width: info.width,
		height: info.height,
		// jpeg output is always flattened to 3 channels; webp/avif keep 4 when
		// the source (or sharp's own encoding) carries an alpha plane.
		hasAlpha: info.channels === 4,
	};
}

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const parsed = parseSpikeParams(url.searchParams);
	if (!parsed.ok) {
		return Response.json(parsed.body, { status: 400 });
	}
	const { params } = parsed;

	const report = await runPipeline({
		encoder: ENCODER,
		encoderVersion: ENCODER_VERSION,
		fixtureKey: params.fixtureKey,
		format: params.format,
		longEdge: params.longEdge,
		quality: params.quality,
		ladder: params.ladder,
		decode,
		isInputAnimated,
		resize,
		encode,
	});

	// Always 200: a failing encoder still produces a data point, in `error`.
	return Response.json(report);
}
