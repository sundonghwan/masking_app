# Task: local-persistence

## Goal

- Persist uploaded images, mask blobs, and project metadata locally so the MVP
  can recover work after browser reload.

## Scope

- IndexedDB-backed project store with memory fallback.
- App integration for upload persistence, mask autosave, reload restoration, and
  clear project.
- Tests and harness validation.

## Non-goals

- Backend API persistence.
- Multi-project management UI.
- ZIP archive export.
- Cross-device sync.

## Touched Areas

- `src/storage/projectStore.js`
- `src/app.js`
- `tests/projectStore.test.js`
- `harness/`

## Risks

- Blob URLs must be recreated after reload.
- Saved metadata must not include unserializable `File` objects.
- Autosave must persist mask data without unexpectedly triggering downloads.
- Restored image records must remain compatible with export validation.

## Impact Chains

### suspected

- handleFiles (src/app.js:1-1) -> projectStore.saveImageBlob (src/storage/projectStore.js:1-1) -> persistProject (src/app.js:1-1)
- handleEditorChange (src/app.js:1-1) -> autosaveCurrentMask (src/app.js:1-1) -> projectStore.saveMaskBlob (src/storage/projectStore.js:1-1)
- restoreProject (src/app.js:1-1) -> projectStore.loadImageBlob/loadMaskBlob (src/storage/projectStore.js:1-1) -> MaskEditor.loadImage (src/editor/maskEditor.js:1-1)

### validated

- handleFiles (src/app.js) -> projectStore.saveImageBlob (src/storage/projectStore.js) -> persistProject (src/app.js)
- handleEditorChange (src/app.js) -> autosaveCurrentMask (src/app.js) -> projectStore.saveMaskBlob (src/storage/projectStore.js)
- restoreProject (src/app.js) -> projectStore.loadImageBlob/loadMaskBlob (src/storage/projectStore.js) -> MaskEditor.loadImage (src/editor/maskEditor.js)
- exportProject (src/app.js) -> createZipBlob (src/export/zip.js) -> downloadBlob (src/export/exporter.js)

### discarded

- backend persistence chain
  - reason: this slice remains local-first.

## Validation Plan

- `npm test`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- browser reload smoke at `http://localhost:4173`

## Validation Results

- `npm run lint` -> passed.
- `npm run typecheck` -> passed.
- `npm test` -> passed, 22 tests.
- `scripts/harness/smoke-web.sh` -> passed.
- Browser smoke at `http://localhost:4173` -> restored an uploaded image after
  reload from local persistence.

## Progress Notes

- Added IndexedDB/local memory project store.
- Wired app upload persistence, mask autosave, reload restoration, and clear
  project to the store.
- Added dependency-free browser ZIP export for MVP archive structure.

## Findings

- Project snapshots must remain metadata-only; image and mask binary values are
  stored separately by image ID.
- Object URLs are runtime handles and should be recreated from blobs after
  reload, not persisted.

## File-back Candidates

- Update README and frontend playbook with local persistence behavior.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
