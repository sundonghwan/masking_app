# Task: project-management

## Goal

- Add project edit, archive, restore, and purge management for local MVP
  operations.

## Scope

- Project metadata edit API/UI.
- Project archive/restore API/UI.
- Physical purge for archived project folders.
- Project list filtering for active/deleted projects.
- Feature status and validation records.

## Non-goals

- Production identity provider.
- Database-backed project lifecycle.
- Cross-project migration tool.
- Bulk project deletion.

## Risks

- Project purge is destructive and must stay admin-only.
- Archived projects should not disappear forever; restore must be available
  before purge.
- Opening an archived project through stale UI state should be blocked.
- Existing flat project manifest compatibility must remain intact.

## Impact Chains

### suspected

- `project management UI (src/app.js:*) -> apiClient project lifecycle methods (src/api/client.js:*) -> routeProject lifecycle routes (src/server/api.js:*) -> storage project lifecycle helpers (src/server/storage.js:*)`
- `renderProjectSummaries (src/app.js:*) -> apiClient.listProjects (src/api/client.js:*) -> route GET /api/projects (src/server/api.js:*) -> storage.listProjects (src/server/storage.js:*)`
- `updateProject settings route (src/server/api.js:*) -> storage.writeProjectManifest (src/server/storage.js:*) -> project summary render (src/app.js:*)`

## Validation Plan

- `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes

- 2026-04-30: User confirmed project delete/edit is required. Design chosen:
  metadata edit plus archive/restore/purge instead of immediate delete.
- 2026-04-30: Added storage helpers, admin API routes, client methods, project
  list UI actions, workbench project metadata fields, and design/status docs.

## Impact Chains

### validated

- `renderProjectSummaries (src/app.js:1774-1835) -> edit/archive/restore/purge project handlers (src/app.js:2081-2164) -> apiClient project lifecycle methods (src/api/client.js:43-117) -> routeProject lifecycle routes (src/server/api.js:159-251) -> storage archive/restore/purge helpers (src/server/storage.js:82-117)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`, `tests/serverStorage.test.js`.
- `renderProjectSettingsPanel (src/app.js:2402-2429) -> saveProjectSettings (src/app.js:830-867) -> apiClient.updateProjectSettings (src/api/client.js:81-93) -> routeProject settings (src/server/api.js:257-295) -> storage.writeProjectManifest (src/server/storage.js:55-66)`
  - validation: `tests/appContracts.test.js`, `tests/apiClient.test.js`, `tests/serverApi.test.js`.

### discarded

- `immediate project physical delete`
  - reason: archive/restore first is safer for local filesystem MVP operation.

## Closeout

- Review result: no blocking issue found. Purge stays admin-only and requires archived project state.
- Validation:
  - `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js` passed, 93 tests.
  - `node --test tests/appContracts.test.js tests/apiClient.test.js tests/serverApi.test.js tests/serverStorage.test.js` passed, 118 tests.
  - `scripts/harness/lint-all.sh` passed.
  - `scripts/harness/typecheck-all.sh` passed.
  - `scripts/harness/test-target.sh` passed, 198 tests.
  - `scripts/harness/smoke-web.sh` passed.
  - `git diff --check` passed.
  - Live server smoke passed: health, admin archived project list, reviewer archived list forbidden, and index HEAD.
