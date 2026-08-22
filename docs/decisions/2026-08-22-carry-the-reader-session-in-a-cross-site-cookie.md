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

`SameSite=Lax` could not stay: the security conventions state why a cross-site
`POST` never carries a `Lax` cookie, which is exactly what posting a comment
always is. So this was not a choice between two workable attributes. `Lax`
would have left the API seeing every commenting reader as anonymous, which is
not a degraded version of the feature but the absence of it — and that is why
the alternatives weighed below are about avoiding the cross-site request
altogether rather than about softening it.

## The flow, end to end

Origin **A** is the author's site. Origin **B** is this application.

1. The reader activates "sign in to comment" on a page served by **A**.
2. **A** performs a top-level navigation to **B**, carrying the blog's
   identifier and the URL to return to. **B** rejects a return URL that is not
   on that blog's registered origin, then holds it **server-side** against the
   pending authorization alongside a freshly minted random `state`. Holding it
   server-side is forced rather than chosen: step 3 gives GitHub nowhere to
   carry it.
3. **B** redirects to `https://github.com/login/oauth/authorize`, with
   `client_id`, `redirect_uri`, `state`, and a PKCE `code_challenge` and
   `code_challenge_method`. Of `redirect_uri`, GitHub's own parameter
   description says: "This must be a match to one of the URLs you provided as
   a "Callback URL" in your app's settings and can't contain any additional
   parameters." (read from GitHub's documentation on 2026-08-22). Both halves
   matter here. The first is why this leg cannot be
   redirected to an attacker's origin. The second is why the reader's return
   URL cannot ride along on `redirect_uri` and has to be the server-side
   record step 2 keeps.
4. The reader authorizes on **github.com**, under their own account. They are
   not required to be a collaborator on the repository.
5. GitHub redirects to **B**'s registered callback with `code` and `state`.
6. **B** compares the returned `state` against the one it stored. GitHub is
   explicit about what a mismatch means: "If the `state` parameter does not
   match the `state` parameter that you sent in the previous step, the request
   cannot be trusted, and the web application flow should be aborted." (read
   from GitHub's documentation on 2026-08-22).
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

The API is what lost its protection when `SameSite` became `None`, and the
decision there was to require **both** an origin allowlist and an anti-forgery
token rather than either alone. The security conventions state the mechanism and
why the allowlist cannot carry the load by itself; what belongs here is why we
did not stop at one.

An allowlist alone was rejected. The security conventions set out why it does
not hold on its own; the decision was to treat that gap as disqualifying rather
than as a residual risk worth carrying, since the case it fails in is the one an
attacker would pick.

A token alone was rejected for a different reason, and this is the one no
convention implies. The token holds — nothing forced a second mechanism — but
keeping the allowlist buys two things a token cannot. It rejects most hostile
traffic before any handler runs, which is cheap, and it means a single mistake
in one mechanism's implementation is not the only thing standing between a
reader's session and a stranger. We were not willing to make correctness in one
place load-bearing for the whole surface.

## What the session's lifetime is

The security conventions already bound a session cookie by the token behind it.
What that comes to here is GitHub's own numbers: a GitHub App user access token
"expires after 8 hours" by default, and its refresh token's lifetime "will
always be `15897600` (6 months)" (both read from GitHub's documentation on
2026-08-22). So a reader's cookie lives at most eight hours before the refresh
token extends it, and the session as a whole cannot outlive six months without
the reader authorizing again.

Those two figures are what made the cross-site cookie tolerable at all. Eight
hours is short enough that a session which fails to stick — the third-party
cookie case below — costs a reader one more sign-in rather than locking them
out, and six months is short enough that a stale grant expires on its own.

## What was traded away

Third-party cookies. Safari blocks them by default, Firefox partitions them,
and Chrome has spent years phasing them out; a `SameSite=None` cookie set by
**B** and read during a visit to **A** is exactly the pattern all three target.
Some readers will find that signing in does not stick, and the proportion is
outside our control and will change without notice.

We accepted that because the alternative that avoids it costs the feature its
shape. The commenting reader is a minority of readers, reading needs no session
at all, and a failure here is visible and recoverable rather than silent — the
security conventions already require the distinguishable-error handling that
makes it so. A loss we can hand back to the reader as "sign in again" is a
different kind of loss from one that corrupts or drops their comment, and only
the second would have been disqualifying.

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
