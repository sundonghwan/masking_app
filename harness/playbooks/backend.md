# Backend Playbook

## Audience

Agents changing APIs, validation, file storage, mask persistence, or export.

## Current State

The MVP backend is a dependency-free Node HTTP server in `server.js`.
Backend architecture is defined in `docs/ARCHITECTURE.md`.
Development order and checkpoint gates are defined in
`docs/DEVELOPMENT_CHECKPOINTS.md`.
Runtime logging rules are defined in `docs/LOGGING.md`.

## Current Responsibilities

Backend currently owns local filesystem state and the first server-side dataset
correctness checks:

- project records
- image upload from JSON data URLs
- immutable original image storage
- mask PNG save/load
- validation of PNG header, dimensions, 8-bit grayscale mask format, decoded
  pixels, and non-empty binary `0/255` mask values for supported
  non-interlaced PNG masks
- export ZIP generation

## Runtime Logging

Backend changes should emit structured events through
`src/observability/logger.js`.

Required event families:

- `api.request.completed`
- `api.request.failed`
- `mask.validation.failed`
- `mask.save.completed`
- `export.completed`
- `export.failed` when export failures are handled locally

Never log image/mask data URLs, raw bytes, or request bodies.

## Current API Contract

Implemented MVP endpoints:

```http
POST /api/projects
GET /api/projects/{project_id}
POST /api/projects/{project_id}/images
PUT /api/images/{image_id}/mask
GET /api/projects/{project_id}/export
```

Uploads currently use JSON payloads:

```text
data_url: data:image/...;base64,...
file_name: original filename
width: image width
height: image height
status: in_progress | submitted, for masks
```

Future production upload work should replace JSON data URLs with
`multipart/form-data` or streaming upload handling.

## File Contract

Original images are immutable after upload.

Mask files:

- PNG
- same width and height as original image
- 8-bit grayscale PNG at the backend boundary
- binary grayscale values only: `0` and `255`; the backend decodes supported
  non-interlaced PNG IDAT data and rejects non-binary or empty masks

Export archive:

```text
images/
masks/
annotations.json
export_summary.json
```

Archive metadata should use relative paths, not server absolute paths.

## Current Checkpoint

Before adding review/admin/auth/DB features, close the MVP data contract:

- invalid mask saves must not update `current_mask_path` - done
- invalid mask saves must not move an image to `submitted` - done
- backend metadata must only claim pixel validation for supported decoded PNG
  masks - done
- server ZIP files, `annotations.json`, and `export_summary.json` must use the
  same exportable decision - done

## Required Impact Chains

Use impact chains for:

- upload -> image metadata -> storage
- mask save -> validation -> current mask update
- export -> validation -> archive generation -> metadata generation

Example pattern:

```text
saveMask (src/api/masks.ts:1-1) -> validateMaskImage (src/domain/maskValidation.ts:1-1) -> writeMaskVersion (src/storage/maskStore.ts:1-1) -> updateImageCurrentMask (src/repositories/images.ts:1-1)
```

Line ranges are illustrative until source exists.

## Validation

Backend changes should prefer fixture-based checks:

- valid image + valid mask passes
- dimension mismatch fails
- invalid PNG format fails
- failed mask validation does not mutate manifest current mask/status
- missing mask is excluded from export
- export summary records exclusion reasons
- ZIP file entries match annotations exportable records
- `GET /api/health` works when `npm run dev` is running

## Failure Signatures

When these appear, inspect the matching boundary first:

- exported mask has wrong size -> validation or serialization boundary
- `annotations.json` paths do not load -> export path generation
- submitted item has no current mask -> submit/save ordering
- original file changed after upload -> storage immutability breach
