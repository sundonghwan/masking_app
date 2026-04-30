# Task: 12-feature-implementation-batch

## Goal

- Implement the 12 remaining hardening and product features tracked in
  `docs/FEATURE_STATUS.md`.

## Scope

- Persistent users and sessions.
- User-directory-backed assignment targets.
- Server-first restore and sync reconciliation.
- Strict project identity and manifest fallback removal.
- Dashboard implementation.
- Magic-tool sensitivity controls.
- Project/dataset upload settings.
- Project/task/version storage hierarchy.
- Training set export across selected task versions.
- Improved Spacebar hold-to-camera-pan behavior.
- Feature status, harness run log, review, validation, commit, and push.

## Non-goals

- Database migration to SQL.
- Cloud object storage.
- External AI segmentation service.
- Multi-tenant production auth, invite, and password reset.
- Physical purge of deleted image files.

## Touched Areas

- `src/app.js`
- `src/editor/maskEditor.js`
- `src/api/client.js`
- `src/server/api.js`
- `src/server/storage.js`
- `src/server/auth.js`
- `src/config/runtimeDefaults.js`
- `src/dashboard/`
- `src/export/`
- `src/storage/`
- `tests/`
- `docs/FEATURE_STATUS.md`
- `docs/superpowers/plans/2026-04-30-12-feature-implementation-plan.md`

## Risks

- Existing flat project manifests may stop loading if migration/compatibility is
  too strict too early.
- Upload, mask save, review, export, and dashboard must all agree on the
  selected project/task/version context.
- Spacebar pan must not mutate mask bitmap or undo history.
- User directory must remove hardcoded assignment choices without blocking the
  local MVP login path.
- Training export must preserve traceability to project/task/version/image.

## Impact Chains

### suspected

- `AppController.handleShortcut (src/app.js:*) -> MaskEditor.setCameraPanOverride (src/editor/maskEditor.js:*) -> MaskEditor.handlePointerDown (src/editor/maskEditor.js:*)`
- `routeProject (src/server/api.js:*) -> storage.ensureProject (src/server/storage.js:*) -> storage.writeProjectManifest (src/server/storage.js:*)`
- `routeProject (src/server/api.js:*) -> storage.writeImageBuffer (src/server/storage.js:*) -> createImageRecord (src/export/exporter.js:*)`
- `routeImage (src/server/api.js:*) -> validateMaskContract (src/server/maskValidation.js:*) -> storage.writeMaskFromDataUrl (src/server/storage.js:*)`
- `exportProject (src/server/api.js:*) -> createExportSummaryJson (src/export/exporter.js:*) -> createZipBlob (src/export/zip.js:*)`
- `AppController.renderAssignmentControls (src/app.js:*) -> apiClient.listUsers (src/api/client.js:*) -> routeUsers (src/server/api.js:*)`
- `createDashboardSummary (src/dashboard/summary.js:*) -> AppController.renderDashboard (src/app.js:*)`
- `createTrainingSetZipEntries (src/export/trainingSet.js:*) -> exportTrainingSet (src/server/api.js:*) -> createZipBlob (src/export/zip.js:*)`

### validated

- Worker A: `handleShortcut (src/app.js:1546-1592) -> activateSpacePan (src/app.js:1599-1602) -> MaskEditor.setCameraPanOverride (src/editor/maskEditor.js:386-390)`
  - validation: `node --test --test-name-pattern "spacebar temporarily pans" tests/appContracts.test.js`
  - validation: `node --test tests/maskEditor.test.js`
- Worker A: `handleShortcutRelease/window blur/visibilitychange (src/app.js:321-325,1594-1607) -> MaskEditor.clearCameraPanOverride (src/editor/maskEditor.js:396-404)`
  - validation: `node --test --test-name-pattern "spacebar temporarily pans" tests/appContracts.test.js`
- Worker A: `MaskEditor.bindCanvasEvents pointerdown (src/editor/maskEditor.js:528-552) -> MaskEditor.beginCameraPan (src/editor/maskEditor.js:588-594) -> MaskEditor.updateCameraPan (src/editor/maskEditor.js:596-600) -> viewport offsets`
  - validation: `node --test tests/maskEditor.test.js`
- Worker A: `MaskEditor.bindCanvasEvents pointerdown (src/editor/maskEditor.js:528-552) -> paint/erase/magic branches -> mask bitmap/onChange/undo history`
  - validation: `node --test tests/maskEditor.test.js`
