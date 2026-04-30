# Task: training-set-management

## Goal

- Add saved training set management before AI serving work.

## Scope

- Training set design doc.
- Deterministic train/val/test split generation.
- Saved training set storage under `training_sets/`.
- API/client contracts for create/list/read/export/archive/restore.
- Workbench UI for creating and re-exporting saved training sets.
- Feature status and run log updates.

## Non-goals

- AI model serving.
- YOLO/COCO format presets.
- Training run tracking.
- Database migration.

## Risks

- Export source path traceability must remain intact.
- Saved training set export must read original source files without copying them.
- Split generation must be deterministic by seed.
- Archived training sets must not disappear permanently.

## Impact Chains

### suspected

- `createTrainingSetManifest (src/export/trainingSet.js:*) -> createTrainingSetZipEntries (src/export/trainingSet.js:*) -> exportTrainingSet/exportSavedTrainingSet (src/server/api.js:*)`
- `trainingSet UI (src/app.js:*) -> apiClient training set methods (src/api/client.js:*) -> routeTrainingSets (src/server/api.js:*) -> storage training set helpers (src/server/storage.js:*)`
- `readTrainingSourceFile (src/server/api.js:*) -> storage.readVersionFile/readProjectFile (src/server/storage.js:*)`

### validated

- `createTrainingSetManifest (src/export/trainingSet.js:3-79) -> createTrainingSetZipEntries (src/export/trainingSet.js:81-120) -> exportTrainingSet (src/server/api.js:1442-1473) -> exportSavedTrainingSet (src/server/api.js:1475-1514)`
  - validation: `node --test tests/trainingSet.test.js tests/serverApi.test.js`
- `refreshTrainingSets (src/app.js:877-892) -> createSavedTrainingSet (src/app.js:1240-1274) -> apiClient.createTrainingSet (src/api/client.js:212-226) -> createSavedTrainingSet (src/server/api.js:1343-1413) -> writeTrainingSetManifest (src/server/storage.js:666-679)`
  - validation: `node --test tests/appContracts.test.js tests/apiClient.test.js tests/serverApi.test.js tests/serverStorage.test.js`
- `renderTrainingSetPanel (src/app.js:2559-2578) -> exportSavedTrainingSet (src/app.js:1276-1286) -> apiClient.downloadTrainingSetExport (src/api/client.js:294-314) -> exportSavedTrainingSet (src/server/api.js:1475-1514) -> readTrainingSourceFile (src/server/api.js:1541-1553)`
  - validation: `node --test tests/appContracts.test.js tests/apiClient.test.js tests/serverApi.test.js`

### discarded

- `Generic AI API serving`
  - reason: explicitly parked by user; tracked as future work in `docs/FEATURE_STATUS.md`.

## Validation Plan

- `node --test tests/trainingSet.test.js tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes

- 2026-04-30: User directed AI work to stay parked and requested prerequisite
  feature development. Chosen prerequisite is saved training set management.
- 2026-04-30: Added duplicate ID conflict handling after implementation review
  found silent overwrite risk.

## Closeout

- Saved training set management completed: design doc, deterministic split,
  storage/API/client, workbench UI, tests, and feature status update.
- `docs/DEVELOPMENT_CHECKPOINTS.md` updated with saved training set checkpoint.
- AI/generic API serving remains parked as future work.
