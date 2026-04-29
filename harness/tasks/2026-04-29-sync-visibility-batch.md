# Task: sync-visibility-batch

## Goal

- Complete a 3-feature batch for local-first sync operations:
  1. show sync status in the UI
  2. allow retrying selected image/mask sync
  3. explain server ZIP vs local ZIP export fallback

## Scope

- `index.html`
- `src/app.js`
- `src/styles.css`
- checkpoint and run-log documentation

## Non-goals

- Server-first restore.
- Background retry queue.
- Conflict resolution.
- Durable audit logs.

## Touched Areas

- frontend sync state rendering
- selected-image sync retry
- export fallback explanation
- local project snapshot fields

## Risks

- UI can imply server persistence when only local IndexedDB has data.
- Retry can fail silently if there is no original image blob or mask blob.
- Export fallback can be confusing if the user does not see why local ZIP was
  used.

## Impact Chains

### suspected

- renderSyncStatus (src/app.js:489-505) -> canUseServerExport (src/app.js:402-407) -> explainLocalExportFallback (src/app.js:607-613)
- retrySelectedSync (src/app.js:401-421) -> syncUploadedImage (src/app.js:313-345) -> syncMaskToBackend (src/app.js:347-381)
- exportProject (src/app.js:268-311) -> canUseServerExport (src/app.js:402-407) -> local ZIP fallback (src/app.js:284-310)

### validated

- renderSyncStatus (src/app.js:489-505) -> explainLocalExportFallback (src/app.js:607-613)
- retrySelectedSync (src/app.js:401-421) -> syncUploadedImage (src/app.js:313-345) -> syncMaskToBackend (src/app.js:347-381)
- exportProject (src/app.js:268-311) -> local/server export status fields

### discarded

- automatic background retry queue
  - reason: selected retry is enough for the current local-first MVP.

## Validation Plan

- `npm run lint`
- `npm test`
- `scripts/harness/smoke-web.sh`
- browser smoke at `http://localhost:4173`

## Progress Notes

- Added a right-panel server sync section.
- Image list now shows a compact sync label.
- Added selected-image sync retry button.
- Export now records whether server ZIP or local ZIP fallback was used and why.

## Findings

- This keeps the app local-first while exposing enough state for operators to
  understand server persistence and fallback behavior.
- Browser smoke confirmed the right-panel server sync section renders, the image
  list shows a compact sync label, and unsynced masks explain local ZIP fallback.

## Closeout

- [x] Three-feature batch completed.
- [x] Scope matched actual diff.
- [x] Lint/test/smoke passed before browser smoke.
- [x] Browser smoke confirmed sync UI visibility.
