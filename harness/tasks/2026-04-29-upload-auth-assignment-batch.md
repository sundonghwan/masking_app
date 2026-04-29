# Task: upload-auth-assignment-batch

## Goal
- Finish the remaining operational MVP features before returning to project selection planning.

## Scope
- Multipart/FormData image upload path.
- Role-aware request headers and server RBAC checks.
- Admin assignment workflow for worker/reviewer ownership fields.

## Non-goals
- Cookie-backed login/session store.
- Password or OAuth authentication.
- Project switching/restore from the server project list.
- Database migrations.

## Touched areas
- `src/api/client.js`
- `src/app.js`
- `src/server/api.js`
- `src/server/httpUtils.js`
- `src/server/storage.js`
- `index.html`
- `src/styles.css`
- `tests/*.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Multipart parsing can corrupt binary image payloads if boundaries are handled incorrectly.
- RBAC enforcement can break existing local-first flows if default local role is too restrictive.
- Assignment updates must not overwrite image mask/review state.

## Impact Chains
### suspected
- syncUploadedImage (src/app.js:471-508) -> apiClient.uploadImage (src/api/client.js:27-51) -> routeProject.images (src/server/api.js:69-146) -> writeImageBuffer (src/server/storage.js:72-94)
- apiClient.reviewImage (src/api/client.js:65-77) -> requireRole (src/server/api.js:311-321) -> applyReviewTransition (src/review/policy.js:52-93)
- assignSelectedImage (src/app.js:745-808) -> apiClient.assignImage (src/api/client.js:79-91) -> routeImage.assignment (src/server/api.js:267-298) -> writeProjectManifest (src/server/storage.js)

### validated
- syncUploadedImage (src/app.js:471-508) -> apiClient.uploadImage (src/api/client.js:27-51) -> routeProject.images (src/server/api.js:69-146) -> writeImageBuffer (src/server/storage.js:72-94)
- apiClient.reviewImage (src/api/client.js:65-77) -> requireRole (src/server/api.js:311-321) -> applyReviewTransition (src/review/policy.js:52-93)
- assignSelectedImage (src/app.js:745-808) -> apiClient.assignImage (src/api/client.js:79-91) -> routeImage.assignment (src/server/api.js:267-298) -> writeProjectManifest (src/server/storage.js)

### discarded
- server project selection/restore
  - reason: user asked to defer project-selection planning until after the prior remaining features.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- server HTML/JS smoke for upload/auth/assignment controls.
- route-level API smoke where practical.

## Implementation Review
- Finding: no blocking issue in the upload/auth/assignment batch.
- Checked that normal browser image sync now sends multipart `FormData`, while JSON data URL upload remains accepted for compatibility.
- Checked that server RBAC blocks worker review actions before manifest mutation.
- Checked that assignment updates ownership fields without changing image status, current mask, review events, or export paths.
- Remaining risk: this is local role-header authorization, not a hard login/session store.

## Completed Features
- Multipart/FormData image upload.
- Role-aware API request headers and server RBAC checks.
- Admin image assignment workflow.

## Remaining Work
- Project selection/restore planning and implementation.
- Hard login/session store if this leaves the local-header MVP boundary.

## Closeout
- `npm run lint` passed.
- `npm test` passed, 90 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed, 90 tests.
- `scripts/harness/smoke-web.sh` passed.
- Server HTML smoke passed with `sessionUserId`, `sessionRole`, `assignmentWorkerId`, `assignmentReviewerId`, and `assignButton` present.
- Server app/client JS smoke passed with `assignSelectedImage`, `assignImage`, `FormData`, `x-user-role`, and `x-user-id` present.
- `GET /api/health` passed.
