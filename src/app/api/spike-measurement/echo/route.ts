import { guardSpikeRequest } from "../github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. Bisects the request-body size at which Vercel
 * actually rejects a Function request, so it does nothing beyond reading the
 * body and reporting its length — any rejection observed here is
 * unambiguously the platform's, not this route's.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const denied = guardSpikeRequest(request);
	if (denied) {
		return denied;
	}

	const body = await request.arrayBuffer();

	return Response.json({ received: body.byteLength });
}
