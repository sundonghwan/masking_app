# Task: capacity-profile-gate

## Goal
- Add a read-only capacity profile gate so large dataset risk is visible before
  manifests or filesystem storage become a production bottleneck.

## Scope
- Data-root capacity profile script.
- Strict threshold mode.
- Unit tests for counts and strict warning promotion.
- Harness command and smoke updates.
- Production readiness audit update.

## Non-goals
- Real load testing with concurrent browsers.
- Performance dashboard.
- Database migration.

## Touched areas
- `scripts/harness/capacity-profile.*`
- `tests/capacityProfile.test.js`
- `package.json`
- `scripts/harness/smoke-web.sh`
- `harness/commands.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Treating a static capacity profile as a full load benchmark.
- Failing normal local development on warning-only thresholds.
- Scanning data roots too broadly.

## Impact Chains

### suspected
- capacity-profile CLI (scripts/harness/capacity-profile.mjs:1-180) -> data root manifests/images/masks

### validated
- capacity-profile CLI (scripts/harness/capacity-profile.mjs:1-180) -> data root manifests/images/masks
  - validation: `tests/capacityProfile.test.js` verifies counts, byte totals,
    largest manifest reporting, and strict warning failure.

### discarded
- concurrent browser load benchmark
  - reason: this batch adds the first cheap capacity sensor; real load testing
    should be added after a target dataset size is chosen.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/capacity-profile.sh data`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/capacity-profile.sh data`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- local `data/` profile at closeout:
  - manifests=6
  - images=202
  - masks=0
  - total_bytes=54773027
  - largest_manifest=`rail-mask-20260513/manifest.json`, size=84412
- code review found no blocking issue after checking that the script is
  read-only, strict mode only fails when thresholds produce warnings, and the
  audit wording does not claim this is a full load test.
