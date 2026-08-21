---
status: accepted
---

# Limit the first release to public repositories

A blog backed by a private repository is a coherent product — the posts are
public once we serve them, and only the source needs to be hidden. We chose
not to support it in the first release.

Two things drove the choice, and only one is about effort.

The one that is not about effort is that reader comments cannot work at all on
a private repository. A user access token reaches only what both the person
and the app can already reach, so a reader with no access to the repository
cannot post to its discussions no matter how the flow is arranged. There is no
implementation that fixes this; it is how the token's scope is defined. A
private blog could have posts and no comments, but it could not have comments.

The one that is about effort is that a private repository cannot be read
without a token, so nothing about it can be delivered without an authenticated
proxy in front of every asset, including every image. That is a second
delivery path with its own cache, its own authorization, and its own latency.

Supporting private repositories from the start was rejected on the combination:
it doubles the delivery surface to buy a feature that is definitionally
incomplete.

The consequence is that the application must detect a private repository at
link time and say plainly that it is not supported, rather than failing later
with an authorization error that reads like a bug. This decision is expected to
be revisited once delivery is stable; a later record will supersede it if it is.
