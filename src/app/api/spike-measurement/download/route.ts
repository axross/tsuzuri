import { guardSpikeRequest } from "@/shared/lib/spike-github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. Returns `bytes` bytes in one buffered response, so the
 * size at which the platform refuses a response body can be observed the same
 * way the request-side cliff was.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUESTABLE = 64 * 1024 * 1024;

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

	return new Response(Buffer.alloc(bytes, 0x61), {
		headers: {
			"content-type": "application/octet-stream",
			"content-length": String(bytes),
		},
	});
}
