# Masking App Architecture

## Audience

Maintainers and coding agents changing the Masking App product, frontend editor,
backend API, storage, validation, or export behavior.

## Objective

Keep the product intent, current MVP architecture, target architecture, and
development checkpoints separate so implementation work does not drift into
overbuilt infrastructure before the mask dataset contract is reliable.

## 1. Product Intent

Source of truth: `PROJECT.md`.

Masking App is a browser-based annotation tool for creating binary mask datasets.
The core user is a data worker who uploads images, opens an image in a canvas,
paints or erases a mask with a brush, saves the mask, submits completed work, and
exports original images plus mask PNGs and metadata.

The MVP must optimize for:

- fast manual mask editing
- reliable binary mask output
- original image and mask path consistency
- recoverable local work
- export files that can be trusted by downstream training pipelines

The MVP intentionally does not optimize yet for:

- enterprise auth
- multi-user assignment
- reviewer approval workflow
- dashboard analytics
- AI-assisted segmentation
- multi-class masks
- COCO or RLE export

## 2. Current MVP Architecture

Current implementation is a dependency-free web app served by Node's built-in
HTTP server. Docker Compose now runs the app with PostgreSQL metadata storage
and MinIO object storage by default. Host-native filesystem storage remains
available as an explicit local recovery mode.

```text
Browser App
  -> Canvas mask editor
  -> IndexedDB local recovery
  -> API client for backend sync

Node HTTP Server
  -> Static file serving
  -> Project/image/mask/export APIs
  -> Object-db runtime storage in Docker Compose
  -> Filesystem recovery storage for host-native local mode
  -> PNG header/dimension/format validation
  -> ZIP export generation

PostgreSQL
  -> Project/task/version/image/annotation/review metadata

MinIO
  -> Original image bytes
  -> Class-specific binary mask PNG bytes
```

### Current Code Map

| Path | Current responsibility |
| --- | --- |
| `server.js` | Node HTTP server, static file serving, `/api/*` routing |
| `src/app.js` | Browser app controller, UI state, local persistence, backend sync |
| `src/api/client.js` | Browser API client for backend project/image/mask/export calls |
| `src/editor/maskEditor.js` | Canvas rendering, brush/erase, viewport, undo/redo, mask export |
| `src/export/exporter.js` | Project/image records, export validation, annotations and summary JSON |
| `src/export/zip.js` | Dependency-free ZIP writer |
| `src/storage/projectStore.js` | IndexedDB or memory fallback for local recovery |
| `src/server/api.js` | Backend API routes |
| `src/server/storage.js` | Filesystem recovery storage and archive-relative file handling |
| `src/server/objectDbStorage.js` | PostgreSQL metadata and MinIO object runtime adapter |
| `src/server/metadataDb.js` | Metadata DB configuration, migrations, and health verification |
| `src/server/objectStorage.js` | MinIO/S3-compatible object storage configuration and bucket verification |
| `src/server/maskValidation.js` | PNG header parsing and mask contract checks |

### Current Runtime Flow

```text
User uploads images
  -> browser creates image records
  -> browser stores image blobs in IndexedDB
  -> browser attempts backend image sync with JSON data URL

User paints mask
  -> MaskEditor mutates local mask bitmap
  -> autosave exports mask PNG from canvas
  -> browser stores mask blob/data URL in IndexedDB
  -> browser attempts backend mask sync

User submits image
  -> browser exports latest mask PNG
  -> browser marks local status submitted
  -> browser attempts backend mask sync with status=submitted

User exports project
  -> if all exportable images are backend-synced, use server ZIP
  -> otherwise fall back to local ZIP from IndexedDB blobs
```

### Current Source Of Truth Policy

This slice is **server-runtime first with local recovery**:

- IndexedDB remains the browser-side recovery source for unsynced local work.
- In Docker Compose, PostgreSQL is the source of truth for queryable project,
  image, annotation, review, and deletion metadata.
- In Docker Compose, MinIO is the source of truth for original image bytes and
  class-specific binary mask PNG bytes.
- Host-native filesystem storage remains available for local recovery,
  fixtures, backup inspection, and emergency repair.
- Backend export is preferred when image and mask sync flags indicate the
  exportable records are present on the active server storage backend.

This is a deliberate intermediate policy: object-db is the shared runtime path,
while local recovery remains available until final target-host evidence proves
all critical export/training-set paths.

### Current Operational Logging

Runtime logging follows `docs/LOGGING.md`.

Current structured events include:

- `api.request.completed`
- `api.request.failed`
- `mask.validation.failed`
- `mask.save.completed`
- `export.completed`
- `sync.project.failed`
- `sync.image.failed`
- `sync.mask.failed`
- `sync.export.fallback`

Logs must not include image or mask data URLs, raw bytes, browser object URLs, or
large request bodies.

## 3. Current Contracts And Limits

### Mask Contract

The product-level mask contract remains:

- one original image maps to one mask image in MVP
- mask format is PNG
- mask dimensions must match the original image
- final semantic values are binary: `0` background and `255` masked area

