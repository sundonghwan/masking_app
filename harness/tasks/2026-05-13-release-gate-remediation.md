# Task: release-gate-remediation

## Goal
- Make release-candidate gate failures actionable by attaching remediation
  guidance to each blocking error.

## Scope
- Add remediation text for missing/failed artifacts and unresolved boundary
  decisions.
- Cover remediation in release gate tests.
- Keep the gate strict; do not change current failure status while decisions
  remain `Undecided`.

## Non-goals
- Choosing the boundary decisions.
- Making the release gate pass.
- Changing release artifacts.

## Touched areas
- `scripts/harness/release-candidate-gate.mjs`
- `tests/releaseCandidateGate.test.js`
- `harness/run_log.md`

## Risks
- Remediation could sound like approval instead of next action.
- CLI output could get noisy.

## Impact Chains
### suspected
- release candidate gate error -> remediation guidance -> operator release decision

### validated
- checkReleaseCandidate (scripts/harness/release-candidate-gate.mjs:26-72) -> remediationForBoundary (scripts/harness/release-candidate-gate.mjs:175-177)
  - validation: `node --test tests/releaseCandidateGate.test.js`
- readArtifact (scripts/harness/release-candidate-gate.mjs:75-112) -> remediationForArtifact (scripts/harness/release-candidate-gate.mjs:164-173)
  - validation: `node --test tests/releaseCandidateGate.test.js`
- printResult (scripts/harness/release-candidate-gate.mjs:151-162) -> operator CLI output
  - validation: `scripts/harness/release-candidate-gate.sh --json` expected failure includes remediation fields

### discarded
- Boundary decision content.
  - reason: this task only explains how to resolve missing decisions; it does not
    make those decisions.

## Validation Plan
- RED/GREEN: `node --test tests/releaseCandidateGate.test.js`
- `scripts/harness/release-candidate-gate.sh` expected failure
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes
- Selected because the current gate correctly fails but does not tell the
  operator exactly where to act next.
- RED verified: remediation assertions failed before implementation.
- GREEN verified: release candidate gate test suite passes and current
  repository gate still fails only on unresolved decisions.

## Closeout
- Added remediation text for artifact errors, missing decision documents, and
  missing/undecided production boundaries.
- Updated release gate command docs to state remediation hints are part of the
  operator output.
- Validation:
  - `node --test tests/releaseCandidateGate.test.js` passed
  - `scripts/harness/release-candidate-gate.sh --json` expected-failed with
    remediation fields for all five unresolved boundary decisions
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 322 tests
  - `scripts/harness/smoke-web.sh` passed
  - `git diff --check` passed
- Code review: no blocking findings; gate remains strict and does not imply
  production approval.
