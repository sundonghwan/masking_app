# Task: misclassified-support-mask-recovery

## Goal

- Recover masks that were intended to be `slider`/주습판 but were stored under
  `support#ff4422`.

## Scope

- Filesystem data root for `rail-mask-20260513`
- Flat project manifest `data/rail-mask-20260513/manifest.json`
- Mask PNG files under `data/rail-mask-20260513/masks`
- Recovery report under `data/rail-mask-20260513/recovery`

## Non-goals

- Rebuilding the old backup archive.
- Editing browser IndexedDB caches directly.
- Rewriting the inactive object-db/MinIO copy.

## Risks

- `image_0001` and `image_0010` already had slider masks as well as support
  masks, so recovery needed pixel union merge rather than overwrite.
- Browser tabs may still have stale IndexedDB project state until refreshed from
  server.
- Object-db/MinIO was previously used as a migration target, but local runtime
  health currently reports `storage_backend=filesystem` and object-db disabled.

## Impact Chains

### suspected

- `data/rail-mask-20260513/manifest.json` -> project API manifest -> workbench label selector/mask loader
- `data/rail-mask-20260513/masks/*support_ff4422*` -> annotation mask paths -> export/training set output

### validated

- `data/rail-mask-20260513/manifest.json` -> project API manifest -> workbench label selector/mask loader
  - validation: local manifest inspection and authenticated `GET /api/projects/rail-mask-20260513`
- `data/rail-mask-20260513/masks/*` -> storage verifier -> mask PNG header/contract checks
  - validation: `scripts/harness/storage-verify.sh --json data`

### discarded

- `backups/masking-app-data-20260513T234409Z.tgz` as a clean restore point.
  - reason: extracted backup already contained `support#ff4422` annotations and
    mask paths.

## Actions

- Created current backup before mutation:
  - `backups/masking-app-data-20260514T055538Z.tgz`
  - `backups/masking-app-data-20260514T055538Z.json`
- Changed label schema:
  - class 1: `slider`, `#EF0033`
  - class 2: `support`, `#FF4422`
- Migrated 9 annotations from `class_id=2 support#ff4422` to
  `class_id=1 slider`.
- Renamed 7 support mask files to slider mask paths.
- Merged 2 conflicting masks by pixel union:
  - `image_0001`
  - `image_0010`
- Preserved original conflicting support masks under:
  - `data/rail-mask-20260513/recovery/support-misclassified-20260514T055538Z/`

## Validation

- Manifest inspection:
  - support annotation count: 0
  - slider annotation count: 12
- Filesystem masks:
  - `data/rail-mask-20260513/masks` now contains slider class mask files only
    for the recovered masks.
- `scripts/harness/storage-verify.sh --json data`
  - status: passed
  - warnings: 0
  - errors: 0
- `GET /api/health`
  - status: ok
  - storage backend: filesystem
- Authenticated `GET /api/projects/rail-mask-20260513`
  - returned `label_schema` with `slider` and `support`
  - returned recovered masks under `class_id=1`, `class_name=slider`

## Closeout

- Filesystem recovery completed.
- Server restarted after repair.
- Remaining operator action: refresh the browser workbench from server with the
  topbar `↻` button or reload the project so stale IndexedDB state does not
  remain on screen.
