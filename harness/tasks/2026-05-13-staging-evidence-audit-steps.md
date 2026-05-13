# Task: staging-evidence-audit-steps

## Goal
- Include audit verification and audit retention dry-run in the staging evidence bundle.

## Scope
- `scripts/harness/staging-evidence.mjs`
- `tests/stagingEvidence.test.js`
- production/security documentation and run log.

## Non-goals
- Applying retention deletes.
- Changing audit verification or retention semantics.
- Requiring a live deployment URL.

## Touched areas
- `scripts/harness/staging-evidence.mjs`
- `tests/stagingEvidence.test.js`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `docs/SECURITY_HARDENING_PLAN.md`

## Risks
- Accidentally making destructive audit retention part of staging evidence.
- Hiding audit verification failures under optional checks.
- Making fresh empty data roots fail only because no audit directory exists.

## Impact Chains
### suspected
- None remaining.

### validated
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:38-84) -> audit-verify CLI (scripts/harness/staging-evidence.mjs:58-58)
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:38-84) -> audit-retention CLI dry-run (scripts/harness/staging-evidence.mjs:59-59)

### discarded
- retention apply mode.
  - reason: staging evidence must prove retention candidates without deleting audit files.

## Validation Plan
- RED/GREEN: `node --test tests/stagingEvidence.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Follow-up selected from production readiness audit: audit verification and retention exist individually, but staged evidence for running retention remained pending.
- RED confirmed staging evidence did not list or run audit verification and audit retention.
- GREEN added both as required steps. Audit retention is invoked without `--apply`, so it remains dry-run evidence only.

## Closeout
- `node --test tests/stagingEvidence.test.js` passed with 3 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 307 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issue. Checked that audit verification and retention failures are required, deployment check remains optional, and retention is not invoked with `--apply`.
