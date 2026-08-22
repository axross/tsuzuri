import { guardSpikeRequest } from "@/shared/lib/spike-github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. Returns `bytes` bytes as a streamed response rather
 * than a buffered one, so the two can be compared against the same ceiling.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REQUESTABLE = 256 * 1024 * 1024;
const SLICE = 64 * 1024;

export function GET(request: Request) {
	const denied = guardSpikeRequest(request);
	if (denied) {
		return denied;
	}

	const bytes = Number(new URL(request.url).searchParams.get("bytes"));
	if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_REQUESTABLE) {
		return Response.json(
			{ error: `bytes must be an integer between 0 and ${MAX_REQUESTABLE}` },
			{ status: 400 },
		);
	}

	const slice = Buffer.alloc(Math.min(SLICE, bytes || 1), 0x61);
	let sent = 0;

	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent >= bytes) {
				controller.close();
				return;
			}
			const size = Math.min(slice.byteLength, bytes - sent);
			controller.enqueue(new Uint8Array(slice.subarray(0, size)));
			sent += size;
		},
	});

	// No content-length: the point is to let the platform stream it.
	return new Response(body, {
		headers: { "content-type": "application/octet-stream" },
	});
}
