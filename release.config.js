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

/**
 * Neither `@semantic-release/commit-analyzer` nor
 * `@semantic-release/release-notes-generator` is given a `preset` below, so
 * both default to `conventional-changelog-angular`, whose `headerPattern`
 * (`/^(\w*)(?:\((.*)\))?: (.*)$/`) has no `!` in it and so does not match a
 * bare-`!` breaking-change header at all — a form
 * `.claude/skills/conventional-commits/SKILL.md` explicitly sanctions
 * (`feat(api)!: drop support for Node 18`, no `BREAKING CHANGE:` footer).
 * Left unfixed, that commit's `type` comes back unparsed and its `notes`
 * come back empty, so neither the custom `{ breaking: true, release: "minor" }`
 * rule below nor any shipped default ever matches it: it contributes no
 * release type at all, rather than the minor bump `!` is supposed to mean.
 *
 * `breakingHeaderPattern` is `conventional-commits-parser`'s own mechanism
 * for this, not a bespoke workaround: when set, the parser tries it before
 * `headerPattern` for every commit, so a `!` header is parsed by it instead
 * (still filling `type`/`scope`/`subject` through the same
 * `headerCorrespondence`, since the three capture groups here match its
 * default order), and separately synthesizes a `BREAKING CHANGE` note from
 * the header's own description whenever no explicit `BREAKING CHANGE:`
 * footer already supplied one (`commit.notes.length === 0` at that point) —
 * confirmed by reading `conventional-commits-parser`'s `CommitParser.parse`
 * (`parseHeader`, `parseBreakingHeader`) rather than assumed. A header with
 * no `!` doesn't match this pattern at all, so `fix:`, `feat:`, and
 * `BREAKING CHANGE:`-footer commits parse exactly as they did before.
 *
 * Passed to both plugins that parse commits — analysis and release-notes
 * generation — so the changelog doesn't inherit the same blind spot the
 * analyzer had.
 */
const parserOpts = {
	breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
};

export default {
	branches: ["main"],
	plugins: [
		[
			"@semantic-release/commit-analyzer",
			{
				parserOpts,
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
		["@semantic-release/release-notes-generator", { parserOpts }],
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
