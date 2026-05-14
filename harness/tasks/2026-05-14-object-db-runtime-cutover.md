# Task: object-db-runtime-cutover

## Goal

- Make Postgres metadata and MinIO object storage the runtime source of truth
  when `MASKING_APP_STORAGE_BACKEND=object-db`.
- Prepare Docker Compose to run the app in object-db mode by default.

## Scope

- Runtime storage wiring in `server.js`.
- Object DB storage adapter for project/image/mask read and write paths.
- Compose and environment defaults.
- Focused live smoke against local Postgres and MinIO.

## Non-goals

- Remove filesystem storage.
- Replace browser IndexedDB recovery.
- Prove export equivalence across filesystem and object-db modes.

## Risks

- Metadata and object bytes can diverge if object write succeeds and DB write
  fails.
- Some admin maintenance routes may still be filesystem-first until follow-up
  hardening.
- Browser IndexedDB can still show stale state until server refresh clears or
  replaces it.

## Impact Chains

### suspected

- createRuntimeStorage (server.js:*) -> createObjectDbStorage (src/server/objectDbStorage.js:*) -> createApiRouter (src/server/api.js:*)
- routeProject GET (src/server/api.js:*) -> objectDbStorage.readProjectManifest (src/server/objectDbStorage.js:*) -> Postgres images/annotations + MinIO file API
- routeImage mask PUT (src/server/api.js:*) -> objectDbStorage.writeMaskBuffer (src/server/objectDbStorage.js:*) -> objectDbStorage.writeProjectManifest (src/server/objectDbStorage.js:*)
- routeProject purge (src/server/api.js:*) -> objectDbStorage.purgeProject (src/server/objectDbStorage.js:*) -> Postgres cascade + MinIO prefix deletion

### validated

- createRuntimeStorage -> object-db health profile
  - validation: `GET /api/health` on port 4174 returned `storage_backend=object-db`.
- readProjectManifest -> DB label schema/images/annotations
  - validation: `GET /api/projects/rail-mask-20260513` returned labels
    `slider,support`, images `101`, annotations `slider=5`, `support=9`.
- readProjectFile -> MinIO object bytes
  - validation: object-db file API returned PNG metadata for one original image
    and one grayscale mask.
- write project/image/mask -> Postgres/MinIO -> read manifest
  - validation: live smoke created a temporary project, uploaded an image, saved
    a class mask, and read back one annotation; temporary DB/MinIO records were
    removed after the smoke.
- archive/restore/purge helpers -> DB deletion metadata + MinIO cleanup
  - validation: focused tests plus live cleanup of temporary object-db smoke
    project.

### discarded

- Storing image/mask bytes in Postgres
  - reason: design keeps DB as metadata source of truth and MinIO as binary
    object source of truth.

## Validation Plan

- Syntax/lint/typecheck.
- Focused object-db live smoke.
- Full test suite.
- Object reference verifier against Postgres and MinIO.
- Deployment packaging tests for Compose default.

## Progress Notes

- Added `src/server/objectDbStorage.js`.
- `server.js` now selects object-db storage when deployment profile requests it.
- Docker Compose and `.env.example` now default to `object-db`.
- Preserved project/image archive metadata and purge paths in object-db mode so
  Docker staging does not regress project deletion operations.

## Findings

- Mask images are not stored directly in PostgreSQL. PostgreSQL stores
  `annotations.mask_object_key` and related metadata; MinIO stores the actual
  mask PNG bytes.
- Docker Compose is now the preferred object-db runtime. Host-native
  `npm run dev` remains filesystem-backed unless object-db environment variables
  are supplied explicitly.

## Closeout

- Fresh validations:
  - `node --check src/server/objectDbStorage.js`
  - `node --check server.js`
  - `node --test tests/deploymentPackaging.test.js tests/metadataDb.test.js tests/checkSyntax.test.js`
  - live object-db API smoke on `127.0.0.1:4174`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/object-db-verify.sh --json --ensure-bucket` with DB/MinIO env
  - `scripts/harness/test-target.sh`
  - `git diff --check`
- Code review: no blocking issue found in the runtime selection, object key
  mapping, label metadata preservation, or project/image lifecycle paths.
- Remaining risk: export/training-set parity in object-db mode should be
  re-smoked on the final target host with real data before release handoff.
