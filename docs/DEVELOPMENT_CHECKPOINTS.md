# Development Checkpoints

## Audience

Maintainers and coding agents deciding what to build next in Masking App.

## Objective

Keep development focused on the product intent: a reliable manual binary mask
dataset tool. This document defines the checkpoint before adding larger product
features and the recommended development order.

## Current Checkpoint

The app is currently a local-first MVP:

- Browser canvas editor creates masks.
- IndexedDB preserves local work.
- Node backend mirrors project/image/mask data to local filesystem storage.
- Server export is preferred only when valid exportable records have synced.
- Backend validation checks PNG signature, dimensions, 8-bit grayscale format,
  and binary mask pixels for non-interlaced 8-bit grayscale PNG masks.

## Checkpoint To Close Next

### MVP Data Contract Closed

This checkpoint is complete only when:

- invalid mask saves do not update `current_mask_path`
- invalid mask saves do not move an image to `submitted`
- backend metadata does not claim `mask_values_valid=true` unless pixels were
  actually decoded or otherwise trusted
- server ZIP file entries, `annotations.json`, and `export_summary.json` use the
  same exportable decision
- export includes only `submitted` or `approved` images with original image,
  mask file, matching dimensions, and passing known validation checks
- local-first sync behavior is documented as an MVP policy, not hidden as final
  architecture

## Recommended Development Order

### 1. Backend Mask Save Contract Harden

Goal: prevent invalid masks from corrupting durable project state.

Status: implemented for the dependency-free backend scaffold.

Implementation targets:

- `src/server/api.js`
- `src/server/maskValidation.js`
- `tests/serverApi.test.js` or an equivalent server API test file

Acceptance criteria:

- [x] invalid PNG signature returns `400`
- [x] dimension mismatch returns `422`
- [x] unsupported PNG mask format returns `422`
- [x] failed validation does not update `manifest.images[].current_mask_path`
- [x] failed validation does not update status to `submitted`
- [x] valid mask still updates current mask path and status
- [x] backend metadata records `mask_values_valid=true` only after binary pixel
  validation passes

Validation:

```bash
npm run lint
npm test
scripts/harness/smoke-web.sh
```

### 2. Export Policy Unification

Goal: make exported files and exported metadata describe the same dataset.

Status: implemented for the dependency-free backend scaffold.

Implementation targets:

- `src/export/exporter.js`
- `src/server/api.js`
- `tests/exporter.test.js`
- `tests/serverApi.test.js` or equivalent

Acceptance criteria:

- [x] `not_started` images are excluded from ZIP files and metadata
- [x] `in_progress` images are excluded from ZIP files and metadata
- [x] `submitted` images with valid masks are included in ZIP files and metadata
- [x] invalid or missing masks appear in `export_summary.json` exclusion reasons
- [x] ZIP `images/` and `masks/` entries match `annotations.json`

### 3. Sync Policy Clarification

Goal: keep local-first recovery explicit until the app is ready for review/admin
work.

Status: implemented for the current local-first MVP UI.

Current policy:

```text
IndexedDB = local work recovery
Backend filesystem = sync/export mirror
```

Do not implement server-first restore until one of these is true:

- review/admin screens are starting
- multiple operators need to share a project
- dataset export must be reproducible from server state alone

Current UI support:

- selected image shows project, original image, mask, and export sync status
- image list shows compact sync labels
- selected image sync can be retried manually
- export explains why local ZIP fallback was used

### 4. Upload Boundary Upgrade

Goal: remove JSON data URL limits when realistic dataset size requires it.

Current status:

- shared browser/server upload policy implemented in `src/upload/policy.js`
- browser rejects unsupported file type, extension, empty file, and oversized file before ingest
- browser uses `FormData` multipart upload for image sync
- server accepts multipart image uploads and JSON data URL uploads during transition
- server rejects invalid image uploads before image storage or manifest mutation
- server extracts uploaded image dimensions from the image payload and rejects
  client/server dimension mismatches
