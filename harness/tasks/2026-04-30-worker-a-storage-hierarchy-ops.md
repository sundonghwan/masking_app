# Task: worker-a-storage-hierarchy-ops

## Goal

- Add storage-layer helpers for version cloning, version manifest soft
  delete/restore, explicit physical purge of already-soft-deleted referenced
  version files, and numeric manifest revision increments.

## Scope

- Own only:
  - `src/server/storage.js`
  - `tests/serverStorage.test.js`
  - `harness/tasks/2026-04-30-worker-a-storage-hierarchy-ops.md`
- Preserve existing flat project storage compatibility.
- Preserve image/mask relative paths when cloning version manifests.
- Delete files only through an explicit purge helper and only when referenced by
  soft-deleted records.

## Non-goals

- API route integration.
- UI integration.
- Directory-wide purge behavior.
- Migration of existing runtime data.
- Commit or push.

## Risks

- Revision increments could break existing manifest equality tests if applied
  to legacy project manifests or raw writes.
- Purge behavior could delete active files if it does not check soft-delete
  state per record.
- Clone behavior could accidentally rewrite archive-relative paths or carry
  deletion metadata into a new version.

## Impact Chains

### suspected

- `createFileStorage.cloneVersionManifest (src/server/storage.js:*) -> writeVersionManifest (src/server/storage.js:*) -> data/projects/{project_id}/tasks/{task_id}/versions/{new_version_id}/manifest.json`
- `createFileStorage.softDeleteVersionManifest (src/server/storage.js:*) -> mutateVersionManifest (src/server/storage.js:*) -> version manifest deletion metadata`
- `createFileStorage.restoreVersionManifest (src/server/storage.js:*) -> mutateVersionManifest (src/server/storage.js:*) -> version manifest deletion metadata`
- `createFileStorage.purgeSoftDeletedVersionFiles (src/server/storage.js:*) -> removeSoftDeletedVersionRecordFiles (src/server/storage.js:*) -> referenced images/masks only`
- `createFileStorage.mutateVersionManifest (src/server/storage.js:*) -> incrementRevision (src/server/storage.js:*) -> numeric revision on version manifest mutations`

### validated

- `createFileStorage.cloneVersionManifest (src/server/storage.js:232-272) -> copyVersionRecordFiles (src/server/storage.js:990-995) -> writeVersionManifest (src/server/storage.js:218-230) -> data/projects/{project_id}/tasks/{task_id}/versions/{new_version_id}/manifest.json`
  - validation: `node --test tests/serverStorage.test.js` passed clone
    metadata, relative path, copied image file, and copied mask file assertions
    in `tests/serverStorage.test.js:485-558`.
- `createFileStorage.softDeleteVersionManifest (src/server/storage.js:274-280) -> updateVersionManifestDeletion (src/server/storage.js:288-319) -> version manifest deletion metadata`
  - validation: `node --test tests/serverStorage.test.js` passed
    `deleted_at`, `deleted_by`, `delete_reason`, `updated_at`, revision, and
    no-file-move assertions in `tests/serverStorage.test.js:560-601`.
- `createFileStorage.restoreVersionManifest (src/server/storage.js:282-286) -> updateVersionManifestDeletion (src/server/storage.js:288-319) -> version manifest deletion metadata`
  - validation: `node --test tests/serverStorage.test.js` passed deletion
    metadata clearing, revision increment, and no-file-move assertions in
    `tests/serverStorage.test.js:590-601`.
- `createFileStorage.purgeSoftDeletedVersionFiles (src/server/storage.js:321-365) -> purgeVersionRelativeFile (src/server/storage.js:1042-1066) -> referenced images/masks only`
  - validation: `node --test tests/serverStorage.test.js` passed active-file
    preservation, active directory preservation, direct referenced-file purge,
    and trash-file purge assertions in `tests/serverStorage.test.js:603-714`.
- `writeVersionManifest (src/server/storage.js:218-230) -> normalizeRevision (src/server/storage.js:937-940) -> numeric revision on version manifests`
  - validation: `node --test tests/serverStorage.test.js` passed clone
    `revision=1` and soft-delete/restore `revision=2/3` assertions in
    `tests/serverStorage.test.js:530-586`.

### discarded

- Legacy project manifest revision increments.
  - reason: would risk breaking flat manifest compatibility and was outside the
    assigned version hierarchy operation scope.
- Directory purge.
  - reason: user explicitly requested no whole-directory purge behavior.

## Validation Plan

- `node --test tests/serverStorage.test.js`
- `node --check src/server/storage.js`
- Review final diff against `harness/checklists/review.md`.

## Progress Notes

- 2026-04-30: Started Worker A storage hierarchy operations lane.
- 2026-04-30: Added public storage helpers for clone, version manifest
  soft-delete/restore, and explicit soft-deleted version file purge.
- 2026-04-30: Added numeric revision normalization for version manifests and
  revision increments for version manifest/image mutations.
- 2026-04-30: Added focused server storage tests for clone file copy,
  manifest-only version delete/restore, active-file-safe purge, and trash purge.

## Validation Results

- `node --test tests/serverStorage.test.js`: passed, 22 tests.
- `node --check src/server/storage.js`: passed.
- `git diff --check -- src/server/storage.js tests/serverStorage.test.js harness/tasks/2026-04-30-worker-a-storage-hierarchy-ops.md`: passed.

## Review Findings

- Fixed during review: clone now copies referenced image and mask files into the
  target version root, matching `docs/STORAGE_HIERARCHY_DESIGN.md`, instead of
  only copying manifest references.
- Fixed during review: purge tests now cover both active referenced files and
  files moved under `trash/` by `softDeleteVersionImage`.
- No blocking storage-scope issue found in the final diff review.

## Closeout

- [x] Scope matched the Worker A ownership boundary.
- [x] Review checklist completed for risky storage changes.
- [x] Validated impact chains have direct validation evidence.
- [x] Required validation commands passed.
- [x] No commit or push, per user request.
- [x] `harness/run_log.md` was not touched because it already had unrelated
  local modifications.
