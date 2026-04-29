# Task: frontend-backend-sync

## Goal

- Connect the browser app to the Node backend API for project creation, image
  upload, mask save, and server ZIP export.

## Scope

- Browser API client.
- Frontend upload/mask save sync calls.
- Local IndexedDB fallback remains in place.
- Tests for API client request/response behavior.

## Non-goals

- Multipart uploads.
- Auth/session handling.
- Conflict resolution between multiple operators.
- Server-side listing into the frontend.

## Touched Areas

- `src/api/`
- `src/app.js`
- `package.json`
- `tests/`
- `harness/`

## Risks

- Backend sync failures must not destroy local annotation work.
- Export should not prefer server ZIP unless uploaded image and mask are synced.
- Data URLs can be large; this is still MVP-only until multipart upload exists.

## Impact Chains

### suspected

- handleFiles (src/app.js:143-166) -> apiClient.uploadImage (src/api/client.js:1-1) -> routeProject (src/server/api.js:41-65)
- autosaveCurrentMask (src/app.js:249-273) -> apiClient.saveMask (src/api/client.js:1-1) -> routeImage (src/server/api.js:70-100)
- exportProject (src/app.js:215-245) -> apiClient.downloadProjectExport (src/api/client.js:1-1) -> exportProject (src/server/api.js:105-137)

### validated

- handleFiles (src/app.js:145-171) -> syncUploadedImage (src/app.js:253-287) -> apiClient.uploadImage (src/api/client.js:22-33)
- autosaveCurrentMask (src/app.js:344-368) -> syncMaskToBackend (src/app.js:289-328) -> apiClient.saveMask (src/api/client.js:34-48)
- exportProject (src/app.js:219-252) -> apiClient.downloadProjectExport (src/api/client.js:49-57)

### discarded

- server project restore into frontend
  - reason: frontend restore remains IndexedDB-first in this slice.

## Validation Plan

- `npm run lint`
- `npm test`
- `scripts/harness/test-target.sh apiClient`
- `scripts/harness/smoke-web.sh`
- API health smoke on running dev server
- API project -> image -> mask -> export smoke on running dev server

## Progress Notes

- Added `src/api/client.js` as the browser-facing API boundary.
- Frontend keeps IndexedDB as the local source of recovery and uses backend sync
  opportunistically.
- Server ZIP export is used only when valid export images have both image and
  mask server sync flags.

## Findings

- Backend sync failures are intentionally treated as recoverable UI state: the
  local mask work remains saved and export falls back to the local ZIP path.
- API smoke confirmed project creation, image upload, mask save with PNG header
  validation, and ZIP export with a `200` response.

## Closeout

- [x] Scope matched actual diff.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
