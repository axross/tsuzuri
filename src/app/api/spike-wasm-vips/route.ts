/**
 * Throwaway measurement harness — issue #5. Deleted before the pull request
 * that carries it goes ready; see the decision record this spike produces.
 *
 * Measures the `wasm-vips` candidate (libvips compiled to WebAssembly)
 * against the fixture allowlist. This route imports only `wasm-vips` plus
 * the two shared modules, so its own traced bundle reflects what
 * `wasm-vips` alone adds.
 */

import Vips from "wasm-vips";
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

const ENCODER = "wasm-vips";
// Pinned exactly in package.json.
const ENCODER_VERSION = "0.0.18";

type VipsImage = Vips.Image;
type VipsModule = Awaited<ReturnType<typeof Vips>>;

// wasm-vips's own module init compiles/instantiates the WebAssembly module;
// reuse it across requests within the same warm instance rather than
// re-initializing per invocation.
let vipsModulePromise: Promise<VipsModule> | null = null;
function getVipsModule(): Promise<VipsModule> {
	vipsModulePromise ??= Vips();
	return vipsModulePromise;
}

interface Decoded {
	image: VipsImage;
	vips: VipsModule;
}

async function decode(bytes: Uint8Array): Promise<Decoded> {
	const vips = await getVipsModule();
	const image = vips.Image.newFromBuffer(bytes);
	return { image, vips };
}

function isInputAnimated(decoded: Decoded): boolean {
	// "n-pages" is a standard libvips header field reporting the total page
	// count of the source even when only the first page was loaded.
	try {
		return decoded.image.getInt("n-pages") > 1;
	} catch {
		return false;
	}
}

async function resize(decoded: Decoded, longEdge: number): Promise<VipsImage> {
	return decoded.image.thumbnailImage(longEdge, {
		height: longEdge,
		size: decoded.vips.Size.down,
	});
}

const SUFFIX_BY_FORMAT: Record<FormatKey, string> = {
	webp: ".webp",
	avif: ".avif",
	jpeg: ".jpg",
};

async function encode(
	resized: VipsImage,
	format: FormatKey,
	quality: number,
): Promise<EncodedOutput> {
	// The options bag's declared type in wasm-vips's own `.d.ts` is the
	// structurally-empty `{}` for every save operation regardless of format,
	// since the real per-format option set can't be expressed generically —
	// `Q` is real and documented (it's libvips' own quality option name), so
	// this cast is a typing gap in the upstream `.d.ts`, not a made-up option.
	const bytes = resized.writeToBuffer(SUFFIX_BY_FORMAT[format], {
		Q: quality,
	} as unknown as Record<string, never>);
	return {
		bytes,
		width: resized.width,
		height: resized.height,
		hasAlpha: resized.hasAlpha(),
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
