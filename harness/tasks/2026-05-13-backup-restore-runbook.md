# Task: backup-restore-runbook

## Goal
- Add an operator-ready backup/restore runbook for the current filesystem data
  root and a read-only storage verification command.

## Scope
- Document what must be backed up under `MASKING_APP_DATA_DIR`.
- Document backup, restore, rollback, and post-restore verification steps.
- Add a harness storage verification script that checks manifests and referenced
  files without mutating data.

## Non-goals
- Add database migrations.
- Add object storage support.
- Add automated scheduled backups or retention enforcement.

## Touched areas
- `docs/RUNBOOK_BACKUP_RESTORE.md`
- `scripts/harness/storage-verify.*`
- `harness/commands.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Storage verification must be read-only.
- Backups must include `identity/`, `training_sets/`, legacy flat project
  folders, and hierarchical `projects/` task/version folders.
- Restore docs must avoid telling operators to overwrite live data without a
  safety copy.

## Impact Chains

### suspected
- createFileStorage (src/server/storage.js:21-80) -> writeImageBuffer (src/server/storage.js:550-568) -> writeMaskBuffer (src/server/storage.js:580-598) -> listProjectFiles (src/server/storage.js:662-668)
- createUserDirectory (src/server/userDirectory.js:12-46) -> createSessionStore (src/server/sessionStore.js:10-84)
- writeTrainingSetManifest (src/server/storage.js:688-700) -> listTrainingSets (src/server/storage.js:706-723)

### validated
- createFileStorage (src/server/storage.js:21-80) -> writeImageBuffer (src/server/storage.js:550-568) -> writeMaskBuffer (src/server/storage.js:580-598) -> listProjectFiles (src/server/storage.js:662-668)
  - validation: `scripts/harness/storage-verify.sh data` checked current filesystem project manifests and referenced image/mask files read-only.
- createUserDirectory (src/server/userDirectory.js:12-46) -> createSessionStore (src/server/sessionStore.js:10-84)
  - validation: `scripts/harness/storage-verify.sh data` parsed identity JSON files under `identity/`.
- writeTrainingSetManifest (src/server/storage.js:688-700) -> listTrainingSets (src/server/storage.js:706-723)
  - validation: verifier scans `training_sets/` manifests when present; current data root has no saved training sets.

### discarded
- scheduled backup automation
  - reason: runbook defines manual operations first; scheduler/retention belongs in a separate deployment operations batch.

## Validation Plan
- `scripts/harness/storage-verify.sh <temp-data-root>`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Current `data/` verification passed with flat projects, hierarchy project,
  identity files, and image references.

## Findings
- Current local `data/` contains 3 flat projects, 1 hierarchy project, 1 task
  version, 19 JSON files, 13 identity JSON files, and 193 image references.
- Current local `data/` has no mask references in manifests at verification
  time, so mask header validation path is covered by code and future data but
  not exercised by this local data snapshot.

## Closeout
- validation passed:
  - `scripts/harness/storage-verify.sh data`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- code review found no blocking issue after checking read-only behavior,
  safe relative path resolution, manifest reference checks, and runbook restore
  safety steps.
