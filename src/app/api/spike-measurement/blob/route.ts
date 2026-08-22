import {
	getScratchRepo,
	githubRequest,
	guardSpikeRequest,
	mintInstallationTokenOrError,
	SHA_PATTERN,
} from "@/shared/lib/spike-github-app";

/**
 * Throwaway measurement scaffolding for issue #6, deleted before the pull
 * request leaves draft. GitHub does not document what becomes of a blob
 * created through the Git Blobs API and never referenced by a tree, so this
 * route observes reachability directly by SHA rather than assuming it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const denied = guardSpikeRequest(request);
	if (denied) {
		return denied;
	}

	const sha = new URL(request.url).searchParams.get("sha");
	if (!sha || !SHA_PATTERN.test(sha)) {
		return Response.json(
			{ error: "sha must be 40 or 64 lowercase hex characters" },
			{ status: 400 },
		);
	}

	const minted = await mintInstallationTokenOrError();
	if (minted instanceof Response) {
		return minted;
	}
	const { token } = minted;

	const { owner, repo } = getScratchRepo();
	const blobResponse = await githubRequest(
		token,
		`/repos/${owner}/${repo}/git/blobs/${sha}`,
		{ headers: { accept: "application/vnd.github.raw+json" } },
	);

	if (blobResponse.status === 404 || blobResponse.status === 422) {
		return Response.json({
			sha,
			reachable: false,
			status: blobResponse.status,
			bytes: null,
		});
	}

	if (!blobResponse.ok) {
		return Response.json(
			{ error: `Failed to check blob ${sha}: ${blobResponse.status}` },
			{ status: 502 },
		);
	}

	const contentType = blobResponse.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return Response.json(
			{ error: `Blob ${sha} came back as a JSON envelope, not raw bytes` },
			{ status: 502 },
		);
	}

	const bytes = (await blobResponse.arrayBuffer()).byteLength;

	return Response.json({
		sha,
		reachable: true,
		status: blobResponse.status,
		bytes,
	});
}