- full streaming upload remains the production target for very large datasets

Implementation targets:

- server upload parsing - multipart implemented, streaming remains future work
- image MIME and size checks
- server-side dimension extraction
- API client upload method

Acceptance criteria:

- [x] client dimensions are not trusted blindly
- [x] JSON data URL is no longer required for normal browser image upload
- [x] multipart uploads preserve binary image payloads
- [x] invalid image content is rejected before manifest update

### 4. Logging And Operational Visibility

Goal: make MVP runtime behavior debuggable before expanding operations features.

Status: implemented for the current server/frontend sync boundaries.

Reference:

- `docs/LOGGING.md`

Acceptance criteria:

- [x] backend API requests emit structured completion/failure logs
- [x] backend validation failures emit stable reason codes without payloads
- [x] frontend sync failures emit stable events and fallback path
- [x] logs do not include image/mask data URLs or raw bytes

### 5. Review Workflow MVP

Goal: support the reviewer role after the core mask lifecycle is reliable.

Status: first local-first review batch implemented.

Prerequisites:

- mask save contract is hardened
- export policy is unified
- sync policy is clear

Completed:

- [x] submitted status can be filtered in the workbench
- [x] approved and rejected status filters are available
- [x] submitted image can be approved
- [x] submitted image can be rejected with a required reason
- [x] rejected image can be moved back to rework
- [x] server rejects invalid review transitions before manifest mutation
- [x] approved-only export policy option
- [x] review history/audit records are retained in manifest
- [x] feature status is tracked in `docs/FEATURE_STATUS.md`
- [x] full backend PNG binary mask pixel validation is active
- [x] reviewer identity is explicit in local UI and review audit events
- [x] review detail hash route can reopen a selected review image
- [x] server rejects reviewer actions from worker role
- [x] admin can assign worker/reviewer ownership without changing mask status
- [x] bearer session login/logout/me endpoints are available
- [x] API client sends bearer tokens on protected requests
- [x] server project list rows can load a project manifest into the workbench

Remaining:

- None for the planned review/admin MVP batch.

Future hardening:

- [ ] persist session/account records beyond the current in-memory MVP session map
- [ ] restore server image/mask binaries into IndexedDB for full cross-device editing

### 6. Admin And Assignment MVP

Goal: make ownership explicit before project selection and multi-user restore.

Status: implemented at the bearer-session MVP boundary.
Current status: server-backed bearer sessions are implemented for the browser
client. Legacy `x-user-id` / `x-user-role` headers are no longer accepted as an
authorization fallback.

Completed:

- [x] frontend session panel sends bearer tokens after login
- [x] server RBAC checks protect upload, mask save, review, export, and assignment actions
- [x] admin assignment endpoint updates `worker_id`, `reviewer_id`, `assigned_by`, and `assigned_at`
- [x] assignment UI saves selected image worker/reviewer fields
- [x] frontend session panel can login/logout through server session endpoints
- [x] protected API calls send bearer tokens when a session exists
- [x] server project list selection restores project manifest state
- [x] assignment queues and per-user task list filters are available in the
  workbench image list

Remaining:

- None for this checkpoint.

Completed in the operations foundation batch:

- [x] ID/password login validates against MVP users on the server
- [x] browser-imported defaults do not expose MVP passwords
- [x] browser login no longer sends a selected role
- [x] browser role display is read-only and reflects the server-returned role
- [x] review actor identity is derived from the authenticated session
- [x] assignment audit `assigned_by` is derived from the authenticated session
- [x] remaining MVP defaults are centralized in `src/config/runtimeDefaults.js`

### 7. Hardcoded Runtime Debt Cleanup

Goal: remove MVP placeholder identities and default project assumptions only when
the replacement product workflows exist.

Status: documented as required follow-up work. Do not delete these defaults
blindly; each one currently covers a missing workflow.

