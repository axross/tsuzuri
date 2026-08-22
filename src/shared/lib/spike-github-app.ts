import { createSign, timingSafeEqual } from "node:crypto";

/**
 * Throwaway measurement scaffolding for issue #6. This file is deleted
 * before the pull request leaves draft — see the decision record it feeds.
 *
 * It reads the App id and private key (COMPANION_GITHUB_APP_ID or
 * GITHUB_APP_ID, and the matching private key), plus `SPIKE_SCRATCH_REPO`
 * and `SPIKE_SHARED_SECRET` straight from `process.env` rather than through
 * `src/shared/lib/env.ts`. That wiring is issue #16's own work; pulling it
 * forward here is a non-goal this file deliberately does not take on.
 *
 * Nothing in this module may log, return, or otherwise emit the App's
 * private key or a minted installation access token — see
 * docs/conventions/security.md.
 */

const GITHUB_API_ROOT = "https://api.github.com";

/** A Git object SHA-1 (40 hex) or SHA-256 (64 hex), lowercase. Shared by every route that interpolates a caller-supplied SHA into a GitHub API path, so a malformed or path-traversing value never reaches an authenticated request. */
export const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** A PEM commonly survives an environment-variable field with literal `\n` two-character sequences instead of newlines. */
function normalizePrivateKey(rawKey: string): string {
	return rawKey.includes("\\n") ? rawKey.replaceAll("\\n", "\n") : rawKey;
}

function base64UrlEncode(input: Buffer | string): string {
	const buffer = typeof input === "string" ? Buffer.from(input) : input;
	return buffer
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/** An RS256 App JWT: `iat` backdated 60s, `exp` at most 10 minutes past `iat`, `iss` the App ID. */
function signAppJwt(appId: string, privateKey: string): string {
	const now = Math.floor(Date.now() / 1000);
	const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64UrlEncode(
		JSON.stringify({
			iat: now - 60,
			exp: now + 540,
			iss: Number.parseInt(appId, 10),
		}),
	);
	const signingInput = `${header}.${payload}`;

	const signer = createSign("RSA-SHA256");
	signer.update(signingInput);
	signer.end();
	const signature = base64UrlEncode(signer.sign(privateKey));

	return `${signingInput}.${signature}`;
}

export interface ScratchRepo {
	owner: string;
	repo: string;
}

/** Parses `SPIKE_SCRATCH_REPO` (`owner/repo`, exactly one slash) into its two parts. */
export function getScratchRepo(): ScratchRepo {
	const value = process.env.SPIKE_SCRATCH_REPO;
	if (!value) {
		throw new Error("SPIKE_SCRATCH_REPO is not configured");
	}
	const parts = value.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error("SPIKE_SCRATCH_REPO must be in owner/repo form");
	}
	const [owner, repo] = parts;
	return { owner, repo };
}

/** A bearer-authenticated request against the GitHub REST API. `token` is either the App JWT or a minted installation access token — never logged, and never included in a thrown error message. */
export async function githubRequest(
	token: string,
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	return fetch(`${GITHUB_API_ROOT}${path}`, {
		...init,
		headers: {
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
			authorization: `Bearer ${token}`,
			...init.headers,
		},
	});
}

export interface MintedToken {
	token: string;
	ms: number;
}

/**
 * Mints a fresh installation access token for the scratch repository's
 * installation: builds an RS256 App JWT, finds the installation, then mints
 * its access token. Per docs/conventions/security.md this MUST be called
 * immediately before the request that uses the token, and re-called rather
 * than reused across a lengthy sequence.
 */
export async function mintInstallationToken(): Promise<MintedToken> {
	// Accepts the companion-app names and the unqualified ones alike. The two
	// sets were configured in different places while this spike was being set
	// up, and a name mismatch here fails at measurement time with nothing but a
	// 502 to explain it. Issue #16 picks one when it wires these for real.
	const appId =
		process.env.COMPANION_GITHUB_APP_ID ?? process.env.GITHUB_APP_ID;
	const rawPrivateKey =
		process.env.COMPANION_GITHUB_APP_PRIVATE_KEY ??
		process.env.GITHUB_APP_PRIVATE_KEY;
	if (!appId || !rawPrivateKey) {
		throw new Error(
			"No App id/private key configured: set COMPANION_GITHUB_APP_ID and COMPANION_GITHUB_APP_PRIVATE_KEY, or GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY",
		);
	}
	const privateKey = normalizePrivateKey(rawPrivateKey);
	const { owner, repo } = getScratchRepo();

	const start = performance.now();
	const jwt = signAppJwt(appId, privateKey);

	const installationResponse = await githubRequest(
		jwt,
		`/repos/${owner}/${repo}/installation`,
	);
	if (!installationResponse.ok) {
		throw new Error(
			`Failed to find installation for ${owner}/${repo}: ${installationResponse.status}`,
		);
	}
	const installation = (await installationResponse.json()) as { id: number };

	const tokenResponse = await githubRequest(
		jwt,
		`/app/installations/${installation.id}/access_tokens`,
		{ method: "POST" },
	);
	if (!tokenResponse.ok) {
		throw new Error(
			`Failed to mint installation access token: ${tokenResponse.status}`,
		);
	}
	const minted = (await tokenResponse.json()) as { token: string };

	return { token: minted.token, ms: performance.now() - start };
}

/**
 * `mintInstallationToken`, wrapped so every route can handle failure the
 * same way: `instanceof Response` means mint failed and the caller should
 * return that response as-is; otherwise it is the minted token.
 */
export async function mintInstallationTokenOrError(): Promise<
	MintedToken | Response
> {
	try {
		return await mintInstallationToken();
	} catch {
		return Response.json(
			{ error: "Failed to mint installation access token" },
			{ status: 502 },
		);
	}
}

/**
 * The shared-secret guard every spike-measurement route runs first. Returns
 * a `Response` to send immediately, or `null` when the request may proceed.
 *
 * A preview URL is public and these routes write Git objects with a real
 * App key, so an unset `SPIKE_SHARED_SECRET` MUST make the route invisible
 * (404) rather than merely unauthenticated, and a set one MUST be checked
 * with a constant-time comparison over equal-length buffers.
 */
export function guardSpikeRequest(request: Request): Response | null {
	const secret = process.env.SPIKE_SHARED_SECRET;
	if (!secret) {
		return new Response(null, { status: 404 });
	}

	const provided = request.headers.get("x-spike-secret") ?? "";
	const secretBuffer = Buffer.from(secret);
	const providedBuffer = Buffer.from(provided);
	const authorized =
		secretBuffer.length === providedBuffer.length &&
		timingSafeEqual(secretBuffer, providedBuffer);

	if (!authorized) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}
