# Task: worker-b-storage-hierarchy-foundation

## Goal

- Implement the storage hierarchy foundation for
  `data/projects/{project_id}/tasks/{task_id}/versions/{version_id}` from
  `docs/STORAGE_HIERARCHY_DESIGN.md`.

## Scope

- Add path/schema helpers for project/task/version storage roots.
- Add helpers for project metadata, task metadata, and version manifests.
- Keep existing flat `data/{project_id}/manifest.json` behavior compatible.
- Keep stored image and mask paths relative to their version root.
- Add soft delete/restore primitives for version image records and files where
  practical.
- Add focused storage tests.

## Non-goals

- Wire new API routes or frontend behavior.
- Migrate existing `data/` folders.
- Physically purge deleted files.
- Change editor, auth, API, or export integration behavior.

## Touched Areas

- `src/server/storage.js`
- `tests/serverStorage.test.js`
- `harness/tasks/2026-04-30-worker-b-storage-hierarchy-foundation.md`
- `harness/run_log.md`

## Risks

- Storage path helpers could accidentally store absolute paths or paths outside
  the configured data root.
- Compatibility reads could break existing flat project manifests.
- Soft delete/restore file moves could lose image or mask files if path
  validation is too loose.

## Impact Chains

### suspected

- `createFileStorage.ensureVersionManifest (src/server/storage.js:*) -> writeVersionManifest (src/server/storage.js:*) -> data/projects/{project_id}/tasks/{task_id}/versions/{version_id}/manifest.json`
- `createFileStorage.writeVersionImageBuffer (src/server/storage.js:*) -> versionPath (src/server/storage.js:*) -> version manifest image_path`
- `createFileStorage.softDeleteVersionImage (src/server/storage.js:*) -> moveVersionRelativeFile (src/server/storage.js:*) -> trash/images and trash/masks`
- `createFileStorage.restoreVersionImage (src/server/storage.js:*) -> moveVersionRelativeFile (src/server/storage.js:*) -> images and masks`
- `createFileStorage.readProjectManifest (src/server/storage.js:*) -> legacy flat data/{project_id}/manifest.json`

### validated

- `createFileStorage.ensureVersionManifest (src/server/storage.js:149-184) -> writeVersionManifest (src/server/storage.js:179-184) -> data/projects/{project_id}/tasks/{task_id}/versions/{version_id}/manifest.json`
  - validation: `node --test tests/serverStorage.test.js` passed metadata
    directory/file assertions in `tests/serverStorage.test.js:182-231`.
- `createFileStorage.writeVersionImageBuffer (src/server/storage.js:193-205) -> getHierarchyPaths (src/server/storage.js:68-87) -> version manifest image_path`
  - validation: `node --test tests/serverStorage.test.js` passed relative
    version-root path assertions in `tests/serverStorage.test.js:233-263`.
- `createFileStorage.softDeleteVersionImage (src/server/storage.js:226-232) -> moveVersionRelativeFile (src/server/storage.js:665-687) -> trash/images and trash/masks`
  - validation: `node --test tests/serverStorage.test.js` passed soft-delete
    file move, metadata, and no-overwrite assertions in
    `tests/serverStorage.test.js:281-387`.
- `createFileStorage.restoreVersionImage (src/server/storage.js:234-239) -> moveVersionRelativeFile (src/server/storage.js:665-687) -> images and masks`
  - validation: `node --test tests/serverStorage.test.js` passed restore file
    move and metadata clearing assertions in `tests/serverStorage.test.js:337-349`.
- `createFileStorage.readProjectManifest (src/server/storage.js:42-50) -> legacy flat data/{project_id}/manifest.json`
  - validation: `node --test tests/serverStorage.test.js` passed flat manifest
    compatibility assertions in `tests/serverStorage.test.js:265-279`.

### discarded

- API route integration.
  - reason: assigned to main integration, not Worker B storage foundation.

## Validation Plan

- `npm test -- tests/serverStorage.test.js` after focused storage test changes.
- `scripts/harness/test-target.sh` as required minimum full test wrapper.
- `git diff --check` for whitespace.
- Review final diff against `harness/checklists/review.md`.

## Progress Notes

- 2026-04-30: Started Worker B storage hierarchy foundation lane.
- 2026-04-30: Added hierarchy metadata and version file helpers while keeping
  legacy flat project helpers unchanged.
- 2026-04-30: Added soft delete/restore primitives that move version image and
  mask files through `trash/` without changing original relative manifest paths.
- 2026-04-30: Added overwrite protection for delete/restore file moves.

## Validation Results

- `npm test -- tests/serverStorage.test.js`: red first for missing storage
  hierarchy methods; later storage tests passed, but the npm script also ran
  all `tests/*.test.js` and reported unrelated parallel-lane failures.
- `node --test tests/serverStorage.test.js`: passed, 16 tests.
- `node --check src/server/storage.js`: passed.
- `scripts/harness/lint-all.sh`: passed.
- `scripts/harness/test-target.sh`: failed, 139 passed / 1 failed. The
  remaining failure is outside Worker B scope:
  `tests/appContracts.test.js` still finds `admin123|worker123|reviewer123` in
  browser-imported `src/config/runtimeDefaults.js`.
- `git diff --check`: passed.

## Review Findings

- Fixed during review: delete/restore file moves now refuse to overwrite an
  existing destination file instead of relying on platform `rename` behavior.
- No blocking storage-scope issue found after the focused diff review.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] No commit or push, per user request.
