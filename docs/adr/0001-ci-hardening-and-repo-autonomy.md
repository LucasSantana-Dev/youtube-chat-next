# ADR-0001: CI hardening and repository autonomy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Deciders:** Lucas Santana (maintainer)
- **Decision method:** `/research-and-decide` — research → adversarial critic (`decision-critic`, Opus) → plan → this record.

## Context

`youtube-chat-next` is a solo-maintained public fork (~1190 LoC, pure TypeScript, MIT) of a
library that was unmaintained upstream for 3.5 years and still works. The fork's north star
(`.claude/plans/fork-hardening.md`) is *trustable-for-the-future*: fail loudly on drift, don't
harm consumers.

Two gaps blocked that goal on the CI/process side:

1. **`develop` had no branch protection at all** (verified: GitHub API returned
   `404 "Branch not protected"`). `ci.yml` ran Lint + a Node 18/20/22 test matrix, but nothing
   *gated* a merge on them — the checks were advisory. "More required checks" is unachievable
   without protection as the load-bearing piece.
2. **No autonomy loop.** Dependency currency and PR landing were fully manual, so the repo could
   not keep itself fresh or let an agent open a PR and have it merge on green.

A constraint throughout: **do not duplicate `fork-hardening.md` Phase 4**, which already owns
coverage thresholds, the Node/axios/TS/jest/eslint/prettier bumps, and replacing `typed-emitter`.

## Decision

### Required checks (gates)

- **Branch protection on `develop`:** require a PR before merge; require these status checks green:
  `Lint`, `Test (Node 18)`, `Test (Node 20)`, `Test (Node 22)`, `Audit`; require the branch up to
  date before merge; **`enforce_admins = true`** with **`required_approving_review_count = 0`**.
  - `enforce_admins = true` makes the checks enforceable on *every* merge path including the
    owner's — the maintainer chose this over a personal bypass, matching the fork's trust goal.
  - `required_approving_review_count = 0` avoids a solo-repo deadlock: GitHub forbids approving
    your own PR, so requiring ≥1 review would make the maintainer unable to merge anything.
- **`Audit` job** (`npm audit --audit-level=high --omit=dev`) added to `ci.yml` — a baseline
  supply-chain gate over the committed lockfile.
- **Per-PR dependency-delta scanning is left to the repo's existing Socket Security** (`Socket
  Security: Pull Request Alerts`), which was already wired and passing. An
  `actions/dependency-review-action` gate was written first but **removed after CI proved it
  redundant** — Socket already covers the PR delta, and `dependency-review` additionally errored
  (`Dependency review is not supported on this repository` — the Dependency graph feature is off).
  Reusing Socket over enabling a repo feature to run a second, overlapping tool.

### Autonomy

- **`dependabot.yml`** for `npm` + `github-actions`, weekly.
- **Scoped Dependabot auto-merge** (`.github/workflows/dependabot-automerge.yml`): auto-merge only
  `semver-patch` (any dep) and `semver-minor` on `direct:development` deps, gated purely on
  Dependabot's *enumerated* metadata outputs. Runtime minors, all majors, and GitHub Actions
  minor/major bumps are left for a human.
- **Repo "Allow auto-merge" enabled**, so any PR (agent- or human-opened) with `gh pr merge --auto`
  lands the moment required checks pass.
- **`concurrency: cancel-in-progress`** on `ci.yml` — cancel superseded runs on the same ref.

## Alternatives considered

- **Add checks without branch protection** — rejected. The checks already run; without protection
  "required" is unenforceable.
- **`enforce_admins = false` (owner bypass)** — rejected by the maintainer and flagged BLOCKER by
  the critic: it makes the checks advisory on the primary development actor, contradicting the
  "enforceable" goal.
- **Auto-merge everything on green (incl. runtime minors / majors)** — rejected. The unit suite is
  100% frozen 2022 fixtures + `jest.mock("axios")`; it cannot catch a breaking *runtime* dependency
  change, so green ≠ safe for runtime semver-minor+. Scope auto-merge to patches + dev-dep minors.
- **CodeQL / SAST as a required check** — deferred. Low signal on pure request/parse code with no
  auth/DB/injection surface.
- **Release automation (release-please / semantic-release)** — deferred. `publish.yml` is already
  tag-triggered and works; a release-PR bot adds config + a new failure surface for a rarely
  released library.
- **Coverage gate here** — deferred; owned by `fork-hardening.md` Phase 4 to avoid duplication.

## Consequences

**Positive**
- Every merge to `develop` — including the maintainer's — is gated on lint, the full test matrix,
  and two supply-chain checks. "Required" is now real.
- The repo keeps its own dependencies fresh and can land safe updates and agent PRs without a human
  in the loop.
- `Audit` + `Dependency Review` cover both the lockfile baseline and per-PR dependency deltas.

**Negative / cost**
- The maintainer loses direct `git push` to `develop`; all changes flow through a PR (even a
  one-commit PR that auto-merges on green).
- Auto-merge is gated on a frozen-fixture suite. A runtime regression inside an *allowed* update
  (a patch) could pass CI; the compensating control is `live-canary.yml`, which detects real
  drift within 24h. Runtime minors/majors are excluded from auto-merge precisely because of this.
- `npm audit` can block on an unfixable transitive advisory. Mitigation deferred: move to
  `audit-ci` with an allowlist only if that actually occurs.

**Neutral**
- Adds one workflow file (`dependabot-automerge.yml`) and one Dependabot config; `ci.yml` grows
  one job (`Audit`).

## Revisit when

- A runtime dependency regression reaches consumers through an auto-merged patch → tighten
  auto-merge to dev-dependencies only, or add a pre-merge live smoke test.
- `npm audit` starts blocking unrelated PRs on unfixable transitive advisories → adopt `audit-ci`
  with an allowlist.
- The library grows a network-writing or credential-handling surface (e.g. issue #68,
  send-messages) → add CodeQL / SAST as a required check.
- Release cadence becomes frequent enough that manual `git tag` is the bottleneck, or changelog
  drift recurs → adopt release-please / semantic-release.
- `fork-hardening.md` Phase 4 lands the coverage threshold → add the coverage check to the required
  set.
