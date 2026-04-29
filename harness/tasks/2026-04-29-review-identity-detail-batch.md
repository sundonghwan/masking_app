# Task: review-identity-detail-batch

## Goal
- Reduce review-operation risk by making reviewer identity and review detail navigation explicit.

## Scope
- Local reviewer identity field persisted with the project snapshot.
- Review transition validation requires a reviewer id and records it in review events.
- Hash-based review detail route selects a specific image for review.

## Non-goals
- Real login/session management.
- Server-side RBAC or protected routes.
- Admin assignment workflow.
- Dedicated multi-page frontend framework.

## Touched areas
- `index.html`
- `src/app.js`
- `src/review/policy.js`
- `src/styles.css`
- `tests/reviewPolicy.test.js`
- `tests/serverApi.test.js`
- `docs/FEATURE_STATUS.md`

## Risks
- Review actions without identity could create unusable audit records.
- Hash route changes can fight normal image selection if not guarded.
- Retrying unsynced review events must preserve the original reviewer id.

## Impact Chains
### suspected
- reviewSelectedImage (src/app.js:597-655) -> applyReviewTransition (src/review/policy.js:52-93) -> apiClient.reviewImage (src/api/client.js:52-66)
- routeImage.review (src/server/api.js:199-239) -> applyReviewTransition (src/review/policy.js:52-93) -> writeProjectManifest (src/server/storage.js)
- applyRouteFromHash (src/app.js:1060-1067) -> selectImage (src/app.js:281-299) -> renderReviewPanel (src/app.js:827-858)

### validated
- reviewSelectedImage (src/app.js:597-655) -> applyReviewTransition (src/review/policy.js:52-93) -> apiClient.reviewImage (src/api/client.js:52-66)
- routeImage.review (src/server/api.js:199-239) -> applyReviewTransition (src/review/policy.js:52-93) -> writeProjectManifest (src/server/storage.js)
- applyRouteFromHash (src/app.js:1060-1067) -> selectImage (src/app.js:281-299) -> renderReviewPanel (src/app.js:827-858)

### discarded
- protected-route auth/session flow
  - reason: real auth remains outside this MVP batch.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- HTML smoke for reviewer identity and review route controls.

## Implementation Review
- Finding: no blocking issue in the review identity/detail batch.
- Checked that review buttons are disabled when reviewer id is empty and the shared policy also rejects missing reviewer id.
- Checked that retrying an unsynced review sends `image.reviewer_id` first, preserving the actor from the local transition.
- Checked that hash routing uses `replaceState` on normal selection and `selectImage(..., { updateRoute: false })` on hash changes to avoid route-update loops.
- Remaining risk: this is still local identity, not real authentication or authorization.

## Completed Features
- Local reviewer identity field.
- Required reviewer ID in review audit events.
- Hash-based review detail route.

## Remaining Work
- Real auth/session/RBAC.
- Admin assignment workflow.
- Multipart/streaming upload.

## Closeout
- `npm run lint` passed.
- `npm test` passed, 86 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed, 86 tests.
- `scripts/harness/smoke-web.sh` passed.
- Server HTML smoke passed with `reviewerId`, `reviewerIdentitySummary`, `reviewDetailLink`, and `#/review` present.
- Server app JS smoke passed with `getReviewImageIdFromHash`, `updateReviewRoute`, `normalizeReviewerId`, and `reviewerId` present.
- `GET /api/health` passed.
