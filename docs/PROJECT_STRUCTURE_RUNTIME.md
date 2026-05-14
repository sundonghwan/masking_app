# Project Structure And Runtime State

## Audience

Maintainers operating or debugging this repository before Docker/object-db
deployment.

## Objective

Make the current folder structure, runtime data ownership, config ownership, and
verification commands explicit so operators do not accidentally repair the wrong
storage layer.

## Repository Structure

| Path | Role | Git policy |
| --- | --- | --- |
| `server.js` | Node HTTP entrypoint, static serving, storage adapter selection | tracked |
| `src/` | Browser app, editor, API client, export logic, server modules | tracked |
| `scripts/harness/` | Validation, backup, migration, deployment wrappers | tracked |
| `harness/` | Agent/task/run-log/checklist operating layer | tracked |
| `docs/` | Architecture, runbooks, risk board, product status | tracked |
| `tests/` | Node test suite and fixtures | tracked |
| `Dockerfile` | App image definition | tracked |
| `docker-compose.yml` | App + Postgres + MinIO local staging stack | tracked |
| `.env.example` | Example runtime variables | tracked |
| `data/` | Host-native filesystem recovery data root | ignored |
| `backups/` | Local data-root backup archives/manifests | ignored |
| `release-artifacts/` | Local deployment/evidence outputs | ignored by policy unless explicitly added |
| `node_modules/` | Installed dependencies | ignored |

## Runtime Storage Ownership

Docker Compose now defaults to `MASKING_APP_STORAGE_BACKEND=object-db`.

In object-db mode:

```text
PostgreSQL
  owns project/task/version/image/annotation/review metadata
  stores object keys, label schema, statuses, deletion metadata

MinIO
  owns original image bytes
  owns class-specific binary mask PNG bytes
  owns future export artifacts

App server
  validates API requests
  writes MinIO objects
  writes PostgreSQL metadata
  exposes archive-relative file paths to the browser
```

In filesystem mode:

```text
data/
  flat project manifests and files for local recovery
  hierarchy mirror under data/projects/
  local identity/session/audit files
```

Filesystem mode is retained for host-native development, backup restore, and
emergency inspection. It is no longer the preferred shared runtime.

## Current Data Baseline

Current verified local data root:

```text
data_root: data
flat_projects: 2
hierarchy_projects: 2
task_versions: 2
images: 197
masks: 26
json_files: 28
```

Current verified object-db references:

```text
bucket: masking-app
checked_object_refs: 211
missing: 0
```

Primary working project:

```text
project_id: rail-mask-20260513
labels:
  class_id=1 name=slider  color=#EF0033
  class_id=2 name=support color=#FF4422
annotations:
  slider=5
  support=9
```

Latest data-root backup after cleanup:

```text
backups/masking-app-data-20260514T074945Z.tgz
backups/masking-app-data-20260514T074945Z.json
```

## Config Baseline

Docker Compose app defaults:

```text
MASKING_APP_MODE=staging
MASKING_APP_HOST=0.0.0.0
MASKING_APP_PORT=4173
MASKING_APP_DATA_DIR=/app/data
MASKING_APP_PUBLIC_ROOT=/app
MASKING_APP_STORAGE_BACKEND=object-db
```

Object-db dependencies:

```text
Postgres service: postgres:16-alpine
Postgres volume: masking_postgres_data
MinIO service: minio/minio:latest
MinIO volume: masking_minio_data
Object bucket: masking-app
```

Host-native `npm run dev` keeps filesystem mode unless object-db env variables
are provided explicitly.

## Verification Commands

Filesystem recovery data:

```bash
scripts/harness/storage-verify.sh --json data
```

Postgres/MinIO object references:

```bash
MASKING_APP_DATABASE_URL=postgres://masking:masking-local-password@127.0.0.1:5432/masking_app \
MASKING_APP_OBJECT_ENDPOINT=http://127.0.0.1:9000 \
MASKING_APP_OBJECT_ACCESS_KEY=masking \
MASKING_APP_OBJECT_SECRET_KEY=masking-local-password \
MASKING_APP_OBJECT_BUCKET=masking-app \
scripts/harness/object-db-verify.sh --json --ensure-bucket
```

Docker app health after serving:

```bash
scripts/harness/deployment-check.sh --json http://127.0.0.1:4173
```

Latest local Docker object-db health artifact:

```text
release-artifacts/deployment-check-20260514-docker-object-db.json
```

## Operating Risks

| Risk | Current control | Remaining action |
| --- | --- | --- |
| Filesystem and object-db diverge | Run both `storage-verify` and `object-db-verify` before backup/deploy | Treat object-db as runtime truth and filesystem as recovery copy |
| Label filename drift | Manifest and verifier now agree for current support/slider split | Avoid manual mask renames outside API/migration scripts |
| Port conflict on `4173` | Check `lsof -nP -iTCP:4173 -sTCP:LISTEN` before Compose app start | Stop host-native dev server before Docker serve |
| Local seed credentials | Local MVP accounts are still bootstrap credentials | Rotate before shared network use or adopt external identity |
| Export/training-set parity on final host | Unit tests and object-db smoke cover core read/write | Run export/training-set smoke on final target host data before release handoff |

## Recommended Order Before Shared Use

1. Backup `data/`.
2. Verify `data/` with `storage-verify`.
3. Verify Postgres/MinIO with `object-db-verify`.
4. Build and start Docker Compose.
5. Run deployment check against `http://127.0.0.1:4173`.
6. Login as admin and open `rail-mask-20260513`.
7. Export a small representative dataset and record the artifact path.
