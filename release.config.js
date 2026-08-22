/**
 * semantic-release configuration, run from
 * `.github/workflows/production-deployment.yaml` on a manual dispatch.
 *
 * `branches` is set explicitly rather than left to the shipped default list
 * (`main`/`master`, `next`, `next-major`, `beta`, `alpha`), which would also
 * release from branches this project does not use.
 *
 * `tagFormat` is left at its default, `v${version}` — the operator's
 * one-time `v0.1.0` tag (task C documents seeding it) matches it, so
 * semantic-release resolves that as the previous version and continues from
 * there instead of publishing `1.0.0` with no tag to read.
 */
export default {
	branches: ["main"],
	plugins: [
		[
			"@semantic-release/commit-analyzer",
			{
				releaseRules: [
					// Every version this project releases stays inside 0.x until
					// the maintainer says otherwise (issue #79), including a
					// version a commit carrying a breaking change would otherwise
					// produce. This custom rule displaces the shipped default
					// `{ breaking: true, release: "major" }`:
					// @semantic-release/commit-analyzer's own README states a
					// commit is evaluated against the default rules only when no
					// custom `releaseRules` entry matched it first, and `breaking`
					// is the same matching property the default rule uses — so
					// this rule is fully supported on its own even though
					// semantic-release's FAQ puts staying on major version zero,
					// as a whole, out of scope for the project to support.
					//
					// Remove this rule (and let the shipped default apply) once
					// the maintainer decides to leave 0.x.
					{ breaking: true, release: "minor" },
				],
			},
		],
		"@semantic-release/release-notes-generator",
		"@semantic-release/changelog",
		[
			"@semantic-release/npm",
			{
				// This package is never published to a registry; only the
				// `package.json` version is updated in place.
				npmPublish: false,
			},
		],
		"@semantic-release/git",
		[
			"@semantic-release/github",
			{
				// Off so the production workflow's GITHUB_TOKEN needs only
				// `contents: write` — the release step otherwise also wants
				// `issues: write` and `pull-requests: write` to post these.
				// See .github/workflows/production-deployment.yaml.
				successComment: false,
				failComment: false,
			},
		],
	],
};