Current hardcoded areas:

- `worker` and `reviewer` remain as default assignment targets until a user
  directory and dynamic assignment picker exist.
- `mask_project_001` and `Masking Project` remain only as fallback defaults for
  legacy/export/API callers that omit project identity. New app sessions now
  require explicit project create/open before entering the workbench.

Recommended development order:

1. MVP credential login with ID/password fields and server-owned roles.
2. Split `/login`, `/projects`, and `/workbench` so login is not embedded in the
   annotation tool area.
3. Project creation/opening flow before entering the workbench.
4. Role-aware workbench panels for `admin`, `worker`, and `reviewer`.
5. Assignment queues and per-user task list.
6. Submitted data edit/rework flow after submission.
7. Pan/camera movement while image is zoomed.
8. Magic-click assisted mask tool for local region selection.
9. Dashboard planning and design for project/role operational overview.

Acceptance criteria:

- [x] login form has ID and password fields
- [x] server rejects invalid ID/password pairs with `401`
- [x] server decides `role`; browser no longer chooses role during login
- [x] default actor IDs are not duplicated across HTML, app state, export, and server code
- [x] review and assignment actions use authenticated actor identity
- [x] login screen is separate from the annotation workbench UI
- [x] project selection/opening screen is separate from the annotation workbench UI
- [x] workbench hides or deprioritizes role-inappropriate panels
- [x] new users open or create a project instead of silently using `mask_project_001`
- [x] worker/reviewer users can filter the current project image list to their
  assigned queue

MVP accounts:

| Role | User ID | Password |
| --- | --- | --- |
| admin | `admin` | `admin123` |
| worker | `worker` | `worker123` |
| reviewer | `reviewer` | `reviewer123` |

### 8. Post-Submission Edit And Editor Assist

Goal: improve annotation correction speed without breaking review auditability or
mask/export contracts.

Status: implemented for the planned local editor-assist scope.

Requested improvements:

- submitted data can be opened for additional edits after submission
- zoomed images can be panned with camera movement
- clicking part of an image can invoke a magic-tool-like assisted mask action
- previous-frame masks can be copied and position-adjusted for sequential
  annotation work

Recommended development order:

1. Submitted data edit/rework flow.
2. Zoom-state pan/camera movement.
3. Magic-click assisted mask tool with deterministic local behavior first.
4. Previous-frame mask copy with a dedicated mask move adjustment tool.
5. Optional AI-backed segmentation integration only after the local tool contract
   is stable.

Implementation notes:

- Submitted edits must create an audit event so reviewers can tell that a
  submitted mask changed after the original submission.
- Re-editing a submitted or approved mask should define whether the status moves
  back to `in_progress`, `submitted`, or a new `revision_requested` state.
- Camera pan must be separate from mask drawing so zoomed navigation does not
  accidentally modify a mask.
- The first magic-click implementation should be local and predictable, such as
  connected-region or brush-fill assistance. Model-backed segmentation belongs
  in future hardening.

Acceptance criteria:

- [x] submitted image can enter an explicit edit/rework mode
- [x] post-submission edits are recorded in review/history metadata
- [x] export excludes or labels records whose submitted mask is being reworked
- [x] zoomed canvas supports pan without changing mask pixels
- [x] pan state resets or persists by a defined rule when switching images
- [x] magic-click action previews or applies a local mask region deterministically
- [x] magic-click changes can be undone before save
- [x] magic-click uses local edge-aware image processing rather than simple
  4-way color fill
- [x] Spacebar temporarily pans the canvas without switching the selected tool
- [x] previous-frame masks can be copied into the current frame for sequential
  annotation work
- [x] copied masks can be repositioned with a dedicated mask move tool without
  moving the camera

### 9. Dashboard Planning And Design

Goal: define an operational overview only after the core annotation, review, and
editor-assist flows are clearer.

