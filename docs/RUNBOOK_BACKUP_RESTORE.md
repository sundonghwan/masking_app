# Backup And Restore Runbook

## Audience

Operators and maintainers running Masking App with filesystem storage.

## Objective

Back up, restore, and verify the current `MASKING_APP_DATA_DIR` without
guessing which files matter. This runbook is for the current local/staging
production-like deployment shape; it does not replace a future database or
object-storage backup policy.

## Storage Context

The app stores runtime data under `MASKING_APP_DATA_DIR`. If that variable is
not set, the server uses `data/` under the repository.

Current storage can include:

- flat project folders: `<data_root>/<project_id>/manifest.json`,
  `images/`, `masks/`, `exports/`
- hierarchical project folders:
  `<data_root>/projects/<project_id>/tasks/<task_id>/versions/<version_id>/`
- saved training sets: `<data_root>/training_sets/<training_set_id>/`
- local identity files: `<data_root>/identity/users.json` and
  `<data_root>/identity/sessions/*.json`

Back up the whole data root. Do not back up only `images/` or only
`manifest.json`; manifests, masks, task/version metadata, training-set metadata,
and identity files must stay together.

## Before Backup

1. Identify the data root:

   ```bash
   echo "${MASKING_APP_DATA_DIR:-data}"
   ```

2. Prefer a quiet window. The current filesystem backend writes JSON manifests
   directly, so a backup taken during active upload/save/review traffic can
   capture files from different moments.

3. Run storage verification:

   ```bash
   scripts/harness/storage-verify.sh "${MASKING_APP_DATA_DIR:-data}"
   ```

   If verification fails, inspect the reported manifest path and referenced file
   path before taking the backup.

## Backup Procedure

Use an archive name that includes the environment and timestamp.

```bash
DATA_ROOT="${MASKING_APP_DATA_DIR:-data}"
BACKUP_DIR="/tmp/masking-app-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/masking-app-data-$STAMP.tgz" -C "$(dirname "$DATA_ROOT")" "$(basename "$DATA_ROOT")"
```

Verify the archive can be listed:

```bash
tar -tzf "$BACKUP_DIR/masking-app-data-$STAMP.tgz" | head
```

Keep the archive outside the active data root. Do not store backups under
`$DATA_ROOT/exports` because project purge or cleanup work may later remove
files under the data root.

## Restore Procedure

Restore into a new directory first. Do not overwrite the live data root as the
first step.

```bash
RESTORE_PARENT="/tmp/masking-app-restore"
BACKUP_FILE="/path/to/masking-app-data-YYYYMMDDTHHMMSSZ.tgz"
mkdir -p "$RESTORE_PARENT"
tar -xzf "$BACKUP_FILE" -C "$RESTORE_PARENT"
```

Run verification against the restored data root:

```bash
scripts/harness/storage-verify.sh "$RESTORE_PARENT/data"
```

If the original archive used a non-`data` directory name, point the verifier at
that extracted directory instead.

Start the app against the restored directory:

```bash
MASKING_APP_HOST=127.0.0.1 \
MASKING_APP_DATA_DIR="$RESTORE_PARENT/data" \
npm run dev
```

Then check:

```bash
curl -sS http://127.0.0.1:4173/api/health
scripts/harness/browser-e2e.sh
```

The browser E2E creates its own temporary data root, so it verifies that the app
binary and browser workflow still run. It does not validate restored production
content; use `storage-verify.sh` for restored content integrity.

## Cutover

Only after restored verification passes:

1. Stop the app.
2. Move the current live data root aside as a rollback copy.
3. Move or point `MASKING_APP_DATA_DIR` to the restored data root.
4. Start the app.
5. Run `GET /api/health`.
6. Open the project list and inspect a representative project, image, mask,
   review state, and training-set export source.

Rollback is the inverse: stop the app, point `MASKING_APP_DATA_DIR` back to the
previous live data root, and restart.

## Verification Command

```bash
scripts/harness/storage-verify.sh [data-root]
scripts/harness/storage-verify.sh --json [data-root]
```

The verifier is read-only. It checks:

- data root exists and is a directory
- JSON manifests parse
- flat project image and mask paths resolve under the project root
- hierarchy task/version image and mask paths resolve under the version root
- training-set metadata JSON parses
- identity JSON files parse when present
- image paths have parseable image metadata
- mask paths have a valid PNG header

It does not prove that a backup is recent, complete across multiple machines, or
transactionally consistent under concurrent writes.

## Failure Response

If verification reports `referenced_file_missing`, inspect the owning manifest
and path before restoring:

```bash
scripts/harness/storage-verify.sh --json "${MASKING_APP_DATA_DIR:-data}"
```

Common causes:

- a backup was taken during an active upload or mask save
- a manifest was copied without its `images/` or `masks/` directory
- a hierarchical version was restored without its `trash/` or version files
- manual file deletion happened outside the app

If verification reports `mask_png_invalid`, do not export the affected dataset
until the mask is regenerated or restored from an earlier backup.

## Open Constraints

- There is no scheduled backup service in this repository.
- There is no retention policy yet.
- There is no transaction boundary across all filesystem writes.
- Multi-user production should revisit SQLite/PostgreSQL or object storage when
  concurrent write pressure increases.
