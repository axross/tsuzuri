---
status: accepted
---

# Author save commits as the user

Whether a save commit could carry the author's own name, rather than the
companion app's bot identity, was left open by two earlier decisions pulling
in opposite directions: `2026-08-21-split-writes-across-two-commit-paths.md`
chose `createCommitOnBranch` for text writes on the strength of its
server-verified `expectedHeadOid`, its atomicity, and its GitHub-side signing;
`2026-08-21-use-a-github-app-rather-than-an-oauth-app.md` chose the App form
because its rate limit is granted per installation rather than per user.
Authoring a commit as the user means authenticating as the user, which is the
quota model the second decision rejected — so the open question was whether
user authorship was reachable at all, and at what cost. Every claim below was
read from GitHub's own current documentation on 2026-08-22.

**It is reachable.** `createCommitOnBranch`, called with a GitHub App **user
access token**, "Appends a commit to the given branch as the authenticated
user" ([GraphQL reference: Commits](https://docs.github.com/en/graphql/reference/commits),
read 2026-08-22), and "A commit created by a successful execution of this
mutation will be authored by the owner of the credential which authenticates
the API request" (same page, read 2026-08-22). A save reads as authored by the
person who made it, on the write path the earlier decision already chose.

**The token and its permissions.** What a user access token can reach is
bounded twice over: "The success of an API request with a user access token
depends on the user's permissions as well as the app's permissions," and a
GraphQL call the app's permission set does not cover "will return a `401`
response" ([Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
read 2026-08-22, both quotes). The repository permission the write itself
needs is **Contents: write** — the same permission the app already requests
for its app-authored path, requested "to use an installation or user access
token to authenticate for HTTP-based Git access" (same page, read 2026-08-22)
— so the fine-grained permission set the app registers is unchanged. What
changes is that the app's own registration must be able to **issue** user
access tokens at all, which it does not need to today. A third bound sits
with the person: "The app can only access resources that the user has access
to" ([Authenticating with a GitHub App on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user),
read 2026-08-22) — a bound this project's product already satisfies, since an
author only ever saves to a repository they installed the companion app on.

**The author and the committer.** The mutation "does not support specifying
the author or committer of the commit and will not add support for this in
the future" (GraphQL reference: Commits, read 2026-08-22). The author is
fixed to the credential owner, so a save is authored by the person who saved
it. The committer is fixed too, but to neither party: "The committer will be
identical to that of commits authored using the web interface" (same page,
read 2026-08-22) — the same GitHub web identity every edit made in GitHub's
own editor carries, not the application's bot identity and not the author.

**The signature.** The commit is signed, but not by the author's own key:
"Commits made using this mutation are automatically signed by GitHub if
supported and will be marked as verified in the user interface" (GraphQL
reference: Commits, read 2026-08-22). It displays **Verified**; it does not
carry the author's personal signature. A change wanting "full control over
author and committer information" would need the Git Database REST API
instead (same page, read 2026-08-22) — the path this project already reserves
for media, per `2026-08-21-split-writes-across-two-commit-paths.md`.

**The rate limit, and what it does to the earlier App decision.** The call is
billed against the author's own quota, not the app's: "Primary rate limits
for GitHub App user access tokens (as opposed to installation access tokens)
are dictated by the primary rate limits for the authenticated user," and that
limit "is combined with any requests that another GitHub App or OAuth app
makes on that user's behalf and any requests that the user makes with a
personal access token" ([Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
read 2026-08-22, both quotes). For GraphQL specifically that budget is
**5,000 points per hour per user** ([Rate limits and node limits for the
GraphQL API](https://docs.github.com/en/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api),
read 2026-08-22) — the same shared-quota shape
`2026-08-21-use-a-github-app-rather-than-an-oauth-app.md` rejected for the
OAuth App, now returned for the write path alone. Reads are unaffected: they
stay on the installation token, which starts at 5,000 requests per hour and
caps at 12,500 (Rate limits for the REST API, read 2026-08-22), and that
installation-scoped growth is what the earlier decision's argument was
actually about, because reads scale with traffic while writes scale with
edits. Writes are further bounded by limits this project already accepts —
autosave produces no commits, an explicit save is debounced to at least ten
seconds apart, and GitHub's recommended push rate is six per minute per
repository — so at most a few hundred saves an hour per author sit well
inside a 5,000-point budget the author is unlikely to be contending for
otherwise. This finding qualifies
`2026-08-21-use-a-github-app-rather-than-an-oauth-app.md`'s rate-limit
argument without overturning it: per-installation billing still holds for
reads and for growth, and it is only the write path that now shares the
author's own quota.

**The rejected fallback.** Had user authorship not been reachable, the
fallback was an app-authored commit carrying a `Co-authored-by:` trailer.
GitHub's own changelog frames the mutation for exactly this pair of shapes:
"GitHub Apps can use the mutation to author commits directly or on behalf of
users" ([A simpler API for authoring commits](https://github.blog/changelog/2021-09-13-a-simpler-api-for-authoring-commits/),
GitHub Changelog, read 2026-08-22) — this decision takes the first shape, not
the second. Taking the fallback instead would have kept the application's own
bot identity as the commit's visible author, with the person's name appearing
only as a co-author trailer line, credited toward their own contribution
graph only if that trailer's address is one "associated with their account on
GitHub.com" ([Creating a commit with multiple authors](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors),
read 2026-08-22). We rejected it because user authorship turned out to be
reachable directly, at no cost the fallback would have avoided.

**What is still unverified.** Two claims no GitHub documentation settles, and
this record leaves unverified rather than asserting: **which email address**
`createCommitOnBranch` writes into the commit's author field — the account's
primary address, or the `ID+USERNAME@users.noreply.github.com` form used when
the author has email privacy enabled; and **whether the resulting commit is
in fact credited** on the author's contribution graph. The second claim
follows from the first if and only if the address GitHub picks is one linked
to the account, which is the same condition contribution-graph counting
states generally — "Commits must be made with an email address that is
connected to your account on GitHub, or the GitHub-provided `noreply` email
address," counted only on the repository's default branch or `gh-pages` and
never in a fork ([Why are my contributions not showing up on my
profile?](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/why-are-my-contributions-not-showing-up-on-my-profile),
read 2026-08-22, both facts) — but no documentation states which address the
mutation itself picks, so neither claim can be marked verified from a primary
source. Settling either needs an observed response from a registered app and
a minted user token, which this investigation did not run;
[issue #59](https://github.com/axross/tsuzuri/issues/59) carries the two claims
and the steps that would settle them.

The consequence lands in this same change: the webhook exclusion this project
relies on identified our own writes by the application's bot identity, and a
user-authored save no longer carries one. `docs/conventions/github-platform-limits.md`'s
"Exclude Our Own Commits From the Webhook" section is corrected alongside
this record. Two assumptions bound this decision: the author has installed
the companion app on the repository being written to, so a user token's reach
is never the blocking factor; and a post commits to a repository's default
branch rather than to a fork or a side branch, which is a condition
contribution-graph counting places on both the claim above and the product as
designed.
