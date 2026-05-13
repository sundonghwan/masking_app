# Task: data-root-backup-cli

## Goal
- Add an executable backup command for the filesystem data root with local
  retention support.

## Scope
- Data-root backup CLI and shell wrapper.
- Tests for archive creation, retention, and unsafe output rejection.
- Harness command docs, backup runbook, smoke check, and production audit.

## Non-goals
- Install a host scheduler such as cron, launchd, or systemd timer.
- Add remote backup replication.
- Add transactional database snapshots.

## Touched areas
- `scripts/harness/backup-data-root.mjs`
- `scripts/harness/backup-data-root.sh`
- `tests/backupDataRoot.test.js`
- `scripts/harness/smoke-web.sh`
- `package.json`
- `harness/commands.md`
- `docs/RUNBOOK_BACKUP_RESTORE.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Accidentally writing backups inside the active data root.
- Retention deleting non-backup files.
- Treating a successful archive as proof of transactional consistency.

## Impact Chains

### suspected
- backupDataRoot (scripts/harness/backup-data-root.mjs:20-74) -> createTarGzipArchive (scripts/harness/backup-data-root.mjs:77-82) -> operator restore flow (docs/RUNBOOK_BACKUP_RESTORE.md)
- backupDataRoot (scripts/harness/backup-data-root.mjs:20-74) -> applyRetention (scripts/harness/backup-data-root.mjs:84-101)

### validated
- backupDataRoot (scripts/harness/backup-data-root.mjs:20-74) -> createTarGzipArchive (scripts/harness/backup-data-root.mjs:77-82)
  - validation: `node --test tests/backupDataRoot.test.js`
- backupDataRoot (scripts/harness/backup-data-root.mjs:20-74) -> applyRetention (scripts/harness/backup-data-root.mjs:84-101)
  - validation: `node --test tests/backupDataRoot.test.js`

### discarded
- host scheduler installation
  - reason: scheduler mechanism depends on deployment host; this batch provides
    the command contract that cron/launchd/systemd can call.

## Validation Plan
- `node --test tests/backupDataRoot.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added executable backup command and shell wrapper.
- Added count-based retention limited to generated `masking-app-data-*.tgz`
  files and matching JSON sidecars.
- Backup output inside the active data root is rejected before writing.
- Validation passed:
  - `node --test tests/backupDataRoot.test.js`
  - `scripts/harness/backup-data-root.sh data /tmp/masking-app-backup-smoke`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` with 255 passing tests
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: archive creation is not
  transactional during active writes; runbook still recommends a quiet window
  and restore rehearsal.
