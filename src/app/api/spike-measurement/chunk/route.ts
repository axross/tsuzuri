import {
	getScratchRepo,
	githubRequest,
	guardSpikeRequest,
	mintInstallationTokenOrError,
} from "@/shared/lib/spike-github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. Accepts one raw chunk of the 50 MB fixture over the
 * browser-to-Function hop and commits it as an unreferenced Git blob, so the
 * measurement can tell whether that hop needs base64 at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
	const denied = guardSpikeRequest(request);
	if (denied) {
		return denied;
	}

	const uploadId = request.headers.get("x-spike-upload-id");
	const chunkIndexHeader = request.headers.get("x-spike-chunk-index");
	if (!uploadId || !chunkIndexHeader) {
		return Response.json(
			{ error: "Missing x-spike-upload-id or x-spike-chunk-index header" },
			{ status: 400 },
		);
	}
	const index = Number(chunkIndexHeader);
	if (!Number.isInteger(index) || index < 0) {
		return Response.json(
			{ error: "x-spike-chunk-index must be a non-negative integer" },
			{ status: 400 },
		);
	}

	const totalStart = performance.now();

	const chunk = await request.arrayBuffer();
	const bytes = chunk.byteLength;

	const encodeStart = performance.now();
	const content = Buffer.from(chunk).toString("base64");
	const encodeMs = performance.now() - encodeStart;

	const minted = await mintInstallationTokenOrError();
	if (minted instanceof Response) {
		return minted;
	}
	const { token, ms: tokenMint } = minted;

	const { owner, repo } = getScratchRepo();
	const blobStart = performance.now();
	const blobResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/blobs`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ content, encoding: "base64" }),
		},
	);
	if (!blobResponse.ok) {
		return Response.json(
			{ error: `Failed to create blob: ${blobResponse.status}` },
			{ status: 502 },
		);
	}
	const blob = (await blobResponse.json()) as { sha: string };
	const blobCreate = performance.now() - blobStart;
	const total = performance.now() - totalStart;

	return Response.json({
		uploadId,
		index,
		bytes,
		blobSha: blob.sha,
		ms: { total, tokenMint, encodeMs, blobCreate },
	});
}
