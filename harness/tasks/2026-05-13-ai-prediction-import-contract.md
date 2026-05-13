# Task: ai-prediction-import-contract

## Goal
- Let the workbench request segmentation predictions and import `class_id + mask_data_url` responses as draft class annotations.

## Scope
- AI serving segmentation output contract wording.
- Browser API request includes allowed class IDs.
- Workbench AI draft button and import status.
- Prediction validation before writing editor mask state.
- Annotation records preserve AI source/score metadata.

## Non-goals
- Real model adapter integration.
- Automatic approval of AI predictions.
- Indexed-mask generation.

## Risks
- AI predictions must not bypass normal manual correction/submission flow.
- Unknown or disabled `class_id` predictions must not mutate the selected image.
- Invalid mask payloads must not overwrite an existing manual mask.
- The generic API must remain provider/model agnostic.

## Impact Chains

### suspected
- requestAiDraftMask (src/app.js:1193-1242) -> apiClient.requestAiInference (src/api/client.js:133-149) -> createAiServingResponse (src/server/aiServing.js:25-89)
- importAiPredictionMask (src/app.js:1244-1274) -> editor.replaceMaskFromDataUrl (src/editor/maskEditor.js:*) -> saveEditorMaskForSelectedClass (src/app.js:2722-2760)
- saveEditorMaskForSelectedClass (src/app.js:2722-2760) -> upsertAnnotationRecord (src/annotations/records.js:*) -> syncMaskToBackend (src/app.js:1439-1474)

### validated
- requestAiDraftMask (src/app.js:1193-1242) -> apiClient.requestAiInference (src/api/client.js:133-149) -> createAiServingResponse (src/server/aiServing.js:25-89)
  - validation: `node --test tests/aiPredictions.test.js tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- importAiPredictionMask (src/app.js:1244-1274) -> editor.replaceMaskFromDataUrl (src/editor/maskEditor.js:*) -> saveEditorMaskForSelectedClass (src/app.js:2722-2760)
  - validation: `node --test tests/aiPredictions.test.js tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js`
- saveEditorMaskForSelectedClass (src/app.js:2722-2760) -> upsertAnnotationRecord (src/annotations/records.js:*) -> syncMaskToBackend (src/app.js:1439-1474)
  - validation: `node --test tests/annotationRecords.test.js tests/apiClient.test.js tests/serverApi.test.js`

### discarded
- model adapter execution
  - reason: this slice only fixes the import contract; adapter choice remains optional hardening.

## Validation Plan
- `node --test tests/aiPredictions.test.js tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js tests/annotationRecords.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Added `src/annotations/aiPredictions.js` to validate AI predictions before any editor mutation.
- Workbench now exposes an AI draft action for admin/worker roles.
- AI requests include project-enabled `allowed_class_ids`.
- Valid predictions are imported into the selected class annotation as `source=ai` with optional score, then continue through the normal save/sync/submission path.
- Server remains provider/model agnostic and still returns empty stub predictions until an adapter is configured.

## Closeout
- Targeted AI import contract tests passed.
- Full harness validation passed with 238 tests.
- Feature status and architecture docs updated.
- Code review found no blocking issue after checking that AI predictions remain draft annotations and unknown/disabled classes cannot mutate the selected image.
