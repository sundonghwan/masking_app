# Task: backend-validation-hardening-batch

## Goal
- Strengthen backend validation so durable manifest state no longer depends on
  client-provided image dimensions or header-only mask checks.

## Scope
- Server-side uploaded image dimension extraction.
- Client/server upload dimension mismatch rejection before storage mutation.
- Full backend binary pixel validation for non-interlaced 8-bit grayscale PNG
  masks.

## Non-goals
- Multipart or streaming upload.
- Binary pixel validation for non-PNG mask formats.
- Database-backed validation records.

## Touched areas
- `src/server/imageMetadata.js`
- `src/server/maskValidation.js`
- `src/server/api.js`
- `tests/imageMetadata.test.js`
- `tests/maskValidation.test.js`
- `tests/serverApi.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `docs/ARCHITECTURE.md`

## Risks
- Upload validation can accidentally trust stale client dimensions.
- PNG pixel decoding can accept header-only or malformed IDAT payloads.
- Existing smoke fixtures that used header-only PNG masks must be updated to
  real IDAT-bearing PNG masks.

## Impact Chains
### suspected
- routeProject image upload (src/server/api.js) -> parseImageMetadataFromDataUrl (src/server/imageMetadata.js) -> storage.writeImageFromDataUrl (src/server/storage.js)
- routeImage mask save (src/server/api.js) -> validateMaskContract (src/server/maskValidation.js) -> storage.writeProjectManifest (src/server/storage.js)
- validateMaskContract (src/server/maskValidation.js) -> validateBinaryMaskPixels (src/server/maskValidation.js)

### validated
- routeProject image upload (src/server/api.js) -> parseImageMetadataFromDataUrl (src/server/imageMetadata.js) -> storage.writeImageFromDataUrl (src/server/storage.js)
- routeImage mask save (src/server/api.js) -> validateMaskContract (src/server/maskValidation.js) -> storage.writeProjectManifest (src/server/storage.js)
- validateMaskContract (src/server/maskValidation.js) -> validateBinaryMaskPixels (src/server/maskValidation.js)

### discarded
- multipart upload parser
  - reason: this batch hardens JSON data URL validation only; streaming upload remains a separate boundary change.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- API smoke for upload dimension mismatch, binary mask save, and non-binary mask rejection.

## Implementation Review
- Reviewed upload mutation ordering: metadata extraction and client/server
  dimension comparison happen before `ensureProject` and image storage writes.
- Reviewed mask validation behavior: invalid pixel payloads fail before manifest
  update; existing storage still may contain an orphan rejected mask file because
  the current storage API writes before validation. This is acceptable for the
  dependency-free MVP because manifest state remains authoritative, but a future
  storage API can validate buffers before writing.
- Reviewed PNG decode scope: binary pixel validation supports non-interlaced
  8-bit grayscale PNG masks only, matching the current mask contract.
- No blocking issue found.

## Completed Features
- Server-side image dimension extraction.
- Upload dimension mismatch rejection.
- Full PNG binary mask pixel validation.

## Remaining Work
- Multipart/streaming upload.
- Trusted normalization for future non-PNG mask formats.

## Closeout
- `npm run lint` passed.
- `npm test` passed with 79 tests.
- `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`,
  `scripts/harness/test-target.sh`, and `scripts/harness/smoke-web.sh` passed.
- API smoke confirmed upload dimension mismatch returns `422` without creating
  a project manifest.
- API smoke confirmed valid binary mask save records `mask_values_valid=true`
  and `mask_pixel_validation=passed`.
- API smoke confirmed non-binary mask save returns `422` and leaves the
  manifest on the prior valid mask.
- `docs/FEATURE_STATUS.md`, `docs/DEVELOPMENT_CHECKPOINTS.md`, and
  `docs/ARCHITECTURE.md` updated.
