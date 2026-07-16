# ADR-0001: CI hardening and repository autonomy

- **Status:** Accepted
- **Date:** 2026-07-16
- **Deciders:** Lucas Santana (maintainer)
- **Decision method:** `/research-and-decide` - research → adversarial critic (`decision-critic`, Opus) → plan → this record.

## Context

`youtube-chat-next` is a solo-maintained public fork (~1190 LoC, pure TypeScript, MIT) of a
library that was unmaintained upstream for 3.5 years and still works. The fork's north star
(`.claude/plans/fork-hardening.md`) is *trustable-for-the-future*: fail loudly on drift, don't
harm consumers.

Two gaps blocked that goal on the CI/process side:

1. **`develop` was gated by an active *ruleset*, not classic branch protection.** The classic
   protection API returned `404 "Branch not protected"`, which is misleading: a repository
   **ruleset** ("main branch", targeting `~DEFAULT_BRANCH`, no bypass actors) already required
   CodeQL code scanning, code quality (errors), and Copilot code review. But **no CodeQL workflow
   existed**, so the `code_scanning` rule could never be satisfied and *every* merge to `develop`
   was blocked ("base branch policy prohibits the merge"). Meanwhile `ci.yml`'s Lint + Node
   18/20/22 matrix were **not** in the ruleset's required set, so they did not gate merges. Net: a
   deadlocked branch whose required checks were the wrong ones.
2. **No autonomy loop.** Dependency currency and PR landing were fully manual, so the repo could
   not keep itself fresh or let an agent open a PR and have it merge on green.

A constraint throughout: **do not duplicate `fork-hardening.md` Phase 4**, which already owns
coverage thresholds, the Node/axios/TS/jest/eslint/prettier bumps, and replacing `typed-emitter`.

## Decision

### Required checks (gates)

- **Extend the existing ruleset rather than add classic branch protection** (reuse what's there;
  the ruleset already enforces on everyone via an empty bypass-actor list, which *is* the
  `enforce_admins = true` the maintainer chose). To the "main branch" ruleset add:
  - a `pull_request` rule (require a PR before merge, `required_approving_review_count = 0` - a
    solo repo cannot require reviews because GitHub forbids approving your own PR), and
  - a `required_status_checks` rule for `Lint`, `Test (Node 18)`, `Test (Node 20)`,
    `Test (Node 22)`, `Audit` - the ruleset previously gated on scanning/quality/review but not on
    the test matrix.
- **`CodeQL` workflow** (`github/codeql-action`, `javascript-typescript`) added - the ruleset
  already *requires* CodeQL results; nothing produced them. This un-blocks `develop` and satisfies
  the `code_scanning` rule. (This reverses an earlier draft that deferred CodeQL as "low signal":
  the repo's own policy already mandates it, so it is not optional here.)
- **`Audit` job** (`npm audit --audit-level=high --omit=dev`) added to `ci.yml` - a baseline
  supply-chain gate over the committed lockfile.
- **Per-PR dependency-delta scanning is left to the repo's existing Socket Security** (`Socket
  Security: Pull Request Alerts`), which was already wired and passing. An
  `actions/dependency-review-action` gate was written first but **removed after CI proved it
  redundant** - Socket already covers the PR delta, and `dependency-review` additionally errored
  (`Dependency review is not supported on this repository` - the Dependency graph feature is off).
  Reusing Socket over enabling a repo feature to run a second, overlapping tool.

### Autonomy

- **`dependabot.yml`** for `npm` + `github-actions`, weekly.
- **Scoped Dependabot auto-merge** (`.github/workflows/dependabot-automerge.yml`): auto-merge only
  `semver-patch` (any dep) and `semver-minor` on `direct:development` deps, gated purely on
  Dependabot's *enumerated* metadata outputs. Runtime minors, all majors, and GitHub Actions
  minor/major bumps are left for a human.
- **Repo "Allow auto-merge" enabled**, so any PR (agent- or human-opened) with `gh pr merge --auto`
  lands the moment required checks pass.
- **`concurrency: cancel-in-progress`** on `ci.yml` - cancel superseded runs on the same ref.

## Alternatives considered

- **Add checks without branch protection** - rejected. The checks already run; without protection
  "required" is unenforceable.
- **`enforce_admins = false` (owner bypass)** - rejected by the maintainer and flagged BLOCKER by
  the critic: it makes the checks advisory on the primary development actor, contradicting the
  "enforceable" goal.
- **Auto-merge everything on green (incl. runtime minors / majors)** - rejected. The unit suite is
  100% frozen 2022 fixtures + `jest.mock("axios")`; it cannot catch a breaking *runtime* dependency
  change, so green ≠ safe for runtime semver-minor+. Scope auto-merge to patches + dev-dep minors.
- **CodeQL / SAST as a required check** - *initially* deferred as low signal on pure request/parse
  code, then **adopted** once CI revealed the existing ruleset already requires CodeQL and was
  deadlocking merges without it. Satisfying the policy beat fighting it.
- **Release automation (release-please / semantic-release)** - deferred. `publish.yml` is already
  tag-triggered and works; a release-PR bot adds config + a new failure surface for a rarely
  released library.
- **Coverage gate here** - deferred; owned by `fork-hardening.md` Phase 4 to avoid duplication.

## Consequences

**Positive**
- Every merge to `develop` - including the maintainer's - is gated on lint, the full test matrix,
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
- The `code_quality` / `copilot_code_review` ruleset rules prove unsatisfiable (e.g. Copilot review
  not available on the plan) → drop those rules from the ruleset rather than leave `develop`
  deadlocked on them.
- Release cadence becomes frequent enough that manual `git tag` is the bottleneck, or changelog
  drift recurs → adopt release-please / semantic-release.
- `fork-hardening.md` Phase 4 lands the coverage threshold → add the coverage check to the required
  set.
