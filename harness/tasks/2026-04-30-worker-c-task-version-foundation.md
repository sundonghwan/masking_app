# Task: worker-c-task-version-foundation

## Goal

- Add a minimal project/task/version API foundation over the existing storage
  hierarchy helpers.

## Scope

- Add storage list helpers for project tasks and task versions.
- Add task/version list/read/create API routes.
- Add matching browser API client methods.
- Keep legacy project-level project/image/mask/export routes working.
- Add focused storage, server API, and API client tests.

## Non-goals

- Convert `index.html` or `src/app.js` workbench behavior.
- Migrate legacy flat project data into the hierarchy.
- Add review, upload, or export behavior for version routes beyond listing and
  reading current version manifests.

## Touched Areas

- `src/server/api.js`
- `src/server/storage.js`
- `src/api/client.js`
- `tests/serverApi.test.js`
- `tests/serverStorage.test.js`
- `tests/apiClient.test.js`
- `harness/tasks/2026-04-30-worker-c-task-version-foundation.md`
- `harness/run_log.md`

## Risks

- New nested routes could accidentally intercept legacy `/api/projects/{id}`
  routes or project image/export/file routes.
- Task/version creation could create inconsistent hierarchy metadata.
- Client and server route field names could drift.

## Impact Chains

### suspected

- `routeProject (src/server/api.js:*) -> storage.ensureTaskMetadata (src/server/storage.js:*) -> task.json`
- `routeProject (src/server/api.js:*) -> storage.ensureVersionManifest (src/server/storage.js:*) -> version manifest.json`
- `listProjectTasks/listTaskVersions (src/server/storage.js:*) -> routeProject task/version list routes (src/server/api.js:*) -> apiClient task/version methods (src/api/client.js:*)`
- `routeProject legacy branches (src/server/api.js:*) -> existing project/image/export/file routes`

### validated

- `listProjectTasks/listTaskVersions (src/server/storage.js:142-159,198-216) -> routeProject task/version list routes (src/server/api.js:280-358) -> apiClient task/version methods (src/api/client.js:55-95)`
  - validation: `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js` passed 77 tests, including
    `tests/serverStorage.test.js:337-370`, `tests/serverApi.test.js:903-949`,
    and `tests/apiClient.test.js:157-228`.
- `routeProject (src/server/api.js:280-358) -> storage.ensureTaskMetadata/ensureVersionManifest (src/server/storage.js:111-192) -> task.json/version manifest.json`
  - validation: `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js` passed create/read/list task and version API tests.
- `routeProject legacy branches (src/server/api.js:146-157,159-277) -> existing project/image/export/file routes`
  - validation: `tests/serverApi.test.js:951-961` passed legacy project manifest route guard in the focused test command.

### discarded

## Validation Plan

- Red first:
  - `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js`
- Focused green:
  - `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js`
- Syntax:
  - `node --check src/server/storage.js`
  - `node --check src/server/api.js`
  - `node --check src/api/client.js`
- Harness:
  - `scripts/harness/test-target.sh`
  - `git diff --check`
- Review final diff against `harness/checklists/review.md`.

## Progress Notes

- 2026-04-30: Started Worker C task/version foundation lane.
- 2026-04-30: Added red tests for storage summaries, task/version routes,
  client methods, and legacy project route preservation.
- 2026-04-30: Added storage list helpers, nested task/version API routes, and
  apiClient task/version methods without touching the workbench UI.

## Validation Results

- `node --test tests/serverStorage.test.js tests/serverApi.test.js tests/apiClient.test.js`: red first with 5 expected failures for missing storage/API/client surfaces; later passed 77/77 tests.
- `node --check src/server/storage.js`: passed.
- `node --check src/server/api.js`: passed.
- `node --check src/api/client.js`: passed.
- `scripts/harness/lint-all.sh`: passed.
- `scripts/harness/typecheck-all.sh`: passed.
- `git diff --check`: passed.
- `scripts/harness/test-target.sh`: initially passed 174/174 before concurrent worker changes; after later external edits it failed 175/176 on `tests/appContracts.test.js` (`discovery controls expose image search and operational filters`) because `src/app.js` does not contain the expected Korean label `이미지 검색`. `src/app.js` and that discovery UX work are outside Worker C scope.

## Review Findings

- No blocking Worker C issue found in the final diff review.
- Remaining risk: task/version create routes are intentionally minimal and do
  not yet migrate or reconcile legacy flat project image data into version
  manifests.

## Closeout

- [x] Scope matched Lane C files, except required harness task/run-log notes.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant focused checks were run.
- [x] Full harness test failure recorded as outside Worker C scope.
- [x] No commit or push, per user request.
