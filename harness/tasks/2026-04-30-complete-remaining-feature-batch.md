# Task: complete-remaining-feature-batch

## Goal

- Complete every remaining feature listed in `docs/FEATURE_STATUS.md` rather than
  limiting the next batch to three items.

## Scope

- Version-scoped workbench selector and route/state wiring.
- Version clone/delete/restore UI on hierarchy primitives.
- Server revision / optimistic concurrency guard.
- Project settings edit UI/API for upload formats, limits, and magic presets.
- Account administration UI/API for local users.
- Training-set export source picker for selected project/task/version snapshots.
- Physical purge maintenance for soft-deleted files.
- Manifest repair/migration and server-first sync reconciliation hardening where
  required by the above flows.

## Non-goals

- Production database migration.
- Enterprise auth or external identity provider.
- AI model-backed segmentation beyond adapter placeholders unless local magic
  tool limits are revalidated with real data.

## Parallel Lane Plan

### Lane A: Storage Hierarchy Operations

- Owner: worker.
- Files: `src/server/storage.js`, `tests/serverStorage.test.js`.
- Items:
  - clone/delete/restore version manifests.
  - physical purge helpers for deleted project/version images.
  - manifest repair helpers if needed by hierarchy UI.

### Lane B: Account Administration

- Owner: worker.
- Files: `src/server/userDirectory.js`, `src/server/api.js`,
  `tests/userDirectory.test.js`, `tests/serverApi.test.js`, focused client tests
  only if needed.
- Items:
  - admin create/update/deactivate users.
  - password rotation/reset for local MVP users.
  - active-state role-filter behavior.

### Lane C: API Contracts For Settings/Versions/Export Sources

- Owner: worker.
- Files: `src/server/api.js`, `src/api/client.js`, focused tests.
- Items:
  - project settings update endpoint.
  - task/version clone/delete/restore endpoints.
  - training-source discovery endpoint if needed by UI.
  - revision field checks for save/review/assignment/delete where practical.

### Lane D: Frontend Integration

- Owner: main agent.
- Files: `index.html`, `src/app.js`, `src/styles.css`,
  `tests/appContracts.test.js`, `docs/FEATURE_STATUS.md`.
- Items:
  - task/version selector in workbench.
  - version clone/delete/restore controls.
  - project settings screen/panel.
  - account admin panel.
  - training-set export source picker.
  - remaining feature status closeout.

## Risks

- `src/app.js` is already large and central; keep changes surgical.
- `src/server/api.js` is shared by multiple lanes and requires final integration.
- Revision checks can break local-first recovery if enforced too broadly.
- Physical purge is destructive-adjacent; keep it explicit and admin-only.

## Impact Chains

### suspected

- `renderWorkbenchSelectors (src/app.js:*) -> loadSelectedVersion (src/app.js:*) -> apiClient task/version methods (src/api/client.js:*) -> routeTaskVersions (src/server/api.js:*) -> storage.readVersionManifest (src/server/storage.js:*)`
- `clone/delete/restoreVersion UI (src/app.js:*) -> apiClient version mutation (src/api/client.js:*) -> routeTaskVersions (src/server/api.js:*) -> storage clone/delete/restore helpers (src/server/storage.js:*)`
- `projectSettingsForm (src/app.js:*) -> apiClient.updateProjectSettings (src/api/client.js:*) -> routeProject settings (src/server/api.js:*) -> storage.writeProjectManifest/writeProjectMetadata (src/server/storage.js:*)`
- `accountAdminForm (src/app.js:*) -> apiClient user admin methods (src/api/client.js:*) -> routeUsers (src/server/api.js:*) -> userDirectory write helpers (src/server/userDirectory.js:*)`
- `trainingSourcePicker (src/app.js:*) -> apiClient source discovery/export (src/api/client.js:*) -> exportTrainingSet (src/server/api.js:*) -> createTrainingSetZipEntries (src/export/trainingSet.js:*)`
- `revision-aware mutation (src/app.js:*) -> API if_match_revision fields (src/server/api.js:*) -> manifest revision update (src/server/storage.js:*)`

## Validation Plan

- Focused lane tests.
- `node --test tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- Browser smoke for project -> workbench -> version selection -> settings/admin/export panels.

## Progress Notes

- 2026-04-30: Started full remaining-feature batch per user instruction.
- 2026-04-30: Worker A completed storage hierarchy operations for clone, version soft delete/restore, purge, and revision increments.
- 2026-04-30: Worker B completed local account admin directory helpers and admin API.
- 2026-04-30: Worker C completed project settings, version mutation, training source discovery, and revision guard API/client contracts.
- 2026-04-30: Main integration added workbench task/version controls, project settings panel, account admin panel, training source picker, and purge button.

## Impact Chains

### validated

- `renderVersionContext (src/app.js:1812-1839) -> refreshVersionContext/refreshVersionSummaries (src/app.js:619-673) -> apiClient task/version methods (src/api/client.js:100-174) -> routeTaskVersions (src/server/api.js:411-511) -> storage.readVersionManifest/cloneVersionManifest/softDeleteVersionManifest/restoreVersionManifest/purgeSoftDeletedVersionFiles (src/server/storage.js:218-360)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`, `tests/serverStorage.test.js`.
- `renderProjectSettingsPanel (src/app.js:2258-2275) -> saveProjectSettings (src/app.js:813-846) -> apiClient.updateProjectSettings (src/api/client.js:79-91) -> routeProject settings (src/server/api.js:193-226)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`.
- `renderAccountAdminPanel (src/app.js:2277-2310) -> saveAdminUser/deactivateAdminUser (src/app.js:848-910) -> apiClient.createUser/updateUser (src/api/client.js:51-75) -> route /api/users (src/server/api.js:91-117) -> userDirectory helpers (src/server/userDirectory.js:48-84)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`, `tests/userDirectory.test.js`.
- `renderTrainingSourcePicker (src/app.js:2216-2256) -> exportSelectedTrainingSet (src/app.js:1163-1182) -> apiClient.listTrainingSources/downloadTrainingSetExport (src/api/client.js:175-302) -> listTrainingSources/exportTrainingSet (src/server/api.js:1094-1148,1264-1343)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`.
- `assertRevisionMatch (src/server/api.js:1046-1057) -> updateProjectSettings/version mutation routes (src/server/api.js:193-226,436-503)`
  - validation: `tests/serverApi.test.js`.

### discarded

- `full database-backed auth/account system`
  - reason: local MVP scope uses filesystem `users.json`; production identity remains future deployment work.
- `AI segmentation model integration`
  - reason: current local edge-aware magic tool is still the active product path until real data shows limits.

## Closeout

- Completed remaining feature-status items except optional hardening: AI-backed segmentation adapter, deployment profile, and legacy repair tool expansion.
- Review result: no blocking issue found. One role-boundary issue was fixed before closeout: non-admin users now use a read-only task/version fallback instead of trying to create default task/version records.
- Validation:
  - `node --test tests/apiClient.test.js tests/serverApi.test.js tests/appContracts.test.js` passed, 92 tests.
  - `scripts/harness/lint-all.sh` passed.
  - `scripts/harness/typecheck-all.sh` passed.
  - `scripts/harness/test-target.sh` passed, 194 tests.
  - `scripts/harness/smoke-web.sh` passed.
  - `git diff --check` passed.
  - Live server smoke passed: `GET /api/health`, admin login, `GET /api/users`, `GET /api/projects`, `GET /api/training-sources`, and `HEAD /`.
- Server status: restarted with current code at `http://localhost:4173`.
