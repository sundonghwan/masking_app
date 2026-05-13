# Task: boundary-decision-apply-tool

## Goal
- Make approved controlled-internal MVP production boundary decisions easy to
  apply without hand-editing table cells.

## Scope
- Add a preview-by-default harness tool that can update
  `docs/PRODUCTION_BOUNDARY_DECISIONS.md` only when explicit `--apply` and owner
  metadata are supplied.
- Keep current decisions unchanged during this task.
- Update harness commands/docs and tests.

## Non-goals
- Approving production decisions.
- Making `release-candidate-gate` pass without owner approval.
- Supporting arbitrary boundary decision sets.

## Touched areas
- `scripts/harness/apply-boundary-decisions.mjs`
- `scripts/harness/apply-boundary-decisions.sh`
- `tests/boundaryDecisions.test.js`
- `docs/PRODUCTION_BOUNDARY_DECISIONS.md`
- `harness/commands.md`
- `harness/run_log.md`

## Risks
- A convenience tool could accidentally look like approval.
- A table rewrite could damage the decision document.

## Impact Chains
### suspected
- apply-boundary-decisions preview -> owner review -> apply -> PRODUCTION_BOUNDARY_DECISIONS.md -> release-candidate-gate

### validated
- apply-boundary-decisions preview -> owner review -> apply -> PRODUCTION_BOUNDARY_DECISIONS.md -> release-candidate-gate
  - validation: `node --test tests/boundaryDecisions.test.js`

### discarded
- Automatic production approval.
  - reason: the tool must require explicit `--apply` and owner metadata.

## Validation Plan
- RED/GREEN: `node --test tests/boundaryDecisions.test.js`
- `scripts/harness/apply-boundary-decisions.sh --preset controlled-internal-mvp --owner local-owner --date 2026-05-13`
- `scripts/harness/apply-boundary-decisions.sh --preset controlled-internal-mvp --owner local-owner --date 2026-05-13 --apply --file /tmp/...`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes
- `docs/PRODUCTION_BOUNDARY_DECISIONS.md` still says 319 tests; current suite is
  325 tests.
- RED verified: `tests/boundaryDecisions.test.js` failed before
  `apply-boundary-decisions.mjs` existed.
- Preview against the real decision document left
  `docs/PRODUCTION_BOUNDARY_DECISIONS.md` unchanged.
- Apply was verified only against `/tmp/masking-app-boundary-decisions-apply-test.md`.

## Closeout
- Added `scripts/harness/apply-boundary-decisions.mjs` and `.sh`.
- Added tests for preview, apply with owner/date metadata, and refusal without
  owner metadata.
- Updated command docs and status docs.
- Current production decisions remain `Undecided`; release candidate gate still
  fails only on the five owner decision boundaries.
- Validation:
  - `node --test tests/boundaryDecisions.test.js tests/checkSyntax.test.js` passed, 5 tests
  - `scripts/harness/apply-boundary-decisions.sh --preset controlled-internal-mvp --owner local-owner --date 2026-05-13` preview passed and did not mutate the real decision file
  - `scripts/harness/apply-boundary-decisions.sh --preset controlled-internal-mvp --owner local-owner --date 2026-05-13 --apply --file /tmp/masking-app-boundary-decisions-apply-test.md` passed
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 328 tests
  - `scripts/harness/smoke-web.sh` passed
  - `scripts/harness/release-candidate-gate.sh --json` expected-failed only on boundary decisions
  - `git diff --check` passed
- Code review: no blocking findings; default behavior is preview-only and
  production decisions are not modified without explicit `--apply`.
