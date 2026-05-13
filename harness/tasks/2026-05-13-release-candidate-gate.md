# Task: release-candidate-gate

## Goal
- Add a harness gate that checks whether a production release candidate has the
  required evidence artifacts and explicit boundary decisions.

## Scope
- Add a reusable release-candidate gate module and shell wrapper.
- Add tests for missing artifacts, failed artifacts, and undecided boundary
  decisions.
- Wire the new gate into syntax/smoke/documentation references.

## Non-goals
- Deciding the boundary choices.
- Marking the project production-ready.
- Re-running live staging evidence.

## Touched areas
- `scripts/harness/release-candidate-gate.mjs`
- `scripts/harness/release-candidate-gate.sh`
- `tests/releaseCandidateGate.test.js`
- `scripts/harness/check-syntax.mjs`
- `scripts/harness/smoke-web.sh`
- docs/harness references

## Risks
- Gate could rely on proxy signals rather than checking actual JSON artifacts.
- Gate could parse documentation too loosely and miss `Undecided`.

## Impact Chains
### suspected
- release boundary decisions (docs/PRODUCTION_BOUNDARY_DECISIONS.md:1-1) -> release candidate gate -> production readiness closeout

### validated
- release boundary decisions (docs/PRODUCTION_BOUNDARY_DECISIONS.md:1-1) -> release candidate gate (scripts/harness/release-candidate-gate.mjs:1-129) -> production readiness closeout
  - validation: `node --test tests/releaseCandidateGate.test.js`, actual gate fails on current undecided boundaries

### discarded
- Runtime server behavior.
  - reason: this gate only verifies repository release evidence and decision docs.

## Validation Plan
- RED/GREEN: `node --test tests/releaseCandidateGate.test.js`
- Syntax/smoke: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`, `scripts/harness/smoke-web.sh`
- Full: `scripts/harness/test-target.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected to prevent accidental production-ready claims while explicit
  decisions remain unresolved.
- RED confirmed the release candidate gate module did not exist.
- GREEN added artifact `ok: true` checks and strict required boundary decision
  checks.
- Actual repository gate currently fails because identity, metadata storage,
  network boundary, backup/restore, and audit/log retention remain `Undecided`.

## Closeout
- Added `scripts/harness/release-candidate-gate.mjs` and `.sh` wrapper.
- Added tests for passing explicit decisions, missing artifacts, failed
  artifacts, and undecided boundaries.
- Wired the gate into syntax checks, smoke checks, harness commands, release
  checklist, remaining work board, and production readiness audit.
- Validation passed:
  - `node --test tests/releaseCandidateGate.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (322 tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Expected current-state failure:
  - `scripts/harness/release-candidate-gate.sh` exits non-zero because required
    boundary decisions are still `Undecided`.
- Code review found no blocking issue. Remaining risk: this gate checks repo
  evidence and documented decisions; final host-specific evidence still must be
  attached for a real production release.
