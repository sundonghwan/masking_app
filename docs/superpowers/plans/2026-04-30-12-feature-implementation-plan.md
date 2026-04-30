# 12 Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining 12 product/hardening items in `docs/FEATURE_STATUS.md` as a validated, committed, pushed feature batch.

**Architecture:** Keep the dependency-free Node/browser architecture. Add pure helper modules first, then wire API and UI integration around stable contracts. Preserve compatibility with existing flat manifests while introducing project/task/version metadata so the runtime can migrate progressively instead of breaking local data.

**Tech Stack:** Browser ES modules, Node built-in HTTP server, Node test runner, filesystem storage, IndexedDB local recovery, existing harness validation scripts.

---

## Feature Batch

| ID | Feature | Implementation Strategy |
| --- | --- | --- |
| F01 | Persistent user directory | Add filesystem-backed user directory helper and replace credential constants at the server boundary. |
| F02 | Persistent sessions | Add filesystem-backed session store with token lookup/invalidation. |
| F03 | User-directory assignment picker | Add user list API and populate worker/reviewer selectors from active users. |
| F04 | Server-first restore and sync reconciliation | Restore image/mask binary URLs from server manifest when IndexedDB is missing blobs. |
| F05 | Strict project identity and manifest schema | Add explicit project/task/version defaults and compatibility migration, then stop creating new fallback records. |
| F06 | Dashboard screen | Add pure dashboard summary helper and screen rendering from existing project state. |
| F07 | Magic-tool sensitivity controls | Expose tolerance/edge/max region controls without changing selected tool semantics. |
| F08 | Project/dataset upload settings | Add project-level upload settings with global defaults and validation usage. |
| F09 | Project/task/version storage hierarchy | Add hierarchy path helpers, metadata files, version manifests, and compatibility reads. |
| F10 | Training set export | Export selected task/version outputs into a traceable training-set ZIP/metadata payload. |
| F11 | Spacebar camera pan | Implement hold-to-pan override that never selects the permanent pan tool. |
| F12 | Status/docs/review/commit/push | Update feature status, run checks, review implementation, commit, push. |

## Parallel Work Lanes

### Lane A: Editor Input UX

Owned files:

- `src/editor/maskEditor.js`
- `src/app.js` only for Spacebar shortcut wiring
- `tests/maskEditor.test.js`
- `tests/appContracts.test.js`

Tasks:

- [ ] Add failing tests for Spacebar camera override and no mask mutation.
- [ ] Rename/introduce explicit camera override state in the editor.
- [ ] Update pointerdown/pointermove/pointerup to route camera pan separately from paint/erase/magic.
- [ ] Update shortcut lifecycle to clear on keyup, blur, and visibility change.
- [ ] Run `scripts/harness/test-target.sh`.

### Lane B: Storage Hierarchy Foundation

Owned files:

- `src/server/storage.js`
- new `src/server/storageHierarchy.js`
- `tests/serverStorage.test.js`
- new focused storage hierarchy tests if useful

Tasks:

- [ ] Add path/schema helpers for `projects/{project_id}/tasks/{task_id}/versions/{version_id}`.
- [ ] Add compatibility reads for existing flat project manifests.
- [ ] Add project/task/version metadata creation helpers.
- [ ] Add soft delete/restore helper primitives without wiring destructive UI.
- [ ] Run `scripts/harness/test-target.sh`.

### Lane C: Identity Foundation

Owned files:

- `src/server/auth.js`
- new `src/server/userDirectory.js`
- new `src/server/sessionStore.js`
- `src/config/runtimeDefaults.js`
- auth/session tests

Tasks:

- [ ] Add filesystem-backed user directory seeded from current MVP accounts.
- [ ] Add filesystem-backed session store with create/read/delete/cleanup helpers.
- [ ] Keep password format simple and local-MVP appropriate; do not add external auth packages.
- [ ] Expose role-filter helper for assignment picker integration.
- [ ] Run `scripts/harness/test-target.sh`.

## Integration Sequence

### Task 1: Plan and Harness Record

- [x] Create `harness/tasks/2026-04-30-12-feature-implementation-batch.md`.
- [x] Create this implementation plan.
- [ ] Append start event to `harness/run_log.md`.

### Task 2: Parallel Foundation Work

- [ ] Dispatch Lane A, Lane B, and Lane C workers.
- [ ] Review their final file lists and test results.
- [ ] Integrate conflicts locally.

### Task 3: API Integration

Files:

- Modify `src/server/api.js`
- Modify `src/api/client.js`
- Modify `src/server/storage.js`

Steps:

- [ ] Wire persistent user directory into login and user listing.
- [ ] Wire persistent session store into login/logout/me and Bearer auth.
- [ ] Add `GET /api/users?role=worker|reviewer`.
- [ ] Add project/task/version context to project create, image upload, mask save, and export requests while accepting old clients.
- [ ] Add server binary restore endpoints or static-safe relative file URLs for images/masks.
- [ ] Add training export endpoint for selected task/version specs.
- [ ] Run `scripts/harness/test-target.sh`.

### Task 4: Frontend Integration

Files:

- Modify `src/app.js`
- Modify `index.html`
- Modify `src/styles.css`
- Modify `src/api/client.js`
- Create `src/dashboard/summary.js`
- Create `tests/dashboardSummary.test.js`

Steps:

- [ ] Add assignment target picker populated from user directory.
- [ ] Add dashboard screen after project selection and before workbench/export.
- [ ] Add magic sensitivity controls with default values matching editor defaults.
- [ ] Add project upload settings controls if project creation/edit screen supports them in this batch.
- [ ] Restore server image/mask blobs into IndexedDB when local blobs are missing.
- [ ] Run `scripts/harness/test-target.sh`.

### Task 5: Export and Storage Features

Files:

- Modify `src/export/exporter.js`
- Create `src/export/trainingSet.js`
- Modify `src/server/api.js`
- Modify `src/server/storage.js`
- Add export tests.

Steps:

- [ ] Generate traceable training-set metadata with project/task/version/image fields.
- [ ] Preserve relative paths only.
- [ ] Exclude deleted images and non-exportable masks.
- [ ] Add source version manifest to the export payload.
- [ ] Run `scripts/harness/test-target.sh`.

### Task 6: Hardcoded Debt Removal Pass

Files:

- Modify `docs/FEATURE_STATUS.md`
- Modify `src/config/runtimeDefaults.js`
- Modify `index.html`
- Modify API/client/export fallback callers where needed.

Steps:

- [ ] Remove hardcoded UI assignment option lists.
- [ ] Stop creating new `mask_project_001` records when project ID is missing; return validation error instead.
- [ ] Keep compatibility repair only at manifest read/migration boundaries.
- [ ] Move upload policy into project settings where implemented.
- [ ] Update remaining hardcoded debt table with only honest leftovers.

### Task 7: Validation, Review, Commit, Push

Commands:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
git diff --check
```

Steps:

- [ ] Run all commands above.
- [ ] Perform implementation code review against `harness/checklists/review.md`.
- [ ] Refresh validated impact chains in the task file.
- [ ] Update `harness/run_log.md`.
- [ ] Update `docs/FEATURE_STATUS.md` completed/remaining lists.
- [ ] Commit the batch.
- [ ] Push the branch.

## Known Scope Control

- External AI segmentation stays as a remaining product item unless local magic controls are insufficient after dataset testing.
- Physical purge of deleted files stays out of scope.
- SQL/database migration stays out of scope.
- Production-grade password reset/invite stays out of scope.
