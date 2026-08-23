import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Resolves the pre-installed Chromium binary from `PLAYWRIGHT_BROWSERS_PATH`
 * instead of letting Playwright pick by its own pinned revision number. This
 * environment ships one Chromium build under a directory named for its own
 * revision (for example `chromium-1194`), which does not always match the
 * revision the installed `@playwright/test` version expects — `playwright
 * install` is not run here, so an unresolved revision mismatch would fail
 * every run with "Executable doesn't exist" instead of exercising the
 * browser that is actually present.
 */
function resolvePreinstalledChromiumExecutable(): string | undefined {
	const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;

	if (!browsersPath || !existsSync(browsersPath)) {
		return undefined;
	}

	const chromiumDir = readdirSync(browsersPath).find((entry) =>
		/^chromium-\d+$/.test(entry),
	);

	if (!chromiumDir) {
		return undefined;
	}

	const executablePath = join(
		browsersPath,
		chromiumDir,
		"chrome-linux",
		"chrome",
	);

	return existsSync(executablePath) ? executablePath : undefined;
}

const chromiumExecutablePath = resolvePreinstalledChromiumExecutable();

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: "list",
	use: {
		baseURL,
		trace: "on-first-retry",
	},
	// Chromium only: this environment ships Chromium at a pinned path and no
	// other browser binary, so a Firefox/WebKit project would fail to launch
	// rather than exercise real coverage.
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				launchOptions: chromiumExecutablePath
					? { executablePath: chromiumExecutablePath }
					: undefined,
			},
		},
	],
	// Owns the server lifecycle itself: build the OpenNext output, then serve
	// it through `wrangler dev` — the artifact that actually gets deployed,
	// rather than `next start` — and poll the base URL until it is ready.
	// `wrangler dev` runs in its default local mode (no `--remote`), so this
	// needs no Cloudflare credentials; `--port` matches `baseURL` above.
	// Skipped when the suite is deliberately retargeted at an
	// already-running deployment (see `E2E_BASE_URL` above).
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command:
					"npx opennextjs-cloudflare build && npx wrangler dev --port 3000",
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				// The OpenNext build (Turbopack + the Cloudflare bundling step) is
				// slower than `next build`, which is what the previous timeout was
				// sized for. Measured locally at ~22s for the build and ~3s for
				// `wrangler dev` to report ready; raised well past that to absorb a
				// slower CI runner.
				timeout: 300_000,
			},
});