- Integration: `routeApi login/me/logout (src/server/api.js:*) -> createSessionStore/readSession/deleteSession (src/server/sessionStore.js:*)`
  - validation: `tests/sessionStore.test.js`; `tests/serverApi.test.js`; `scripts/harness/test-target.sh`
- Integration: `routeApi users (src/server/api.js:*) -> createUserDirectory.listUsers (src/server/userDirectory.js:*) -> renderAssignmentPanel (src/app.js:*)`
  - validation: `tests/userDirectory.test.js`; `tests/apiClient.test.js`; `tests/appContracts.test.js`; `scripts/harness/test-target.sh`
- Integration: `routeProject files (src/server/api.js:*) -> apiClient.getProjectFileBlob (src/api/client.js:*) -> restoreServerImageBlob/restoreServerMaskBlob (src/app.js:*)`
  - validation: `tests/apiClient.test.js`; `tests/serverApi.test.js`; `tests/appContracts.test.js`; `scripts/harness/test-target.sh`
- Integration: `createDashboardSummary (src/dashboard/summary.js:*) -> renderDashboard (src/app.js:*)`
  - validation: `tests/dashboardSummary.test.js`; `tests/appContracts.test.js`; `scripts/harness/test-target.sh`
- Integration: `createTrainingSetZipEntries (src/export/trainingSet.js:*) -> exportTrainingSet (src/server/api.js:*) -> createZipBlob (src/export/zip.js:*)`
  - validation: `tests/trainingSet.test.js`; `tests/apiClient.test.js`; `tests/serverApi.test.js`; `scripts/harness/test-target.sh`
- Integration: `normalizeUploadPolicy (src/upload/policy.js:*) -> routeProject upload validation (src/server/api.js:*)`
  - validation: `tests/serverApi.test.js`; `tests/uploadPolicy.test.js`; `scripts/harness/test-target.sh`

### discarded

- External AI segmentation integration.
  - reason: this batch keeps the AI-backed segmentation item as a tracked
    follow-up and implements local sensitivity controls first.

## Validation Plan

- `scripts/harness/lint-all.sh` -> syntax and lint coverage for touched modules.
- `scripts/harness/typecheck-all.sh` -> syntax/type-style project check.
- `scripts/harness/test-target.sh` -> unit and contract tests.
- `scripts/harness/smoke-web.sh` -> harness/design/app file smoke.
- Manual API/browser smoke if server remains available.
- Implementation code review after feature batch.

## Progress Notes

- 2026-04-30: Batch opened from user request to implement 12 items with
  parallel subagents where possible.
- 2026-04-30 Worker A: Started Lane A editor input UX implementation for
  `docs/SPACEBAR_CAMERA_PAN_DESIGN.md`. Scope is limited to
  `src/editor/maskEditor.js`, Spacebar wiring in `src/app.js`, and focused
  editor/app contract tests. Non-goal: storage/auth/API changes owned by other
  workers.
- 2026-04-30 Worker C: Started Lane C identity foundation implementation.
  Scope is limited to local-MVP user directory/session helpers, auth
  compatibility, runtime seed defaults, and focused auth/session tests.
- 2026-04-30 Worker C: Added red tests for user directory seeding, credential
  validation, role filtering, session create/read/delete, and session cleanup.
- 2026-04-30 Worker A: Added camera pan override state, pointer routing, cursor
  feedback, statusbar feedback, keyup/blur/visibility cleanup, and focused
  tests for no mask/onChange/undo mutation during Spacebar camera pan.
- 2026-04-30 Worker A: Validation passed for editor-focused tests, lint,
  typecheck, and `git diff --check`. Full `scripts/harness/test-target.sh`
  currently fails on parallel-lane files outside Worker A ownership:
  duplicate `MVP_USER_ACCOUNTS` in `src/config/runtimeDefaults.js`, one
  storage soft-delete expectation, and user/session-directory test modules.
- 2026-04-30 Integration: Resolved parallel-lane failures and completed
  user/session API wiring, assignment picker, dashboard screen, training set
  export, server-first binary restore, magic sensitivity controls, upload
  settings, strict project creation, feature status updates, and expanded
  lint/typecheck module coverage.
- 2026-04-30 Review fix: Full-batch review found two important issues:
  browser-side upload validation needed to persist and restore the active
  project upload policy, and image upload still implicitly created missing
  projects through `storage.ensureProject`. Both were fixed and covered by
  contract/server tests.

### Worker A Impact Chains

#### suspected

