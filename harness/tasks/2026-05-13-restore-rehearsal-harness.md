# Task: restore-rehearsal-harness

## Goal
- Add an executable restore rehearsal command that extracts a backup archive and
  verifies the restored data root.

## Scope
- Restore verification CLI and shell wrapper.
- Tests for successful archive restore verification and missing archive failure.
- Harness command docs, backup runbook, smoke check, production audit, run log.

## Non-goals
- Replace manual production cutover steps.
- Restore into the live data root.
- Provide remote backup replication.

## Touched areas
- `scripts/harness/restore-verify.mjs`
- `scripts/harness/restore-verify.sh`
- `tests/restoreVerify.test.js`
- `package.json`
- `scripts/harness/smoke-web.sh`
- `harness/commands.md`
- `docs/RUNBOOK_BACKUP_RESTORE.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Accidentally restoring over live data.
- Treating a synthetic fixture restore as staging evidence.
- Failing to propagate storage verification errors.

## Impact Chains

### suspected
- verifyBackupRestore (scripts/harness/restore-verify.mjs:21-66) -> runStorageVerify (scripts/harness/restore-verify.mjs:76-95) -> storage-verify (scripts/harness/storage-verify.mjs)

### validated
- verifyBackupRestore (scripts/harness/restore-verify.mjs:21-66) -> runStorageVerify (scripts/harness/restore-verify.mjs:76-95)
  - validation: `node --test tests/restoreVerify.test.js`

### discarded
- live data-root cutover
  - reason: command verifies archive restorability in a temporary directory;
    production cutover remains an operator-controlled runbook step.

## Validation Plan
- `node --test tests/restoreVerify.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added a restore rehearsal command that extracts backup archives into a
  temporary directory and runs storage verification against the restored data
  root.
- Added tests for successful archive verification and missing archive failure.
- Updated harness command docs, backup/restore runbook, smoke references, and
  production audit evidence.
- Validation passed:
  - `node --test tests/restoreVerify.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (`263` tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that restore verification writes
  only to a temporary restore directory, propagates storage verification
  failures, and does not claim real staging restore evidence.
