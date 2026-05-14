# MinIO, Metadata DB, And Docker Storage Design

## Audience

Maintainers moving the Masking App from local filesystem MVP storage toward a
more durable small-team deployment.

## Objective

Prevent annotation data loss by making the server the durable source of truth:
metadata lives in PostgreSQL, binary artifacts live in MinIO, and Docker Compose
runs the app plus its storage dependencies with named volumes.

## Current Problem

The current app can recover local work through browser IndexedDB and can mirror
data into a filesystem `data/` directory. That was useful for MVP speed, but it
creates fragile operating behavior:

- browser state can diverge from server manifests
- filesystem manifests can miss files after manual movement or partial repair
- Docker volume state is easy to replace accidentally
- metadata writes are not transactional
- binary files and metadata are coupled by JSON paths rather than durable
  object keys

Before any storage migration, the current recovered data root was backed up and
restore-verified:

```text
archive: backups/masking-app-data-20260513T234409Z.tgz
manifest: backups/masking-app-data-20260513T234409Z.json
restore verification: passed
```

## Decision

Use this target storage split:

```text
PostgreSQL
  projects
  tasks
  versions
  images
  annotations
  review_events
  assignments
  training_sets
  export_records
  object_refs

MinIO
  originals/{project_id}/{task_id}/{version_id}/{image_id}/{file_name}
  masks/{project_id}/{task_id}/{version_id}/{image_id}/class-{class_id}.png
  indexed-masks/{project_id}/{task_id}/{version_id}/{image_id}.png
  exports/{project_id}/{task_id}/{version_id}/{export_id}.zip

App server
  owns API validation
  writes object bytes
  writes DB metadata
  verifies object references before export
```

PostgreSQL owns queryable state and workflow state. MinIO owns large immutable
or versioned binary artifacts. The app continues to expose the same browser API
shape while the backend implementation changes behind repository/storage ports.

## Why Not Put Files In The DB

Image crops, binary masks, indexed masks, and ZIP exports are large binary
objects. Storing them in PostgreSQL would make backups, restores, and query
loads more expensive. The DB should store object keys, checksums, sizes, MIME
types, dimensions, and status, not raw image bytes.

## Runtime Components

| Component | Responsibility | Durable volume |
| --- | --- | --- |
| `masking-app` | HTTP app, auth, validation, export, migration commands | none except optional temp/cache |
| `postgres` | metadata, workflow state, object references | `masking_postgres_data` |
| `minio` | original images, mask PNGs, exports | `masking_minio_data` |
| `minio-init` | create bucket and apply local policy | none |

Recommended local ports:

```text
app:      4173
postgres:5432
minio:   9000
console: 9001
```

## Configuration

Add these runtime settings:

```text
MASKING_APP_STORAGE_BACKEND=filesystem | object-db
MASKING_APP_DATABASE_URL=postgres://masking:masking@postgres:5432/masking_app
MASKING_APP_OBJECT_ENDPOINT=http://minio:9000
MASKING_APP_OBJECT_REGION=us-east-1
MASKING_APP_OBJECT_BUCKET=masking-app
MASKING_APP_OBJECT_ACCESS_KEY=masking
MASKING_APP_OBJECT_SECRET_KEY=masking-password
MASKING_APP_OBJECT_FORCE_PATH_STYLE=1
```

`filesystem` remains the default until migration is verified. `object-db` is an
explicit mode.

## Data Model

Minimum first schema:

```text
projects
  project_id pk
  name
  description
  label_schema jsonb
  upload_policy jsonb
  revision
  deleted_at
  created_at
  updated_at

tasks
  project_id fk
  task_id
  name
  description
  current_version
  archived
  created_at
  updated_at

versions
  project_id fk
  task_id fk
  version_id
  status
  revision
  deleted_at
  created_at
  updated_at

images
  project_id fk
  task_id
  version_id
  image_id
  original_file_name
  object_key
  width
  height
  status
  worker_id
  reviewer_id
  deleted_at
  created_at
  updated_at

annotations
  annotation_id pk
  project_id
  task_id
  version_id
  image_id
  class_id
  class_name
  mask_object_key
  mask_width
  mask_height
  mask_ratio
  source
  score
  created_at
  updated_at

review_events
  event_id pk
  image_id
  reviewer_id
  action
  reason_code
  reason
  created_at

training_sets
  training_set_id pk
  name
  source_refs jsonb
  split_policy jsonb
  deleted_at
  created_at
  updated_at

export_records
  export_id pk
  project_id
  task_id
  version_id
  object_key
  summary jsonb
  created_at
```