Current enforcement is split:

| Boundary | Current enforcement |
| --- | --- |
| Browser editor/export | Generates binary grayscale PNG from the canvas mask bitmap |
| Backend validation | Checks PNG signature/IHDR, dimensions, 8-bit grayscale format, and binary mask pixels |
| Backend pixel values | IDAT inflate/filter decode validates non-interlaced 8-bit grayscale masks as 0/255 and non-empty |

Do not record backend `mask_values_valid=true` unless backend pixel decode or
another trusted validation path confirms binary mask pixels.

### Planned Multi-Class Annotation Contract

The next product direction is **class-labeled binary masks**, not polygon
segmentation and not indexed masks as the editor source of truth.

Current foundation implemented:

- `src/annotations/labels.js` normalizes the default and manifest-provided label
  schema.
- `src/annotations/records.js` defines class-labeled binary mask annotation
  records.
- The workbench inspector exposes a visible class/label selector and persists
  the selected `class_id` in local project recovery.
- Project creation and project settings can persist user-defined
  `label_schema`; defaults are fallback values for legacy/empty manifests only.
- The selected label color drives the editor overlay and brush-panel color
  swatch as display state; saved masks remain binary grayscale PNGs.
- Mask save/load now upserts selected-class records into `image.annotations[]`
  with `class_id + class_name + mask_path`, stores local mask blobs by
  `image_id::class_id`, and keeps legacy `current_mask_path` mirrored to the
  currently selected class for existing export compatibility.
- `annotations.json`, project ZIP export, and training-set manifests now prefer
  `image.annotations[]` when present, emitting one export/training item per
  class annotation with `annotation_id`, `class_id`, `class_name`, and the
  annotation-specific binary mask path while preserving legacy single-mask
  output for old records.
- Browser local fallback ZIP export preserves `image.annotations[]` and loads
  class-specific local mask blobs by `image_id::class_id`, so incomplete server
  sync does not collapse a multi-class image back to the selected legacy mask.
- AI segmentation import is contract-ready: the API advertises
  `predictions[].class_id + predictions[].mask_data_url`, the workbench sends
  allowed class IDs, validates returned predictions against the project label
  schema, and imports valid masks as editable draft annotations with
  `source=ai` and `score`.
- Server project ZIP export now derives optional `indexed_masks/*.png` files and
  `indexed_masks/indexed_masks.json` from class-labeled binary masks. The
  derived PNG uses 8-bit grayscale pixel values where `0` is background and
  positive pixel values are `class_id`; class overlaps use
  `higher_class_id_wins`. This is an export artifact only, not the editor or
  storage source of truth.

Still pending:

- Real AI model adapter integration remains optional; the current server still
  uses the provider-agnostic stub until a model is configured.

Target model:

```text
one image -> many annotations[]
one annotation -> class_id + binary mask PNG
model output -> predictions[].class_id + predictions[].mask_data_url
```

Rationale:

- polygon masks can lose internal holes and irregular pixel-level regions
- the current editor already produces reliable binary mask PNGs
- one binary mask per class preserves overlap and keeps editing simple
- indexed masks are derived during server export for training formats that
  require them

Target image shape:

```json
{
  "id": "image_001",
  "annotations": [
    {
      "annotation_id": "ann_image_001_class_1",
      "class_id": 1,
      "class_name": "crack",
      "mask_path": "masks/image_001_class_1_crack_mask.png",
      "mask_width": 1280,
      "mask_height": 720,
      "mask_ratio": 0.032,
      "source": "manual"
    }
  ]
}
```

Compatibility rule:

- legacy `current_mask_path`, `mask_data_url`, and `mask_ratio` remain readable
  during migration
- new class-aware save/export paths should prefer `annotations[]`
- legacy masks can be migrated into default `class_id=1`, `name=target`
- project ZIP export stores each original image once and writes one mask entry
  per class annotation
- training-set export uses one item per annotation so split files can pair each
  image path with the correct class-specific binary mask path

Implementation detail:

- the `MaskEditor` should remain a binary mask editor for the selected
  annotation
- selected label state lives in the app/workbench controller
- previous-frame mask copy should match annotations by `class_id`
- class overlap is allowed in raw multi-mask export

### Upload Contract

Current backend upload uses JSON data URLs:

```json
{
  "image_id": "image_0001",
  "file_name": "frame.png",
  "data_url": "data:image/png;base64,...",
  "width": 1920,
  "height": 1080
}
```

The browser and server share the same lightweight upload policy in
`src/upload/policy.js`: PNG, JPEG, BMP, and WEBP only, non-empty payloads, and
a 15 MB per-file limit. The server applies this policy before writing image
files or mutating the project manifest. It also extracts image dimensions from
the uploaded image payload and rejects client/server dimension mismatches before
storage writes.

This is acceptable for the dependency-free scaffold. The target production
boundary is multipart or streaming upload with server-side image dimension
extraction.

### Current API Surface

