# Task: staging-evidence-bundle

## Goal
- Add a single harness command that collects representative staging evidence for
  storage, capacity, backup, restore rehearsal, production gate, and optional
  deployment health.

## Scope
- Add `scripts/harness/staging-evidence.mjs` and `.sh` wrapper.
- Add tests for command orchestration, restore dependency on backup archive, and
  skipped restore when backup fails.
- Document the command in harness and production readiness docs.

## Non-goals
- Start the application server.
- Install production log shipping, TLS, scheduler, or identity provider.
- Replace the individual verification scripts.

## Touched areas
- `scripts/harness/staging-evidence.mjs`
- `scripts/harness/staging-evidence.sh`
- `tests/stagingEvidence.test.js`
- `scripts/harness/check-syntax.mjs`
- `harness/commands.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Treating an evidence bundle as proof of production readiness by itself.
- Hiding failed sub-checks behind a successful wrapper.
- Running restore rehearsal without using the archive created by the same run.

## Impact Chains

### suspected
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:*) -> storage-verify/capacity-profile/backup-data-root/restore-verify/production-gate JSON commands -> production readiness evidence docs

### validated
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:33-80) -> storage-verify/capacity-profile/backup-data-root/restore-verify/production-gate JSON commands -> production readiness evidence docs
  - validation: `node --test tests/stagingEvidence.test.js`, manual CLI fixture run

### discarded
- Browser E2E startup
  - reason: this harness aggregates data-root and running-server evidence, but
    it does not start a browser journey.

## Validation Plan
- RED/GREEN: `node --test tests/stagingEvidence.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added `scripts/harness/staging-evidence.mjs` and `.sh` wrapper.
- The bundle runs storage verification, capacity profile, backup creation,
  restore verification against the archive created by the same run, production
  gate, and optional deployment health when `--base-url` is supplied.
- It does not start the app server and does not replace the individual checks.
- Validation passed:
  - RED/GREEN: `node --test tests/stagingEvidence.test.js`
  - manual CLI fixture run with production-mode env and hashed local identity
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: a passing evidence
  bundle is staging evidence, not a full production readiness claim; TLS,
  identity-provider, scheduler, and storage/concurrency decisions remain
  separate.