The schema should preserve archive-relative export paths even when object keys
are different internally.

## Write Ordering

For upload:

```text
validate request
  -> parse image metadata
  -> write original object to MinIO with deterministic key
  -> insert/update image metadata in DB with object key and dimensions
  -> return image record
```

For mask save:

```text
validate image metadata from DB
  -> normalize and validate mask PNG
  -> write mask object to MinIO
  -> upsert annotation metadata in DB
  -> update image status/current annotation pointer
  -> return image record
```

If DB write fails after object write, the object can remain as an orphan and be
found by a future object-reference verifier. If object write fails, DB metadata
must not be updated.

## Migration Plan

1. Keep the current filesystem adapter intact.
2. Add repository interfaces:
   - `ProjectRepository`
   - `ImageRepository`
   - `AnnotationRepository`
   - `TrainingSetRepository`
   - `ObjectStore`
3. Add a filesystem-backed adapter that preserves current behavior.
4. Add PostgreSQL migrations and repository adapter.
5. Add MinIO object store adapter.
6. Add a migration CLI:

```bash
scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --json
scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --apply --json
```

7. Migration dry-run reports:
   - projects/tasks/versions/images/annotations found
   - missing files
   - duplicate IDs
   - object keys to write
   - DB rows to insert
8. Migration apply writes to empty DB/MinIO first. It must refuse to run against
   a non-empty target unless `--allow-existing` is explicitly provided.
9. Run export equivalence checks against the source filesystem and migrated
   object-db mode.

## Docker Compose Shape

Docker Compose should include:

```text
masking-app
postgres
minio
minio-init
```

The app should depend on healthy Postgres and MinIO only when
`MASKING_APP_STORAGE_BACKEND=object-db`.

Local development can still use `npm run dev` with filesystem mode.

## Verification Gates

Required before treating the new stack as usable:

```bash
scripts/harness/backup-data-root.sh data
scripts/harness/restore-verify.sh <backup.tgz>
docker compose up -d postgres minio minio-init
scripts/harness/db-migrate.sh
scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --json
scripts/harness/migrate-file-storage-to-object-db.sh --data-root data --apply --json
scripts/harness/object-db-verify.sh
scripts/harness/test-target.sh
scripts/harness/deployment-check.sh http://127.0.0.1:4173
```

`object-db-verify` must check both sides:

- every DB image object key exists in MinIO
- every DB mask object key exists in MinIO
- dimensions in DB match image/mask metadata
- deleted records are excluded from normal export
- export ZIP can be created from DB metadata plus MinIO objects

## Implementation Slices

### Slice 1: Backup And Docker Dependencies

- Preserve current backup.
- Extend `docker-compose.yml` with Postgres and MinIO services.
- Add `.env.example`.
- Add health checks.

### Slice 2: Schema And Migration Harness

- Add SQL migrations.
- Add migration runner.
- Add migration dry-run from current filesystem manifests.

### Slice 3: Object Store Adapter

- Add MinIO/S3 adapter.
- Add object key conventions.
- Add object existence verifier.

### Slice 4: Metadata Repository Adapter

- Add Postgres repository adapter.
- Keep filesystem adapter as fallback/default.
- Route API through the repository interface.

### Slice 5: End-To-End Cutover

- Run temp Docker stack.
- Migrate backed-up filesystem data into DB+MinIO.
- Verify export equivalence.
- Switch compose app to `MASKING_APP_STORAGE_BACKEND=object-db`.

## Open Risks

- New runtime dependencies are needed for PostgreSQL and S3-compatible object
  storage. They must be committed with a lockfile after install.
- Migration must be idempotent enough to retry after partial failures.
- Browser IndexedDB should become recovery cache only; server DB+MinIO must be
  treated as source of truth after cutover.
- Access control for MinIO console and credentials must be changed before any
  non-local deployment.
