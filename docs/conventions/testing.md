# Testing

Two suites run here, and the line between them is what a test is allowed to
touch. The general practice for each — what is worth testing, how to design an
assertion, how to avoid a flaky wait — is owned by the installed
`unit-testing` and `end-to-end-testing` capabilities. This document states only
where each suite lives here and what belongs in it.

## Unit Tests Cover Logic That Never Touches GitHub

A unit test runs under Vitest, sits beside the module it covers as
`<module>.test.ts`, and exercises one exported contract with no network, no
GitHub API, and no running server.

Most of what is worth unit-testing in this project is transformation: parsing
front matter, deriving a **content-addressed path**, building a tree payload,
classifying an API error, validating environment configuration. All of it is
pure, and all of it is where a silent mistake is most expensive.

A test MUST NOT reach GitHub, not even a public unauthenticated endpoint. The
API's shape is faked at the boundary; what the fake returns comes from real
recorded responses rather than from what the code hopes to receive.

## End-to-End Tests Cover Journeys, Under `e2e/`

An end-to-end test runs under Playwright from `e2e/`, and starts the
application itself rather than assuming a server is already running: it
builds the OpenNext output and drives it through `wrangler dev` — the Worker
that actually gets deployed, not a `next start` build — the way a person
would.

The suite runs chromium only. This is a deliberate narrowing: the project's
own risk is in what it does with GitHub, not in cross-browser rendering, and a
second browser costs every run without covering a failure this application is
likely to have.

## `e2e/scenarios.md` Is the Coverage Metric

`e2e/scenarios.md` catalogs the user journeys this application claims to
support, and each entry records whether the suite asserts it. Coverage here
means the fraction of catalogued journeys a test actually drives — not a line
or branch percentage, which measures the wrong thing for a journey suite.

A change that adds a user-visible journey MUST add its entry to that catalog
in the same change, whether or not it also adds the test. An unasserted entry
is a known gap; a missing entry is an invisible one.

## No Coverage Percentage Gates a Merge

Neither suite has a coverage threshold, and adding one is not planned. The
merge gate is that the suites pass, plus the review that reads what they
assert. A percentage would be satisfiable by tests that assert nothing, and
this project would rather spend the attention on the catalog above.
