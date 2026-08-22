import { createHash } from "node:crypto";
import {
	getScratchRepo,
	githubRequest,
	guardSpikeRequest,
	mintInstallationTokenOrError,
	SHA_PATTERN,
} from "@/shared/lib/spike-github-app";

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

/**
 * Bounds concurrent blob-fetch requests during reassembly. GitHub recommends
 * at most 15 Git read operations per second per repository
 * (docs/conventions/github-platform-limits.md); an unbounded fan-out here
 * would risk that ceiling and would also self-inflict latency that inflates
 * the "unreferenced Git blobs" option's measured cost.
 */
const BLOB_FETCH_CONCURRENCY = 8;

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

/** Non-empty, no leading `/`, no `..` segment, no backslash. */
function isValidCommitPath(path: string): boolean {
	if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
		return false;
	}
	return !path.split("/").some((segment) => segment === "..");
}

type BlobFetchResult =
	| { chunks: Buffer[]; error?: undefined }
	| { chunks?: undefined; error: Response };

/**
 * Fetches every blob in `blobShas`, bounded to `BLOB_FETCH_CONCURRENCY`
 * requests in flight. Reassembly order matches `blobShas` regardless of
 * resolution order, since each worker writes into its claimed index rather
 * than appending.
 */
async function fetchBlobsConcurrently(
	token: string,
	owner: string,
	repo: string,
	blobShas: string[],
): Promise<BlobFetchResult> {
	const chunks: Buffer[] = new Array(blobShas.length);
	let nextIndex = 0;
	let failure: Response | undefined;

	async function worker(): Promise<void> {
		let index = nextIndex++;
		while (index < blobShas.length) {
			const sha = blobShas[index];
			const blobResponse = await githubRequest(
				token,
				`/repos/${owner}/${repo}/git/blobs/${sha}`,
				{ headers: { accept: "application/vnd.github.raw+json" } },
			);
			if (!blobResponse.ok) {
				failure ??= Response.json(
					{ error: `Failed to fetch blob ${sha}: ${blobResponse.status}` },
					{ status: 502 },
				);
			} else {
				const contentType = blobResponse.headers.get("content-type") ?? "";
				if (contentType.includes("application/json")) {
					failure ??= Response.json(
						{
							error: `Blob ${sha} came back as a JSON envelope, not raw bytes`,
						},
						{ status: 502 },
					);
				} else {
					chunks[index] = Buffer.from(await blobResponse.arrayBuffer());
				}
			}
			index = nextIndex++;
		}
	}

	const workerCount = Math.min(BLOB_FETCH_CONCURRENCY, blobShas.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	if (failure) {
		return { error: failure };
	}
	return { chunks };
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

	if (blobShas.some((sha) => !SHA_PATTERN.test(sha))) {
		return Response.json(
			{
				error: "Every blobShas entry must be 40 or 64 lowercase hex characters",
			},
			{ status: 400 },
		);
	}
	if (!isValidCommitPath(path)) {
		return Response.json(
			{
				error:
					"path must be non-empty, have no leading /, no .. segment, and no backslash",
			},
			{ status: 400 },
		);
	}

	const concurrency = Math.min(BLOB_FETCH_CONCURRENCY, blobShas.length);
	const totalStart = performance.now();

	const minted = await mintInstallationTokenOrError();
	if (minted instanceof Response) {
		return minted;
	}
	const { token, ms: tokenMint } = minted;

	const { owner, repo } = getScratchRepo();

	const fetchBlobsStart = performance.now();
	const fetched = await fetchBlobsConcurrently(token, owner, repo, blobShas);
	const fetchBlobs = performance.now() - fetchBlobsStart;
	if (fetched.error) {
		return fetched.error;
	}
	const combined = Buffer.concat(fetched.chunks);

	const observedSha256 = createHash("sha256").update(combined).digest("hex");
	const sha256Match = observedSha256 === expectedSha256;

	if (!sha256Match) {
		return Response.json(
			{
				error:
					"Reassembled bytes did not match expectedSha256; nothing was committed",
				bytes: combined.byteLength,
				sha256Match,
				concurrency,
				ms: { tokenMint, fetchBlobs, total: performance.now() - totalStart },
			},
			{ status: 502 },
		);
	}

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
		// The upstream message is what says *why* a blob of this size was
		// refused, which is the measurement's result rather than noise. GitHub
		// error bodies for this endpoint carry no credential; the token is only
		// ever sent, never echoed.
		const detail = (await finalBlobResponse.text()).slice(0, 500);
		return Response.json(
			{
				error: `Failed to create final blob: ${finalBlobResponse.status}`,
				detail,
				bytes: combined.byteLength,
				base64Bytes: Buffer.byteLength(combined.toString("base64")),
				sha256Match,
				concurrency,
				ms: {
					tokenMint,
					fetchBlobs,
					createFinalBlob: performance.now() - createFinalBlobStart,
				},
			},
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
		concurrency,
		ms: { tokenMint, fetchBlobs, createFinalBlob, commit, total },
	});
}
