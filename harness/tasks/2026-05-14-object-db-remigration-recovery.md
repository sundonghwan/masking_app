# Task: object-db-remigration-recovery

## Goal
- Fix the object-db migration bug that dropped class-aware annotation metadata.
- Remove the corrupted `rail-mask-20260513` object-db copy.
- Rebuild Postgres and MinIO records from the filesystem app data root without deleting `data/rail-mask-20260513`.

## Scope
- `src/server/fileStorageObjectDbMigration.js`
- `tests/fileStorageObjectDbMigration.test.js`
- Postgres rows for `rail-mask-20260513`
- MinIO prefix `masking-app/projects/rail-mask-20260513`
- Backup artifacts under `backups/`

## Non-goals
- Delete or reset the filesystem source project under `data/rail-mask-20260513`.
- Decide whether each user-made mask should semantically be `slider` or `support`.
- Switch the live app runtime from filesystem to object-db.

## Risks
- Deleting filesystem data would remove the remaining mask PNG pixel source.
- Re-migrating from a corrupted manifest would faithfully reproduce corrupted labels.
- A verifier can pass object references while still missing class metadata unless class rows are inspected.

## Impact Chains

### suspected
- migrateFileStorageToObjectDb (src/server/fileStorageObjectDbMigration.js:7-47) -> createSourceMigrationPlan (src/server/fileStorageObjectDbMigration.js:62-176) -> imageAnnotations (src/server/fileStorageObjectDbMigration.js:362-393) -> upsertAnnotation (src/server/fileStorageObjectDbMigration.js:323-354)

### validated
- imageAnnotations (src/server/fileStorageObjectDbMigration.js:362-393) -> createSourceMigrationPlan (src/server/fileStorageObjectDbMigration.js:62-176) -> upsertAnnotation (src/server/fileStorageObjectDbMigration.js:323-354)
  - validation: `node --test tests/fileStorageObjectDbMigration.test.js`
  - validation: Postgres query returned `class_id=1 slider` and `class_id=2 support` rows, with no `class_id=0 unlabeled` rows for `rail-mask-20260513`.
- migrateFileStorageToObjectDb (src/server/fileStorageObjectDbMigration.js:7-47) -> putFileObject (src/server/fileStorageObjectDbMigration.js:353-361) -> verifyObjectReferences (scripts/harness/object-db-verify.mjs:94-120)
  - validation: `scripts/harness/object-db-verify.sh --json --ensure-bucket` passed with `checked=210`, `missing=0`.

### discarded
- filesystem data root deletion
  - reason: `data/rail-mask-20260513` remained the only local app-created filesystem source with mask PNGs and was preserved.
- restoring old tgz backups directly
  - reason: both older tgz backups already contained `support#ff4422` labels and would reintroduce the same metadata pollution.

## Validation Plan
- Add a failing migration test for manifest `images[].annotations[]`.
- Update migration annotation discovery to read `annotations[]` before legacy `class_annotations[]`.
- Run targeted migration tests.
- Dry-run migration from `data/` and confirm annotation count includes current manifest annotations.
- Back up current data and object-db state.
- Delete only `rail-mask-20260513` object-db rows and MinIO prefix.
- Re-run migration with `--apply`.
- Inspect Postgres class rows and MinIO mask filenames.
- Run storage and object-db verifiers.
- Run full test suite.

## Progress Notes
- Root cause: `imageAnnotations` only inspected `image.class_annotations`, while current project manifests store class masks under `image.annotations`.
- The migration fallback then used `current_mask_path` and saved rows as `class_id=0`, `class_name=unlabeled`.
- Postgres dump before remigration: `backups/masking_app_before_remigrate_rail_mask_20260513.dump`.
- Filesystem data backup before repair attempt: `backups/masking-app-data-20260514T060633Z.tgz`.
- Recovered filesystem data backup after remigration: `backups/masking-app-data-20260514T061838Z.tgz`.
- Recovered Postgres dump: `backups/masking_app_recovered_rail_mask_20260513.dump`.
- Recovered MinIO prefix backup: `backups/masking_app_minio_recovered_rail_mask_20260513.tgz`.

## Findings
- The object-db verifier checks object references, but it does not prove class semantics are correct. Postgres class rows must be inspected for this recovery class.
- MinIO/Postgres were not a clean backup source; they were the corrupted migration target.

## Closeout
- Migration test added and passed.
- Object-db `rail-mask-20260513` was rebuilt from filesystem source.
- Postgres recovered annotation rows: 13 total, `slider=7`, `support=6`, `unlabeled=0`.
- MinIO recovered mask filenames use `slider` and `support`, not `support_ff4422`.
- `scripts/harness/object-db-verify.sh --json --ensure-bucket` passed.
- `scripts/harness/storage-verify.sh --json data` passed.
- `npm test` passed with 353 tests.
