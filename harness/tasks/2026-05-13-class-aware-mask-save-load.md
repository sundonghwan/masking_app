# Task: class-aware-mask-save-load

## Goal
- Save and load masks per selected `class_id` so one image can hold multiple class-labeled binary masks.

## Scope
- Annotation record helpers for deterministic class mask paths and local blob keys
- Browser workbench save/load/autosave/submit behavior for selected class masks
- API/client/server mask save payload and manifest annotation upsert
- Focused tests, feature status, and architecture notes

## Non-goals
- Full class-aware export/training-set ZIP conversion
- AI prediction import
- Indexed/colored mask storage; the editor remains binary per selected class

## Risks
- Switching labels can lose unsaved work if the current editor mask is not captured first.
- Backend class-aware annotation metadata must preserve legacy `current_mask_path` compatibility.
- Local mask blobs must not overwrite another class for the same image.

## Impact Chains

### suspected
- selectClassLabel (src/app.js:2685-2697) -> saveActiveClassMaskLocal (src/app.js:*) -> loadSelectedClassMaskIntoEditor (src/app.js:*) -> MaskEditor.loadImage/replaceMaskFromDataUrl (src/editor/maskEditor.js:175-194,378-390)
- autosaveCurrentMask/saveCurrentMask/submitCurrentImage (src/app.js:1100-1147,1793-1819) -> saveEditorMaskForSelectedClass (src/app.js:*) -> upsertAnnotationRecord (src/annotations/records.js:*) -> projectStore.saveMaskBlob (src/storage/projectStore.js:*)
- syncMaskToBackend (src/app.js:1439-1472) -> apiClient.saveMask (src/api/client.js:316-330) -> routeApi mask save (src/server/api.js:701-775) -> storage.writeMaskBuffer (src/server/storage.js:580-595)

### validated
- selectClassLabel (src/app.js:2661-2682) -> saveEditorMaskForSelectedClass (src/app.js:2706-2745) -> loadSelectedClassMaskIntoEditor (src/app.js:2747-2752) -> selectedClassMaskDataUrlForImage (src/app.js:3425-3451)
  - validation: `node --test tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- saveCurrentMask/submitCurrentImage/autosaveCurrentMask (src/app.js:1110-1136,1791-1800) -> saveEditorMaskForSelectedClass (src/app.js:2706-2745) -> upsertAnnotationRecord (src/annotations/records.js:45-60) -> projectStore.saveMaskBlob
  - validation: `node --test tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- syncMaskToBackend (src/app.js:1422-1461) -> apiClient.saveMask (src/api/client.js:316-330) -> routeApi mask save (src/server/api.js:724-768) -> storage.writeMaskBuffer (src/server/storage.js:580-590)
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`

### discarded
- full class-aware export/training-set conversion
  - reason: this slice keeps legacy export compatibility and only establishes per-class save/load.

## Validation Plan
- RED/GREEN targeted tests:
  - `node --test tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- Full harness:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`

## Progress Notes
- Starting from existing multi-class foundation: label schema, selector, selected color, and annotation record upsert exist.
- Added failing tests first for class-aware mask path/blob key, API payload fields, server manifest annotation upsert, and app controller hooks.
- Added deterministic `masks/<image>_class_<id>_<name>_mask.png` paths and `image::class_id` local blob keys.
- Save, submit, and autosave now upsert the selected label annotation while keeping legacy `current_mask_path` mirrored to the selected class.
- Label switching saves dirty/current class state, then loads the target class mask from local IndexedDB or server file.
- Previous-frame mask copy now resolves through the selected class mask lookup path.

## Closeout
- Validation passed:
  - `node --test tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
  - live HTTP health smoke on `http://127.0.0.1:4173`
- Code review:
  - No blocking issue found.
  - Confirmed saved masks remain binary grayscale and class color remains display-only.
  - Confirmed legacy `current_mask_path` remains populated for existing export compatibility.
  - Adjusted label switching so metadata-only existing masks are not overwritten by an unchanged empty editor; dirty zero-mask edits are still saved.
- Remaining risk:
  - Export/training-set metadata still uses the legacy single `current_mask_path` export path and needs the next class-aware export slice.
