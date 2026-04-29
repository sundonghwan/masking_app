# Task: mask-save-contract

## Goal

- Harden backend mask save so invalid masks cannot corrupt project manifest state
  or mark an image as submitted.

## Scope

- `src/server/api.js`
- `tests/serverApi.test.js`
- `harness/run_log.md`
- checkpoint docs if wording needs clarification

## Non-goals

- Multipart upload.
- Full PNG IDAT pixel decoding.
- Export policy unification. That remains the next checkpoint item.

## Touched Areas

- backend API route handling
- mask validation failure handling
- server API tests

## Risks

- Current implementation writes the mask file before checking validation.
- Invalid validation currently can still update `current_mask_path` and `status`.
- Backend metadata currently overstates `mask_values_valid` when binary pixels
  are not checked.

## Impact Chains

### suspected

- routeImage (src/server/api.js:73-106) -> writeMaskFromDataUrl (src/server/storage.js:75-96) -> validateMaskContract (src/server/maskValidation.js:64-126) -> writeProjectManifest (src/server/storage.js:39-50)

### validated

- routeImage (src/server/api.js:73-114) -> writeMaskFromDataUrl (src/server/storage.js:75-96) -> validateMaskContract (src/server/maskValidation.js:64-126) -> writeProjectManifest (src/server/storage.js:39-50)

### discarded

- exportProject policy chain
  - reason: export policy unification is the next separate checkpoint item.

## Validation Plan

- `node --test tests/serverApi.test.js`
- `npm run lint`
- `npm test`
- `scripts/harness/smoke-web.sh`
- API smoke on running dev server: invalid mask returns `400` and manifest
  remains unsubmitted

## Progress Notes

- Added direct `createApiRouter` tests for valid mask save, invalid PNG,
  dimension mismatch, and unsupported PNG format.
- Validation now returns `400` for invalid PNG headers and `422` for contract
  failures after a valid PNG header.
- Manifest update happens only after mask contract validation passes.
- Backend now records `mask_values_valid: null` and
  `mask_pixel_validation: "not_checked"` while full PNG pixel decode is not
  implemented.

## Findings

- This closes the mask save mutation risk, but export file-entry policy still
  needs the next checkpoint item.
- API smoke confirmed invalid PNG mask returns `400`; project manifest retained
  `current_mask_path: ""` and `status: "not_started"`.

## Closeout

- [x] Scope matched actual diff.
- [x] Invalid mask tests prove manifest remains unchanged.
- [x] Relevant commands were run or explicitly skipped with reason.
