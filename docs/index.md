# Documentation

This project's own documentation, alongside its README. Which body answers
which question: **what must a change satisfy?** → `conventions/`. **How is
something run or operated?** → `operations/`. `decisions/` sits beside both and
holds why a constraint exists, for the constraints whose reasoning cannot be
recovered from the code. The vocabulary all of them use is in
[glossary.md](./glossary.md).

There is no `specs/` yet. A specification describes how the product behaves
now, in the present tense, and this repository currently holds its toolchain
and its constraints rather than any product behaviour. The first change that
implements a feature is the one that writes the first spec.

Documents under `conventions/` and `operations/` use MUST, MUST NOT, SHOULD,
SHOULD NOT, and MAY as [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html)
describes.

## Conventions

- [conventions/directory-structure.md](./conventions/directory-structure.md) —
  where a file goes, what it is named, and which part of the tree may import
  which.
- [conventions/github-platform-limits.md](./conventions/github-platform-limits.md)
  — the GitHub limits and policies every change touching the API must satisfy:
  what to read and how, what may be written and through which path, and what
  must never be linked.
- [conventions/testing.md](./conventions/testing.md) — which of the two suites
  a test belongs in, where it lives, and what the scenario catalog counts.
- [conventions/security.md](./conventions/security.md) — who may hold which
  token, who owns the session, and why this project sets no lockout threshold.
- [conventions/documentation.md](./conventions/documentation.md) — how this
  project's own documentation is kept true: correcting what a change
  invalidated, making a new document reachable, and the checks a documentation
  change owes.

## Operations

- [operations/development-workflow.md](./operations/development-workflow.md) —
  how a change gets from a stated intent to a merged pull request, and what
  holds the loop in place from outside a session.
- [operations/preview-deployment.md](./operations/preview-deployment.md) — the
  per-pull-request preview environment: what a run does, and the one-time setup
  that arms it.
- [operations/agent-skills.md](./operations/agent-skills.md) — installing and
  refreshing the agent skills, and the register of deviations and gaps.
- [operations/agent-sessions.md](./operations/agent-sessions.md) — how a
  session starts, the hooks that run during one, the subagents it can spawn,
  and its telemetry tagging.

## Decisions

- [decisions/](./decisions) — why a constraint exists, and what was traded
  away. Each record is named for the decision it holds and dated the day it was
  made; a decision is replaced by a new record rather than by editing the old
  one.

For what this project is, how to start it, and the commands it has, see
[`README.md`](../README.md). [`AGENTS.md`](../AGENTS.md) is the working
agreement for agent sessions.
