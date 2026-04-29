# Task: review-workflow-batch

## Goal
- Add the first review workflow without introducing auth, DB, or assignment complexity.

## Scope
- Review status transition policy.
- Server review API for approve, reject, and rework.
- Frontend review panel and status filters.
- Feature status documentation for completed and remaining work.

## Non-goals
- Reviewer authentication or RBAC.
- Multi-user assignment workflow.
- Approved-only export policy toggle.
- Review history/audit table beyond manifest fields.

## Touched areas
- `src/review/policy.js`
- `src/server/api.js`
- `src/api/client.js`
- `src/app.js`
- `index.html`
- `src/styles.css`
- `tests/reviewPolicy.test.js`
- `tests/serverApi.test.js`
- `tests/apiClient.test.js`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks
- Invalid status transitions can corrupt review state.
- Local-first review state can temporarily drift from server manifest.
- Rejection reason can be lost if frontend/server field names diverge.

## Impact Chains
### suspected
- reviewSelectedImage (src/app.js) -> applyReviewTransition (src/review/policy.js) -> apiClient.reviewImage (src/api/client.js)
- routeImage review (src/server/api.js) -> applyReviewTransition (src/review/policy.js) -> storage.writeProjectManifest (src/server/storage.js)
- retrySelectedSync (src/app.js) -> syncReviewToBackend (src/app.js) -> apiClient.reviewImage (src/api/client.js)

### validated
- reviewSelectedImage (src/app.js) -> applyReviewTransition (src/review/policy.js) -> apiClient.reviewImage (src/api/client.js)
- routeImage review (src/server/api.js) -> applyReviewTransition (src/review/policy.js) -> storage.writeProjectManifest (src/server/storage.js)

### discarded
- auth permission chain
  - reason: review MVP is local single-operator scaffolding; RBAC remains explicitly out of scope.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- API smoke for project creation, image upload, mask submit, approve/reject/rework transition

## Implementation Review
- Code review found a frontend/server sync ordering risk: approving or rejecting
  before the submitted mask reached the server could make local review state
  drift from the server manifest. Fixed by requiring `server_mask_synced` before
  approve/reject and requiring synced rejected state before rework.
- No blocking issue remains in the reviewed diff.

## Completed Features
- Shared review transition policy.
- Server review API for approve, reject with required reason, and rejected-item
  rework.
- Frontend review panel with submitted/approved/rejected filters and review
  sync retry integration.

## Remaining Work
- Approved-only export policy option.
- Review history/audit records.
- Reviewer identity/auth once multi-user work starts.
- Separate review-detail route if reviewer workflow outgrows the workbench
  panel.

## Closeout
- `npm run lint` passed.
- `npm test` passed with 71 tests.
- `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`,
  `scripts/harness/test-target.sh`, and `scripts/harness/smoke-web.sh` passed.
- API smoke confirmed approve, reject, rework, manifest status readback, and
  invalid review transition rejection.
- `docs/DEVELOPMENT_CHECKPOINTS.md` updated with completed and remaining review
  workflow items.