Status: planned backlog item. Do not implement the dashboard before the
login/projects/workbench separation and the core task/review flows are stable.

Likely dashboard scope:

- project-level counts by status
- assignment workload by worker and reviewer
- export readiness and validation blockers
- recent review/revision activity
- links into the relevant project/workbench views

Non-goals for the first dashboard design:

- analytics warehouse
- billing or user administration
- production reporting charts
- multi-project executive dashboard

Acceptance criteria:

- [x] dashboard audience is defined: admin, reviewer lead, or operator
- [x] dashboard metrics map to existing manifest/export/review data
- [x] dashboard does not duplicate workbench editing controls
- [x] dashboard links users into actionable queues or project views

Design source:

- `docs/DASHBOARD_DESIGN.md`

### 10. Saved Training Set Management

Goal: package reviewed project/task/version outputs into durable dataset
snapshots before adding AI model serving or training workflows.

Status: implemented for local filesystem MVP operation.

Completed:

- [x] selected training sources can be saved as a named training set
- [x] saved training sets store source project/task/version traceability
- [x] deterministic train/val/test split metadata is generated from a seed
- [x] saved training sets can be listed and re-exported
- [x] admins can archive and restore saved training sets
- [x] duplicate training set IDs are rejected instead of silently overwriting

Remaining:

- Generic AI API serving contract/stub is implemented. Real model adapters remain parked until dataset packaging workflows are stable.
- Model-specific training/export presets can be added later if real training
  consumers need them.

### 11. Deployment Profile

Goal: make runtime mode, storage root, host/port, and AI serving flags explicit
without introducing a deployment platform.

Status: implemented for local/staging-style filesystem operation.

Completed:

- [x] server startup resolves a deployment profile from environment variables
- [x] `GET /api/health` exposes safe deployment and AI serving status
- [x] data root and public root are normalized before storage/server startup
- [x] invalid ports and unsupported mode strings fail fast

Runtime knobs:

```bash
PORT=4173
MASKING_APP_HOST=127.0.0.1
MASKING_APP_MODE=local
MASKING_APP_DATA_DIR=/tmp/masking-app-data
MASKING_APP_PUBLIC_ROOT=/path/to/masking_app
MASKING_APP_AI_SERVING=1
MASKING_APP_AI_TASKS=detection,segmentation,classification
```

### 12. Legacy Manifest Repair

Goal: recover old or malformed project manifests without silently mutating data.

Status: implemented as an admin-only preview/apply API.

Completed:

- [x] `POST /api/projects/:project_id/repair` previews normalized manifest output
- [x] `apply=true` writes the repaired manifest and appends repair history
- [x] non-admin users cannot run repair
- [x] invalid image records are dropped instead of preserved as broken entries
- [x] legacy camelCase fields are normalized into current snake_case fields

### 13. Generic AI API Serving Contract

Goal: reserve a model-agnostic API boundary for future detection, segmentation,
and classification without pretending a model is already integrated.

Status: implemented as a disabled-by-default stub contract.

Completed:

- [x] `GET /api/ai/capabilities` reports enabled tasks and output contracts
- [x] `POST /api/ai/infer` validates task and image payload shape
- [x] the stub response returns `202 accepted` with empty predictions and
  `model: null`
- [x] disabled deployments return `503` for inference
- [x] the browser API client exposes capability and inference methods

## Work To Avoid For Now

Do not start these before the MVP data contract checkpoint is closed:

- dashboard metrics
- DB migration
- multi-class masks
- COCO/RLE export

These are product-valid features, but they depend on reliable mask state,
status transitions, and export decisions.

## Standard Verification Bundle

Use the harness wrappers for every checkpoint-closing change:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
```

For backend/API work, also run a local API smoke while `npm run dev` is running:

```bash
curl -sS http://localhost:4173/api/health
```

Add route-specific API smoke commands to the task file when the change touches
project creation, image upload, mask save, or export.
