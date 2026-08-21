# Security

This application holds credentials for repositories it does not own and
publishes content readers did not write, so two questions decide most of its
security posture: who may hold a token, and who owns the session. The general
practice — input validation, output encoding, SSRF, dependency risk — is owned
by the installed `application-security` capability and is not restated here.
What follows is only this project's own answer.

## The App's Private Key Never Leaves the Server

The **companion app**'s private key signs the JWT that mints every
**installation access token**. It MUST exist only in server-side environment
configuration, and MUST NOT be read by any code that can run in a browser —
which in this codebase means it MUST NOT be referenced from a client component
or from any variable whose name the framework exposes to the client bundle.

This is the reason this project has a server at all. A design that reached
GitHub straight from the browser would have to ship the key, and there is no
version of that which is safe.

## An Installation Token Is Never Sent to a Client

An **installation access token** carries write access to a user's repository
and expires an hour after it is minted. It MUST stay server-side: never in a
response body, never in a cookie, never in a URL, never in a log line.

Because an hour is short enough to elapse mid-operation, code that performs a
long upload MUST mint its token immediately before the request that uses it
and re-mint rather than reuse across a lengthy sequence.

## A Reader's Token Acts Only as That Reader

A **reader comment** is posted with the reader's own **user access token**, so
it appears under their name and counts against their own quota. The
application MUST NOT post a reader's comment using an **installation access
token**, which would attribute a stranger's words to the app.

The one write the app makes on its own identity is creating a **comment
thread** that does not exist yet, so the first reader to comment does not
become the person who opened the discussion.

## Session Cookies Are This Application's, Not GitHub's

This application issues its own session cookie after an OAuth exchange; GitHub
issues none to us. That cookie MUST be `HttpOnly`, `Secure`, and
`SameSite=Lax`, and its lifetime MUST NOT exceed the underlying token's. The
session record — not the browser — holds the GitHub token; the cookie carries
an opaque identifier and nothing else.

## There Is No Lockout Threshold Here, Deliberately

This project authenticates nobody. It has no password, no credential-stuffing
surface, and therefore no failed-attempt threshold, no lockout window, and no
account-recovery flow to protect. Every identity decision is GitHub's, and
rate-limiting a login is GitHub's problem rather than ours.

This is stated rather than left silent because its absence would otherwise
read as an oversight. A change that introduces any credential this application
verifies itself invalidates this section and MUST replace it.

## Secrets Stay Out of the Tree

`.env.example` documents variable **names** and carries no values. Real values
live in `.env.local`, which `.gitignore` excludes, and in the hosting
platform's own environment configuration. A change MUST NOT commit a token, a
key, a DSN, or an internal hostname, and MUST NOT print one into a log, a
comment, or a commit message.
