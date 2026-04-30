# Task: worker-c-api-contracts

## Goal

Implement API and client contracts for project settings, task/version mutation,
training source discovery, and narrow revision guards needed by remaining
feature work.

## Scope

- `src/api/client.js`
- non-user-admin portions of `src/server/api.js`
- `tests/apiClient.test.js`
- `tests/serverApi.test.js`

## Non-goals

- Frontend settings UI.
- User admin endpoints.
- Physical file purge.
- Storage-helper implementation outside injected or existing helper contracts.
- Commit or push.

## Risks

- Project settings affect upload validation and must stay admin-only.
- Version mutation routes may later map to filesystem helpers, so response
  shape should be stable now.
- Revision guard must remain narrow and must not break existing mutation tests.

## Impact Chains

### Suspected

- `updateProjectSettings (src/api/client.js:*) -> routeProject settings (src/server/api.js:*) -> storage.writeProjectManifest (src/server/api.js:*)`
- `cloneTaskVersion/deleteTaskVersion/restoreTaskVersion (src/api/client.js:*) -> routeTaskVersionAction (src/server/api.js:*) -> storage clone/soft-delete/restore helper or fallback manifest write`
- `listTrainingSources (src/api/client.js:*) -> listTrainingSources route (src/server/api.js:*) -> storage.listProjects/listProjectTasks/listTaskVersions`
- `if_match_revision request fields (src/api/client.js:*) -> assertRevisionMatch (src/server/api.js:*) -> mutation rejection with revision_conflict`

### Validated

- `updateProjectSettings (src/api/client.js:55-65) -> routeProject settings (src/server/api.js:193-223) -> storage.writeProjectManifest (src/server/api.js:213)`
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`
- `cloneTaskVersion/deleteTaskVersion/restoreTaskVersion (src/api/client.js:108-142) -> routeTaskVersions (src/server/api.js:436-493) -> storage clone/soft-delete/restore helper or fallback manifest write`
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`
- `listTrainingSources (src/api/client.js:143-145) -> listTrainingSources route (src/server/api.js:126-130) -> storage.listProjects/listProjectTasks/listTaskVersions`
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`
- `if_match_revision request fields (src/api/client.js:62,116,128,139) -> assertRevisionMatch (src/server/api.js:1030-1041) -> mutation rejection with revision_conflict`
  - validation: `node --test tests/apiClient.test.js tests/serverApi.test.js`

## Validation Plan

- Red tests first in `tests/apiClient.test.js` and `tests/serverApi.test.js`.
- `node --test tests/apiClient.test.js tests/serverApi.test.js`
- `node --check src/api/client.js src/server/api.js`

## Closeout

- Changed API/client contracts for project settings updates, version clone/delete/restore,
  training source discovery, and narrow revision conflicts.
- Server routes remain admin-only for settings and version mutations; training
  source discovery is reviewer/admin.
- Validation passed:
  - `node --test tests/apiClient.test.js tests/serverApi.test.js`
  - `node --check src/api/client.js src/server/api.js`
- Implementation review found no blocking issue in the Worker C scoped changes.
- Remaining risk: filesystem storage helpers for whole-version clone/delete/restore
  are still optional from this lane; the API calls injected helpers when present
  and otherwise falls back to manifest writes when `writeVersionManifest` exists.
- Feature status update was not changed because this worker was scoped to API
  contracts and the worktree has unrelated concurrent edits.
- Commit and push intentionally skipped per user instruction.
