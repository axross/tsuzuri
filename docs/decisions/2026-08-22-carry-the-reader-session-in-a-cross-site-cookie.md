---
status: accepted
---

# Carry the reader session in a cross-site cookie

A reader comments from the author's own site, not from ours. This application
renders no reader-facing page, so the comment box lives on an origin we do not
control, and every request carrying a reader's session crosses a site boundary.
That is what makes the session a decision here rather than a default.

We kept the session as this application's own cookie and changed one attribute:
`SameSite` becomes `None`, which obliges `Secure` alongside it. Two mechanisms
replace what `SameSite=Lax` had been doing — an allowlist of each blog's
registered origin enforced through CORS, and an anti-forgery token the API
requires on every write.

`SameSite=Lax` could not stay, because a Lax cookie is sent cross-site only for
a request that is both a top-level navigation and a safe method. A `fetch()`
from the author's page to our API is neither: it is a subresource request, and
posting a comment is a `POST`. Under Lax the reader's session simply would not
accompany the write, and the API would see every commenting reader as anonymous.

## The flow, end to end

Origin **A** is the author's site. Origin **B** is this application.

1. The reader activates "sign in to comment" on a page served by **A**.
2. **A** performs a top-level navigation to **B**, carrying the blog's
   identifier and the URL to return to. **B** rejects a return URL that is not
   on that blog's registered origin, mints a random `state`, and stores it
   against the pending authorization.
3. **B** redirects to `https://github.com/login/oauth/authorize`, with
   `client_id`, `redirect_uri`, `state`, and a PKCE `code_challenge` and
   `code_challenge_method`. GitHub requires `redirect_uri` to "be a match to
   one of the URLs you provided as a 'Callback URL' in your app's settings",
   so this leg cannot be redirected to an attacker's origin.
4. The reader authorizes on **github.com**, under their own account. They are
   not required to be a collaborator on the repository.
5. GitHub redirects to **B**'s registered callback with `code` and `state`.
6. **B** compares the returned `state` against the one it stored. GitHub is
   explicit about what a mismatch means: "If the `state` parameter does not
   match the `state` parameter that you sent in the previous step, the request
   cannot be trusted, and the web application flow should be aborted."
7. **B** exchanges the code at `https://github.com/login/oauth/access_token`,
   posting `client_id`, `client_secret`, `code`, `redirect_uri`, and the PKCE
   `code_verifier`, and receives a user access token and a refresh token.
8. **B** creates the session record holding those tokens, sets its session
   cookie `HttpOnly; Secure; SameSite=None`, and redirects the reader back to
   the return URL it validated in step 2.
9. Afterwards **A**'s page calls **B**'s API with credentials included. **B**
   answers only for an allowlisted origin, and requires the anti-forgery token
   on every write.

Only steps 2, 3, 5, and 8 are redirects, and each one either targets a URL
GitHub itself validated against the app's registered callback, or a URL **B**
validated against the blog's registered origin. No redirect target is taken
from the request unchecked.

## What protects the flow against cross-site request forgery

The authorization leg is protected by `state`, as step 6 describes, and by
PKCE, which stops an intercepted `code` being exchanged by anyone who does not
hold the verifier.

The API is the part that lost its protection when `SameSite` became `None`, and
it is defended twice over. Requiring a JSON content type on every write forces a
CORS preflight, which a hostile origin fails at the allowlist. That alone is not
relied upon: a request simple enough to skip the preflight is still *sent*, and
only its response is withheld from the attacker, so a write with a side effect
would already have happened. The anti-forgery token is therefore load-bearing
rather than defence in depth — the API rejects a write that does not carry it,
whatever the origin check concluded.

## What the session's lifetime is

The session record holds the tokens and the cookie carries an opaque identifier,
so the cookie's lifetime is bounded by the token behind it. A GitHub App user
access token "expires after 8 hours" by default, and the refresh token's
lifetime "will always be `15897600` (6 months)". The session cookie therefore
lives at most eight hours before the refresh token extends it, and the session
as a whole cannot outlive six months without the reader authorizing again.

## What was traded away

Third-party cookies. Safari blocks them by default, Firefox partitions them,
and Chrome has spent years phasing them out; a `SameSite=None` cookie set by
**B** and read during a visit to **A** is exactly the pattern all three target.
Some readers will find that signing in does not stick, and the proportion is
outside our control and will change without notice.

We accepted that because the alternative that avoids it costs the feature its
shape. The commenting reader is a minority of readers, reading needs no session
at all, and a failure here is visible and recoverable rather than silent: the
API must answer a write from a reader whose session did not survive with an
error the consumer site can distinguish from a rejected comment, so the author's
page can tell the reader to sign in again rather than reporting that their
comment was refused.

Two alternatives were rejected.

Posting from our own origin — a top-level navigation to **B** for the write
itself, which keeps `SameSite=Lax` and needs no third-party cookie at all —
was rejected because it takes the reader off the author's page for every
comment, and a consumer site cannot style or contain that. It remains the
fallback if third-party cookie loss turns out to be larger than the commenting
feature can absorb, and a later record would supersede this one.

Handing a short-lived bearer token to the consumer site was rejected because a
credential we issued would then live in JavaScript on a site we do not control.
Any cross-site scripting flaw on the author's site would become the ability to
post as any reader who had signed in, and we would have no way to see it happen
or to shorten the window.
