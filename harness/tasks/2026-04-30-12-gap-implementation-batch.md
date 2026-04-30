# Task: 12-gap-implementation-batch

## Goal

- Implement the 12 missing product/system planning gaps identified by product
  and system reviewers, starting with parallel-safe items first.

## Scope

- Workbench navigation back to dashboard/projects.
- Single-image soft remove/restore semantics.
- Image/project discovery improvements.
- Project/task/version route/state foundation.
- Review reason code foundation.
- Dashboard quality/productivity extensions.
- Server revision/conflict foundation if the version/state boundary is stable.
- Project settings, account admin, and training-set version source follow-up if
  the dependency chain is ready.

## Non-goals

- Physical file purge.
- Production database migration.
- Enterprise auth.
- AI segmentation model integration.

## Parallel Lane Plan

### Lane A: Workbench UX Navigation

- Owner: main agent.
- Files: `index.html`, `src/app.js`, `src/styles.css`, `tests/appContracts.test.js`.
- Items:
  1. Workbench -> dashboard navigation.
  2. Workbench -> projects navigation.

### Lane B: Single Image Soft Remove / Restore

- Owner: worker.
- Files: `src/server/api.js`, `src/server/storage.js`, `src/export/exporter.js`,
  `src/api/client.js`, focused tests.
- Items:
  3. Single-image soft remove API.
  4. Restore deleted image API.
  5. Exclude deleted images from list/export/dashboard by default.

### Lane C: Project/Task/Version Foundation

- Owner: worker.
- Files: `src/server/api.js`, `src/server/storage.js`, `src/api/client.js`,
  focused tests.
- Items:
  6. Task/version list/read/create API foundation.
  7. Legacy project route adapter toward `default_task/v1`.
  8. Client methods for task/version manifests.

### Lane D: Discovery UX

- Owner: worker.
- Files: `index.html`, `src/app.js`, `src/styles.css`, `tests/appContracts.test.js`.
- Items:
  9. Image search plus `not_started`/sync-needed filters.
  10. Project list full view/search instead of hard `slice(0, 4)`.

### Lane E: Review Quality Data

- Owner: worker if low-conflict after Lane A/D; otherwise main integration.
- Files: `index.html`, `src/app.js`, `src/review/policy.js`,
  `src/dashboard/summary.js`, focused tests.
- Items:
  11. Structured review reason codes.
  12. Dashboard quality/productivity metrics from structured review data.

## Deferred If Dependency Chain Is Not Stable

- Server revision/optimistic concurrency.
- Project settings edit UI/API.
- Account administration UI.
- Training set export switched fully to selected version source.

These are not dropped. They move to the next batch if the P0/P1 workflow
foundation takes the whole implementation budget.

## Risks

- `src/app.js` is shared by Lane A/D/E and likely to conflict.
- `src/server/api.js` is shared by Lane B/C and must be integrated carefully.
- Delete/restore is data-loss-adjacent. Use soft delete only.
- Version routing can over-expand if we try to migrate every old API at once.

## Impact Chain Closeout

### suspected

- `renderImageList (src/app.js:*) -> selectImage (src/app.js:*) -> routeToScreen (src/app.js:*)`
- `routeProject (src/server/api.js:*) -> storage.readProjectManifest/writeProjectManifest (src/server/storage.js:*) -> validateExportItem (src/export/exporter.js:*)`
- `routeProjectTasksVersions (src/server/api.js:*) -> storage.ensureVersionManifest (src/server/storage.js:*) -> apiClient task/version methods (src/api/client.js:*)`
- `reviewSelectedImage (src/app.js:*) -> applyReviewTransition (src/review/policy.js:*) -> createDashboardSummary (src/dashboard/summary.js:*)`

## Validation Plan

- Focused tests per lane.
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- Browser smoke for workbench navigation and dashboard/project return path.

## Progress Notes

- 2026-04-30: Opened batch after product/system reviewer brainstorming.
- 2026-04-30: Lane A completed workbench project/dashboard return buttons.
- 2026-04-30: Lane B completed metadata-only single-image soft remove/restore and active-image export filtering.
- 2026-04-30: Lane C completed project/task/version list/create/read API and client methods without migrating every legacy route.
- 2026-04-30: Lane D completed image/project search and operational image filters.
- 2026-04-30: Lane E completed structured rejection reason codes and dashboard review quality metrics.
- 2026-04-30: Browser dashboard smoke verified the dashboard cards render without the previous broken layout overlap.

## Impact Chains

### validated

- `routeToScreen (src/app.js:437-443) -> workbenchProjectsButton/workbenchDashboardButton handlers (src/app.js:328-329)`
  - validation: `tests/appContracts.test.js`, browser dashboard smoke.
- `toggleImageRemoval (src/app.js:1844-1888) -> apiClient.removeImage/restoreImage (src/api/client.js:278-304) -> routeImage (src/server/api.js:348-398) -> softDeleteProjectImage/restoreProjectImage (src/server/storage.js:450-536)`
  - validation: `tests/apiClient.test.js`, `tests/serverApi.test.js`, `tests/serverStorage.test.js`.
- `filterActiveImages (src/export/exporter.js:230-233) -> createAnnotationsJson/createExportSummaryJson (src/export/exporter.js:119-227)`
  - validation: `tests/exporter.test.js`, `scripts/harness/test-target.sh`.
- `routeProjectTaskCollection/routeProjectTaskVersionCollection (src/server/api.js:234-346) -> ensureTaskMetadata/ensureVersionManifest (src/server/storage.js:254-360) -> apiClient task/version methods (src/api/client.js:160-229)`
  - validation: `tests/serverApi.test.js`, `tests/serverStorage.test.js`, `tests/apiClient.test.js`.
- `renderImageList (src/app.js:1236-1334) -> activeImages/filterImageByQuery/hasSyncIssue (src/app.js:1120-1184)`
  - validation: `tests/appContracts.test.js`, browser dashboard smoke for no layout regression.
- `reviewSelectedImage (src/app.js:968-994) -> applyReviewTransition (src/review/policy.js:133-205) -> createDashboardSummary/createReviewQualityMetrics (src/dashboard/summary.js:19-272)`
  - validation: `tests/reviewPolicy.test.js`, `tests/dashboardSummary.test.js`.

### discarded

- `legacy project-only workbench routes -> full version-scoped editor migration`
  - reason: task/version primitives are in place, but full workbench migration is a larger next-batch feature.
- `soft delete -> physical file purge`
  - reason: user need is mistake recovery; physical purge is operational maintenance and remains deferred.

## Closeout

- Completed features: 12/12 planned batch items.
- Deferred features: version-scoped workbench selector, version clone/delete/restore UI, optimistic concurrency, project settings edit, account admin, version-source training export picker, physical purge.
- Review result: no blocking implementation issue found after diff inspection and full harness validation.
- Validation:
  - `node --test tests/appContracts.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Feature status updated in `docs/FEATURE_STATUS.md`.