```http
GET  /api/health
POST /api/projects
GET  /api/projects/{project_id}
POST /api/projects/{project_id}/images
PUT  /api/images/{image_id}/mask
GET  /api/projects/{project_id}/export
```

### Current File Layout

Runtime data is written under `data/` by default and is ignored by Git.

```text
data/
  {project_id}/
    manifest.json
    images/
    masks/
    exports/
```

Export ZIP layout:

```text
images/
masks/
annotations.json
export_summary.json
```

Export metadata must use archive-relative paths, never absolute server paths.

The planned file-storage hierarchy is documented in
`docs/STORAGE_HIERARCHY_DESIGN.md`. It moves runtime storage toward
`projects/{project_id}/tasks/{task_id}/versions/{version_id}` while keeping the
current project-level layout compatible during migration.

## 4. Target Architecture After MVP

The target architecture keeps the same responsibility split but replaces the
temporary scaffold boundaries.

```text
Browser App
  -> canvas editor
  -> local unsaved/retry cache
  -> server-first project/image/status restore

Backend API
  -> multipart/streaming upload
  -> mask validation service
  -> project/image/mask/status/export APIs

Metadata Repository
  -> projects
  -> images
  -> mask versions
  -> review records
  -> export records

File/Object Storage
  -> immutable original images
  -> current masks
  -> mask versions
  -> export artifacts
```

### Target Changes

| Area | Current MVP | Target |
| --- | --- | --- |
| Metadata | `manifest.json` | SQLite/PostgreSQL-style repository |
| Upload | JSON data URLs | multipart or streaming upload |
| Local state | IndexedDB primary recovery | server-first restore plus local retry cache |
| Mask validation | header/dimension/format/pixel checks | trusted normalization for future mask formats |
| Mask history | current mask only | mask versions with source and validation status |
| Review | status values reserved only | approve/reject/revise workflow |
| Export records | response-only ZIP | durable export records and downloadable artifacts |

## 5. Development Checkpoint

Before adding review, dashboard, auth, DB, or AI assistance, close the current
MVP data contract.

### Checkpoint: MVP Data Contract Closed

Required outcomes:

- invalid mask saves do not update `current_mask_path` - implemented
- invalid mask saves do not move an image into `submitted` - implemented
- backend metadata only claims full pixel validation after binary pixel decode
  passes - implemented
- server ZIP entries, `annotations.json`, and `export_summary.json` use the same
  exportable decision - implemented
- exportable means `submitted` or `approved`, original exists, mask exists,
  dimensions match, and known validation checks pass - implemented
- local-first sync behavior is documented and visible enough for debugging

Recommended validation:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
```

Recommended API smoke while `npm run dev` is running:

```bash
curl -sS http://localhost:4173/api/health
curl -sS -X POST http://localhost:4173/api/projects \
  -H 'content-type: application/json' \
  -d '{"id":"api_smoke_project","name":"API Smoke"}'
```

## 6. Recommended Development Order

### 1. Backend Mask Save Contract Hardening

Goal: invalid masks must not corrupt the project manifest or submitted status.

Scope:

- reject invalid PNG signatures with `400`
- reject dimension mismatch and unsupported PNG format with `422`
- update manifest only after validation passes
- set `mask_values_valid=true` only when binary pixels pass backend validation

### 2. Export Policy Unification

Goal: ZIP files, `annotations.json`, and `export_summary.json` must agree on the
same exportable images.

Scope:

- share one exportable decision path between metadata and file entries
- exclude `not_started` and `in_progress` images from ZIP file entries
- include excluded image reasons in `export_summary.json`

### 3. Architecture And Sync Policy Cleanup

Goal: keep current local-first MVP and target server-first architecture distinct.

Scope:

- keep this document current
- document IndexedDB as local recovery and backend filesystem as sync/export
  mirror
- define the trigger for switching to server-first restore before review/admin
  work begins

### 4. Upload Boundary Upgrade

Goal: replace JSON data URLs once file size or production-like operation matters.

Scope:

- multipart or streaming upload
- server-side MIME and dimension extraction
- file size limits
- no trust in client-provided dimensions without verification

### 5. Review Workflow MVP

Goal: add reviewer approval only after the mask/export data contract is reliable.

Scope:

- submitted queue
- approve/reject actions
- reject reason
- rework after rejection
- optional export policy for approved-only datasets

## 7. Migration Triggers

| Trigger | Architecture move |
| --- | --- |
| Images become large or many uploads fail | Replace JSON data URL upload with multipart/streaming |
| More than one operator uses the same project | Move from local-first to server-first restore |
| Review/admin screens begin | Add DB-backed metadata and status transition rules |
| Audit or rollback is required | Add mask versions |
| Dataset consumers require stricter guarantees | Add trusted normalization for additional mask formats |
| Export artifacts must be reused later | Add export records and stored ZIP artifacts |

## 8. Open Questions

- What maximum image size must the first real dataset support?
- Are empty masks ever valid for this dataset type?
- Should MVP export include `submitted` only, or should it become
  `approved`-only once review exists?
- Is local-first operation a product requirement, or only a temporary scaffold?
