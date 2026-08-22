---
status: accepted
---

# Be our own authorization server and serve MCP statelessly

The MCP milestone requires deciding, before the API contract hardens, who
authorizes an MCP client to act on a blog. We read the MCP authorization
specification, revision `2026-07-28`, on 2026-08-22, expecting to delegate
authorization to GitHub as we delegate everything else. The specification
rules that out: a server MUST publish OAuth 2.0 Protected Resource Metadata
and MUST validate token audience, and GitHub returns HTTP 404 for both
`/.well-known/oauth-authorization-server` and
`/.well-known/openid-configuration`, and documents neither Dynamic Client
Registration nor the RFC 8707 `resource` parameter. We are therefore both
the authorization server and the resource server for MCP — forced, not
chosen.

Being the authorization server means registering clients ourselves, and this
revision changed the cost. Dynamic Client Registration is deprecated in this
revision and no longer required, in favor of OAuth Client ID Metadata
Documents: a client
hosts its own metadata JSON at an HTTPS URL and presents that URL as its
`client_id`. We use CIMD, so no client record is stored on our side. That
costs two things we accept knowingly: CIMD is still an IETF draft that may
move under us, and resolving a client-supplied `client_id` URL is an
outbound fetch to an attacker-chosen address — an SSRF surface the
implementation must treat as one from the start.

We use Streamable HTTP. This revision removed the GET stream endpoint and
protocol-level sessions, so a conformant server needs only a single POST
route, may answer with one JSON body instead of a stream, and ignores
rather than mints an `Mcp-Session-Id` — cheap enough to run inside a Vercel
Function bound by its 4.5 MB cap on request and response bodies alike.
Whether that cap applies cumulatively to a streamed response is unsettled in
Vercel's documentation; we record it as unverified, since nothing here
depends on the answer — we always answer with one JSON body, never a
stream. We rejected the 2025-era transport, with its session header and
resumable SSE, for the reason we reject holding any other state:
resumability needs a store we do not have.

One MCP endpoint serves every blog — a separate endpoint per blog was
rejected as needless surface — so the RFC 8707 `resource` parameter binds a
token to the application, not to one blog; the blog a call acts on is named
per tool call instead. Audience binding alone tells the server nothing about
which blog is authorized, so it authorizes every call against the blog that
call names. Tools also carry distinct, per-tool scopes rather than one
blanket grant; a call lacking the scope it needs gets `insufficient_scope`
back so a client can seek step-up authorization. This is the design's
confused-deputy surface: a user with several blogs gets one token reaching
all of them, and a leaked token reaches every blog that user has, not only
the one in use when it leaked. We accept this as a consequence of the
single-endpoint design; per-call authorization limits the damage, it does
not remove the exposure.

Minting our own tokens means holding our own token state, in a project built
on holding none. We keep it stateless the way we keep everything else
stateless: a signed, self-describing token whose only server-side dependency
is a signing key in environment configuration, not a database row. That
gives up something specific — a token cannot be revoked before it expires,
because there is no store to revoke it in — mitigated with a short token
lifetime, not solved. A consent screen is required regardless, and because
we are the authorization server, we are the party obligated to show it, not
GitHub, not the client.

MCP forces no GitHub App permission that no other feature needs. Its tools
read and write the same repository content the web application already
reads and writes, over the same installation identity the web session
already obtains, so MCP is a new way to authenticate a caller, not a new
operation against a repository. That finding needed to land before the
permission set is finalized, since adding a permission later forces every
existing installation to re-approve it. We also rejected accepting a GitHub
token directly from an MCP client: the specification forbids passthrough
outright, and doing it anyway would make every client a holder of full
GitHub credentials rather than one scoped to what MCP needs.

Two obligations fall on work after this one. `docs/conventions/security.md`
still says this project authenticates nobody; the change that first
verifies one of these tokens must replace that section, not this record.
And every finding above is documentary — no MCP client was connected to a
running server — so the empirical check stays open, tracked separately.
