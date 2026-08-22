---
status: accepted
---

# Be our own authorization server and serve MCP statelessly

The MCP milestone requires deciding who authorizes an MCP client to act on a
blog, before the API contract hardens. We read the MCP authorization
specification, revision `2026-07-28`, on 2026-08-22, expecting to delegate
that to GitHub as we delegate every other identity question. The
specification rules it out: a server MUST publish OAuth 2.0 Protected
Resource Metadata and MUST validate token audience, and GitHub returns HTTP
404 for both `/.well-known/oauth-authorization-server` and
`/.well-known/openid-configuration`, documenting neither Dynamic Client
Registration nor the RFC 8707 `resource` parameter. We are therefore both
the authorization server and the resource server for MCP — forced, not
chosen.

Registering clients would normally follow, and this revision changed that
cost. Dynamic Client Registration is deprecated here in favour of OAuth
Client ID Metadata Documents: a client hosts its metadata JSON at an HTTPS
URL and presents that URL as its `client_id`. We chose them, so we store no
client record at all. Two costs come with that, and we take both knowingly:
the mechanism is still an IETF draft that may move under us, and resolving a
client-supplied URL is an outbound fetch to an attacker-chosen address — an
SSRF surface the implementation must treat as one.

We chose Streamable HTTP. This revision removed the GET stream endpoint and
protocol-level sessions, so a conformant server needs only a single POST
route, may answer with one JSON body instead of a stream, and ignores rather
than mints an `Mcp-Session-Id` — cheap enough to run inside a Vercel
Function under the body limit the platform already imposes. How that limit
applies to a streamed response we did not settle; nothing turns on it,
because we always answer with one JSON body. We rejected the 2025-era
transport, with its session header and resumable SSE, for the reason we
reject any other state: resumability needs a store we do not have.

One endpoint serves every blog — a separate endpoint per blog was rejected
as needless surface — so the `resource` parameter binds a token to the
application rather than to one blog, and the blog a call acts on is named
per tool call. Audience binding therefore tells the server nothing about
which blog is authorized, and it must authorize every call against the blog
that the call names. Tools carry distinct, per-tool scopes rather than one
blanket grant; a call lacking its scope gets `insufficient_scope` back, so a
client can seek step-up authorization. The cost is a confused-deputy surface
we accept: a user with several blogs gets one token reaching all of them,
and per-call authorization limits that damage without removing it.

Minting our own tokens means holding token state, in a project built on
holding none. We chose to keep it stateless the way we keep everything
else stateless: a signed, self-describing token whose only server-side
dependency is a signing key in environment configuration. That gives up
something specific — a token cannot be revoked before it expires, because
there is no store to revoke it in — mitigated by a short lifetime, not
solved. A consent screen is required regardless, and as the authorization
server we are the party obliged to show it.

MCP forces no GitHub App permission that no other feature needs. Its tools
read and write the same repository content the web application already does,
through the same installation access token that the write path already
mints server-side, so MCP is a new way to authenticate a caller rather than
a new operation against a repository. That had to be settled before the
permission set is finalized, since adding one later forces every
installation to re-approve. We also rejected accepting a GitHub token
directly from a client: the specification forbids passthrough, and doing it
anyway would make every client a holder of full GitHub credentials.

Two obligations fall on work after this one. `docs/conventions/security.md`
still says this project authenticates nobody; the change that first verifies
one of these tokens must replace that section, not this record. And every
finding above is documentary — no MCP client was connected to a running
server — so the empirical check stays open, tracked separately.
