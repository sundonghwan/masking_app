# Task: worker-b-single-image-soft-remove

## Goal

- Add legacy single-image soft remove and restore semantics using
  `deleted_at`, `deleted_by`, and `delete_reason`.

## Scope

- Legacy flat project manifest image records.
- Single-image API and client methods.
- Default export validation and project summary handling for deleted images.
- Focused server storage, server API, exporter, and API client tests.

## Non-goals

- Physical purge or moving files to trash.
- Broad project/task/version route migration.
- UI wiring outside the API client.
- Changes to hierarchical version storage semantics.

## Touched Areas

- `src/server/storage.js`
- `src/server/api.js`
- `src/export/exporter.js`
- `src/api/client.js`
- `tests/serverStorage.test.js`
- `tests/serverApi.test.js`
- `tests/exporter.test.js`
- `tests/apiClient.test.js`

## Risks

- Deleted images could still appear in exported annotations or ZIP files.
- Project list counters could include deleted images and mislead reviewers.
- Remove/restore could accidentally move or delete source files.
- Legacy flat manifests could become incompatible with existing image records.

## Impact Chains

### suspected

- `routeImage (src/server/api.js:*) -> storage.softDeleteProjectImage (src/server/storage.js:*) -> writeProjectManifest (src/server/storage.js:*)`
- `routeImage (src/server/api.js:*) -> storage.restoreProjectImage (src/server/storage.js:*) -> writeProjectManifest (src/server/storage.js:*)`
- `exportProject (src/server/api.js:*) -> createValidationSummary (src/export/exporter.js:*) -> createAnnotationsJson/createExportSummaryJson (src/export/exporter.js:*)`
- `listProjects (src/server/storage.js:*) -> createProjectSummary (src/server/storage.js:*)`
- `createMaskingApiClient.removeImage/restoreImage (src/api/client.js:*) -> routeImage (src/server/api.js:*)`

### validated

- `routeImage (src/server/api.js:276-315) -> updateProjectImageDeletion (src/server/api.js:672-720) -> storage.softDeleteProjectImage (src/server/storage.js:347-403)`
  - validation: `node --test --test-name-pattern "soft remove|soft deletes and restores legacy|deleted images are excluded|removes and restores images|project export writes files only|lists project summaries" tests/serverStorage.test.js tests/exporter.test.js tests/serverApi.test.js tests/apiClient.test.js`
- `routeImage (src/server/api.js:276-315) -> updateProjectImageDeletion (src/server/api.js:672-720) -> storage.restoreProjectImage (src/server/storage.js:347-403)`
  - validation: `node --test --test-name-pattern "soft remove|soft deletes and restores legacy|deleted images are excluded|removes and restores images|project export writes files only|lists project summaries" tests/serverStorage.test.js tests/exporter.test.js tests/serverApi.test.js tests/apiClient.test.js`
- `exportProject (src/server/api.js:722-746) -> filterActiveImages/createValidationSummary/createAnnotationsJson/createExportSummaryJson (src/export/exporter.js:82-108,159-221)`
  - validation: `node --test --test-name-pattern "deleted images are excluded|project export writes files only" tests/exporter.test.js tests/serverApi.test.js`
- `listProjects (src/server/storage.js:*) -> createProjectSummary (src/server/storage.js:646-654)`
  - validation: `node --test --test-name-pattern "lists project summaries" tests/serverStorage.test.js tests/serverApi.test.js`
- `createMaskingApiClient.removeImage/restoreImage (src/api/client.js:121-140) -> routeImage (src/server/api.js:276-315)`
  - validation: `node --test --test-name-pattern "removes and restores images" tests/apiClient.test.js`

### discarded

- Hierarchical version file trash movement.
  - reason: this lane is single-image legacy manifest soft delete only.

## Validation Plan

- `node --test tests/serverStorage.test.js tests/exporter.test.js tests/serverApi.test.js tests/apiClient.test.js` -> focused behavior coverage.
- `node --check src/server/storage.js src/server/api.js src/export/exporter.js src/api/client.js` -> syntax coverage for touched modules.
- `git diff --check` -> whitespace sanity.

## Progress Notes

- 2026-04-30: Started Worker B lane. Found pre-existing hierarchical
  version delete helpers that move files to `trash/`; this task intentionally
  keeps legacy single-image deletion metadata-only.
- 2026-04-30: Added red tests for legacy manifest soft delete/restore,
  single-image API remove/restore, client request shape, deleted-image export
  omission, and project summary counts.
- 2026-04-30: Implemented metadata-only legacy image soft delete and restore,
  default deleted-image filtering for export metadata, and active-image
  filtering for project summaries.
- 2026-04-30: Broad same-file test command
  `node --test tests/serverStorage.test.js tests/exporter.test.js tests/serverApi.test.js tests/apiClient.test.js`
  currently fails on pre-existing task/version route/list tests outside Lane B:
  `storage.listProjectTasks is not a function` and task/version API routes
  returning `404`. Those are intentionally outside this lane's non-goals.

## Findings

- Review found no blocking issue in the Worker B diff. The legacy
  single-image path updates only manifest metadata, keeps image/mask files in
  place, and does not alter hierarchical version trash semantics.

## File-back Candidates

- None yet.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
- [x] Commit skipped per Worker B instruction: do not commit or push.
