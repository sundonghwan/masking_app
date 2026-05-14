# Task: MinIO object storage, metadata DB, and Docker stack

## Goal
- Move toward durable server-owned storage so annotation data is not lost when
  browser local state or ad hoc filesystem state changes.
- Add a Docker operating shape with app, PostgreSQL metadata DB, and MinIO
  object storage.
- Back up the currently recovered `data/` directory before changing storage.

## Scope
- Backup current local data root.
- Architecture/design for metadata DB and object storage migration.
- Docker Compose service plan.
- Implementation slices for repository/storage ports, migration, and runtime
  verification.

## Non-goals
- Hide the existing filesystem path before migration is verified.
- Bypass current mask validation/export contracts.
- Put raw image or mask bytes into the metadata DB.

## Touched areas
- `data/` backup artifacts under `backups/`
- `docker-compose.yml`
- `Dockerfile`
- `src/server/storage.js`
- future DB/object-storage adapters under `src/server/`
- harness scripts and docs

## Risks
- Data loss during migration from current filesystem manifests.
- Metadata/object divergence if DB writes and MinIO writes are not ordered and
  verified.
- Adding runtime dependencies without isolated tests.
- Running multiple app processes against mixed storage backends.

## Impact Chains
### suspected
- upload image route (src/server/api.js:462-586) -> storage.writeImageBuffer (src/server/storage.js:440-460) -> manifest image append (src/server/api.js:555-586)
- mask save route (src/server/api.js:788-880) -> storage.writeMaskBuffer (src/server/storage.js:420-438) -> manifest current mask update (src/server/api.js:850-880)
- project export route (src/server/api.js:1600-1680) -> storage.readProjectFile (src/server/storage.js:390-420) -> createZipBlob (src/export/zip.js:1-120)
- Docker startup (Dockerfile:1-24) -> deployment profile (src/server/deploymentProfile.js:6-31) -> storage root/runtime services

### validated
- Current data root backup:
  - `scripts/harness/backup-data-root.sh data`
  - `scripts/harness/restore-verify.sh backups/masking-app-data-20260513T234409Z.tgz`
- Docker dependency stack:
  - `docker compose up -d postgres minio minio-init`
  - `docker compose ps -a`
- Metadata DB migration:
  - `scripts/harness/db-migrate.sh --json`
- File storage to DB/MinIO migration:
  - `scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --json`
  - `scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --apply --json`
- Object reference verification:
  - `scripts/harness/object-db-verify.sh --json --ensure-bucket`
- Regression validation:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
  - `docker compose build masking-app`

### discarded
- Store image/mask bytes directly in PostgreSQL.
  - reason: too large for annotation binary artifacts; MinIO should own binary
    objects while DB owns metadata and object keys.

## Validation Plan
- Backup/restore verification before any migration.
- New adapter contract tests for metadata repository and object storage.
- Migration dry-run from current `data/` to DB+MinIO.
- Migration apply to temp Docker volumes, then export equivalence check.
- Full `scripts/harness/test-target.sh`.
- Docker compose health check for app/Postgres/MinIO.
- Storage verification that checks DB metadata object keys exist in MinIO.

## Progress Notes
- Current backup created:
  - archive: `backups/masking-app-data-20260513T234409Z.tgz`
  - manifest: `backups/masking-app-data-20260513T234409Z.json`
- Restore verification passed for the archive.
- Existing Docker Compose only runs `masking-app` with a Docker volume at
  `/app/data`; it does not include MinIO or a metadata DB.
- Docker Compose now includes `postgres`, `minio`, and `minio-init`.
- Actual local Docker dependency verification:
  - Postgres healthy.
  - MinIO healthy.
  - `minio-init` exited 0 and created `masking-app` bucket.
- DB migration result:
  - applied `0001_initial_metadata` on first run.
- File storage migration dry-run/apply result:
  - sources: 3
  - projects/tasks/versions: 3/3/3
  - images: 197
  - annotations: 11
  - uploaded objects: 208
  - skipped files: 0
- DB row verification after apply:
  - projects: 3
  - tasks: 3
  - versions: 3
  - images: 197
  - annotations: 11
- Object reference verification after apply:
  - checked: 208
  - missing: 0
- Full regression:
  - lint passed
  - typecheck passed
  - test target passed with 347 tests
  - smoke-web passed
  - git diff check passed
  - Docker image build for `masking-app:local` passed

## Closeout
- Completed for this infrastructure and migration slice.
- Remaining explicit cutover risk: the app still defaults to filesystem mode;
  runtime API reads/writes are not yet switched to `object-db` backend.
