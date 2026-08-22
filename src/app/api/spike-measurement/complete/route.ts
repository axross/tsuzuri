import { createHash } from "node:crypto";
import {
	getScratchRepo,
	githubRequest,
	guardSpikeRequest,
	mintInstallationToken,
} from "../github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. Reassembles the chunk blobs a completed upload
 * named, verifies the reassembled bytes by hash, and commits them through
 * the Git Data API — the slot re-encoding (issue #5) would sit in, though
 * this spike does not perform it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface CompleteRequestBody {
	uploadId: string;
	blobShas: string[];
	expectedSha256: string;
	path: string;
}

function isCompleteRequestBody(value: unknown): value is CompleteRequestBody {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const body = value as Record<string, unknown>;
	return (
		typeof body.uploadId === "string" &&
		Array.isArray(body.blobShas) &&
		body.blobShas.every((sha) => typeof sha === "string") &&
		typeof body.expectedSha256 === "string" &&
		typeof body.path === "string"
	);
}

export async function POST(request: Request) {
	const denied = guardSpikeRequest(request);
	if (denied) {
		return denied;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json(
			{ error: "Request body must be valid JSON" },
			{ status: 400 },
		);
	}
	if (!isCompleteRequestBody(body)) {
		return Response.json(
			{
				error:
					"Request body must have uploadId, blobShas, expectedSha256, and path",
			},
			{ status: 400 },
		);
	}
	const { blobShas, expectedSha256, path } = body;

	const totalStart = performance.now();

	let token: string;
	let tokenMint: number;
	try {
		({ token, ms: tokenMint } = await mintInstallationToken());
	} catch {
		return Response.json(
			{ error: "Failed to mint installation access token" },
			{ status: 502 },
		);
	}

	const { owner, repo } = getScratchRepo();

	const fetchBlobsStart = performance.now();
	const chunks: Buffer[] = [];
	for (const sha of blobShas) {
		const blobResponse = await githubRequest(
			token,
			`/repos/${owner}/${repo}/git/blobs/${sha}`,
			{ headers: { accept: "application/vnd.github.raw" } },
		);
		if (!blobResponse.ok) {
			return Response.json(
				{ error: `Failed to fetch blob ${sha}: ${blobResponse.status}` },
				{ status: 502 },
			);
		}
		chunks.push(Buffer.from(await blobResponse.arrayBuffer()));
	}
	const combined = Buffer.concat(chunks);
	const fetchBlobs = performance.now() - fetchBlobsStart;

	const observedSha256 = createHash("sha256").update(combined).digest("hex");
	const sha256Match = observedSha256 === expectedSha256;

	const createFinalBlobStart = performance.now();
	const finalBlobResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/blobs`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				content: combined.toString("base64"),
				encoding: "base64",
			}),
		},
	);
	if (!finalBlobResponse.ok) {
		return Response.json(
			{ error: `Failed to create final blob: ${finalBlobResponse.status}` },
			{ status: 502 },
		);
	}
	const finalBlob = (await finalBlobResponse.json()) as { sha: string };
	const createFinalBlob = performance.now() - createFinalBlobStart;

	const commitStart = performance.now();

	const repoResponse = await githubRequest(token, `/repos/${owner}/${repo}`);
	if (!repoResponse.ok) {
		return Response.json(
			{ error: `Failed to read repository: ${repoResponse.status}` },
			{ status: 502 },
		);
	}
	const repoInfo = (await repoResponse.json()) as { default_branch: string };

	const refResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/ref/heads/${repoInfo.default_branch}`,
	);
	if (!refResponse.ok) {
		return Response.json(
			{ error: `Failed to read branch ref: ${refResponse.status}` },
			{ status: 502 },
		);
	}
	const ref = (await refResponse.json()) as { object: { sha: string } };

	const parentCommitResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`,
	);
	if (!parentCommitResponse.ok) {
		return Response.json(
			{
				error: `Failed to read parent commit: ${parentCommitResponse.status}`,
			},
			{ status: 502 },
		);
	}
	const parentCommit = (await parentCommitResponse.json()) as {
		tree: { sha: string };
	};

	const treeResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/trees`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				base_tree: parentCommit.tree.sha,
				tree: [{ path, mode: "100644", type: "blob", sha: finalBlob.sha }],
			}),
		},
	);
	if (!treeResponse.ok) {
		return Response.json(
			{ error: `Failed to create tree: ${treeResponse.status}` },
			{ status: 502 },
		);
	}
	const tree = (await treeResponse.json()) as { sha: string };

	const newCommitResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/commits`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				message: `spike: commit reassembled upload for ${path}`,
				tree: tree.sha,
				parents: [ref.object.sha],
			}),
		},
	);
	if (!newCommitResponse.ok) {
		return Response.json(
			{ error: `Failed to create commit: ${newCommitResponse.status}` },
			{ status: 502 },
		);
	}
	const newCommit = (await newCommitResponse.json()) as { sha: string };

	const updateRefResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/refs/heads/${repoInfo.default_branch}`,
		{
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ sha: newCommit.sha }),
		},
	);
	if (!updateRefResponse.ok) {
		return Response.json(
			{ error: `Failed to update branch ref: ${updateRefResponse.status}` },
			{ status: 502 },
		);
	}

	const commit = performance.now() - commitStart;
	const total = performance.now() - totalStart;

	return Response.json({
		bytes: combined.byteLength,
		sha256Match,
		finalBlobSha: finalBlob.sha,
		commitSha: newCommit.sha,
		ms: { tokenMint, fetchBlobs, createFinalBlob, commit, total },
	});
}
