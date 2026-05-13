# Task: capacity-profile-artifact

## Goal
- Archive representative data-root capacity profile evidence as a release
  artifact.

## Scope
- Add an `--output` option to `capacity-profile` so evidence can be saved
  without shell redirection.
- Capture a capacity profile JSON artifact for the current local data root.
- Update progress board evidence if the artifact is created successfully.

## Non-goals
- Load testing or concurrency benchmarking.
- Claiming the current local data root is the final production target.
- Changing capacity warning thresholds.

## Touched areas
- `scripts/harness/capacity-profile.mjs`
- `tests/capacityProfile.test.js`
- `release-artifacts/`
- `docs/REMAINING_WORK_BOARD.md`
- `harness/run_log.md`

## Risks
- Treating a static file-size profile as a performance/load test.
- Archiving local evidence as if it were final production evidence.

## Impact Chains
### suspected
- capacity-profile CLI -> writeEvidenceOutput -> release artifact -> remaining work board

### validated
- profileCapacity (scripts/harness/capacity-profile.mjs:25-71) -> writeCapacityProfileOutput (scripts/harness/capacity-profile.mjs:73-76) -> release artifact
  - validation: `node --test tests/capacityProfile.test.js`
- capacity-profile CLI (scripts/harness/capacity-profile.mjs:13-23) -> release-artifacts/capacity-profile-20260513-local.json
  - validation: `scripts/harness/capacity-profile.sh --json --output release-artifacts/capacity-profile-20260513-local.json data`

### discarded
- Runtime request capacity.
  - reason: this task profiles stored files only and does not exercise HTTP
    throughput or concurrent editing.

## Validation Plan
- RED/GREEN: `node --test tests/capacityProfile.test.js`
- `scripts/harness/capacity-profile.sh --json --output release-artifacts/capacity-profile-20260513-local.json data`
- `scripts/harness/test-target.sh`
- `git diff --check`

## Progress Notes
- Selected because capacity evidence is an explicit remaining production
  hardening item that does not require product-owner boundary decisions.
- RED verified: `writeCapacityProfileOutput` import failed before
  implementation.
- Local `data/` profile passed with 202 images, 9 manifests, 0 masks, and no
  threshold warnings.

## Closeout
- Added `--output` support to `capacity-profile` so JSON evidence can be
  archived without shell redirection.
- Archived `release-artifacts/capacity-profile-20260513-local.json`.
- Updated the remaining work board to show local capacity evidence exists while
  still requiring a repeat run on the final target data root.
- Validation:
  - `node --test tests/capacityProfile.test.js` passed, 3 tests
  - `scripts/harness/capacity-profile.sh --json --output release-artifacts/capacity-profile-20260513-local.json data` passed
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 323 tests
  - `scripts/harness/smoke-web.sh` passed
  - `git diff --check` passed
- Code review: no blocking findings; evidence is correctly labeled local and
  not final production-host evidence.
