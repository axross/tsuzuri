---
status: accepted
---

# Use a GitHub App rather than an OAuth App

Two mechanisms let a third party act on a user's GitHub repositories: a
GitHub App the user installs against chosen repositories, and an OAuth App the
user authorizes against their whole account. Both would have worked for
reading and writing a blog's files, so the choice had to be made on something
other than capability.

We chose the GitHub App. Its rate limit is granted per installation rather
than per user, which means a second customer brings their own quota instead of
sharing ours — the difference between a limit that constrains growth and one
that scales with it. Its permissions are also scoped to the repositories the
user picked, so a compromise of our credentials cannot reach the rest of their
account.

The OAuth App was rejected on the rate limit alone. Its quota is shared across
every OAuth application acting for the same user, so our throughput would
depend on what unrelated tools that user had authorized. Its all-or-nothing
account scope was a second, independent reason.

Three consequences follow, and all three are permanent.

We must run a server. The App's private key signs the JWT that mints every
installation token, and a key that reaches a browser is a key that is public.
The idea that "GitHub is the backend, so we need no backend of our own" does
not survive this decision.

We must decide the full permission set before the first user installs. Adding
a fine-grained permission later forces every existing installation to
re-approve, and until each owner does, the app keeps running on the old grant.
That is why permission to write issues or discussions is requested from the
start even though comments are not built yet: asking later would mean asking
every user again.

We must track installation state through webhooks. A user can change which
repositories the installation covers at any time, and nothing tells us except
the `installation` and `installation_repositories` events. Without handling
them we would keep calling repositories we no longer have access to.