- `handleShortcut (src/app.js:1539-1585) -> activateSpacePan (src/app.js:*) -> MaskEditor.setCameraPanOverride (src/editor/maskEditor.js:*)`
- `handleShortcutRelease/window blur/visibilitychange (src/app.js:1587-1590) -> deactivateSpacePan (src/app.js:*) -> MaskEditor.clearCameraPanOverride (src/editor/maskEditor.js:*)`
- `MaskEditor.bindCanvasEvents pointerdown (src/editor/maskEditor.js:505-526) -> MaskEditor.beginCameraPan (src/editor/maskEditor.js:*) -> MaskEditor.updateCameraPan (src/editor/maskEditor.js:*) -> viewport offsets`
- `MaskEditor.bindCanvasEvents pointerdown (src/editor/maskEditor.js:505-526) -> paint/erase/magic branches -> mask bitmap/onChange/undo history`

### Worker C Impact Chains

#### suspected

- `validateMvpCredentials (src/server/auth.js:9-15) -> LOCAL_MVP_USER_ACCOUNTS (src/server/auth.js:3-7) -> publicMvpUser (src/config/runtimeDefaults.js:48-56)`
- `createUserDirectory (src/server/userDirectory.js:9-72) -> users.json (data/identity/users.json:*) -> listUsersByRole (src/server/userDirectory.js:37-39)`
- `createSessionStore (src/server/sessionStore.js:9-86) -> session file (data/identity/sessions/*.json:*) -> readSession/deleteSession/cleanupExpiredSessions (src/server/sessionStore.js:30-80)`

#### validated

- `validateMvpCredentials (src/server/auth.js:9-15) -> LOCAL_MVP_USER_ACCOUNTS (src/server/auth.js:3-7) -> publicMvpUser (src/config/runtimeDefaults.js:48-56)`
  - validation: `node --test tests/userDirectory.test.js tests/sessionStore.test.js`; `scripts/harness/test-target.sh`
- `createUserDirectory (src/server/userDirectory.js:9-72) -> users.json (data/identity/users.json:*) -> listUsersByRole (src/server/userDirectory.js:37-39)`
  - validation: `node --test tests/userDirectory.test.js tests/sessionStore.test.js`; `scripts/harness/test-target.sh`
- `createSessionStore (src/server/sessionStore.js:9-86) -> session file (data/identity/sessions/*.json:*) -> readSession/deleteSession/cleanupExpiredSessions (src/server/sessionStore.js:30-80)`
  - validation: `node --test tests/userDirectory.test.js tests/sessionStore.test.js`; `scripts/harness/test-target.sh`

## Findings

- Worker A: Review found no blocking issue in the editor input UX lane. The
  implementation keeps Spacebar pan separate from selected tool state, leaves
  permanent Pan tool behavior available, and does not call `onChange` or create
  undo history for camera pan gestures.
- Worker C: API already has in-memory session wiring in `src/server/api.js`;
  this lane keeps helper exports import-compatible and leaves broader API wiring
  for the integration lane.
- Worker C: Plain local-MVP seed passwords are kept in server-only
  `src/server/auth.js`, not browser-imported `src/config/runtimeDefaults.js`.
- Worker C review: no blocking issue found in lane diff. Checked that helper
  filesystem writes are explicit method calls, public user/session return values
  do not expose passwords, `validateMvpCredentials` remains synchronous, and no
  broad `src/server/api.js` wiring was added.
- Integration review found no blocking issue after the full batch validation.
  Remaining risk is product-level: task/version helper APIs exist, but the
  workbench still needs a dedicated task/version selector in the next batch.
- Follow-up implementation review found two important issues before closeout:
  active upload policy needed browser persistence/restore coverage, and upload
  to a missing project needed to return `404` before any file write. Both are
  fixed and validated.

## Worker C Closeout

- [x] User directory helper added and seeded from local MVP accounts.
- [x] Role-filter helper added for assignment picker integration.
- [x] Session store helper added with create/read/delete/cleanup helpers.
- [x] Existing `validateMvpCredentials` compatibility preserved.
- [x] Focused auth/session tests added.
- [x] `scripts/harness/test-target.sh` passed.
- [x] Commit skipped per Worker C instruction: do not commit or push.

## File-back Candidates

- Storage hierarchy playbook update if the task/version helper contracts remain
  stable after UI wiring.
- Frontend playbook update if Spacebar hold-to-pan remains the standard editor
  input contract after manual dataset smoke.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
