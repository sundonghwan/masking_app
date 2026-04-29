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
- server rejects invalid JSON data URL uploads before image storage or manifest mutation
- server extracts uploaded image dimensions from the image payload and rejects
  client/server dimension mismatches
- full multipart or streaming upload remains the production target

Implementation targets:

- server upload parsing
- image MIME and size checks
- server-side dimension extraction
- API client upload method

Acceptance criteria:

- [x] client dimensions are not trusted blindly
- large file memory use is bounded
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

Remaining:

- [ ] real auth/session/RBAC beyond the local reviewer id

## Work To Avoid For Now

Do not start these before the MVP data contract checkpoint is closed:

- auth/RBAC
- dashboard metrics
- assignment workflow
- DB migration
- AI-assisted masks
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
