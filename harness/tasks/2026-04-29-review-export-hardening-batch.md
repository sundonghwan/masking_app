# Task: review-export-hardening-batch

## Goal
- Tighten review/export behavior before moving to larger project or admin flows.

## Scope
- Dedicated feature status document.
- Approved-only export policy option.
- Review history records in manifest.

## Non-goals
- Authenticated reviewer identity.
- Dedicated review page route.
- Database-backed audit table.

## Touched areas
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `src/export/exporter.js`
- `src/review/policy.js`
- `src/server/api.js`
- `src/api/client.js`
- `src/app.js`
- `index.html`
- `tests/exporter.test.js`
- `tests/reviewPolicy.test.js`
- `tests/serverApi.test.js`
- `tests/apiClient.test.js`

## Risks
- Export metadata and ZIP file inclusion can drift when approved-only mode is enabled.
- Review history can be overwritten instead of appended.
- Local and server export options can diverge if query params are not shared.

## Impact Chains
### suspected
- exportProject (src/app.js) -> validateExportItem (src/export/exporter.js) -> createZipBlob (src/export/zip.js)
- exportProject (src/server/api.js) -> createValidationSummary (src/export/exporter.js) -> createAnnotationsJson (src/export/exporter.js)
- applyReviewTransition (src/review/policy.js) -> routeImage review (src/server/api.js) -> storage.writeProjectManifest (src/server/storage.js)

### validated
- exportProject (src/app.js) -> validateExportItem (src/export/exporter.js) -> createZipBlob (src/export/zip.js)
- exportProject (src/server/api.js) -> createValidationSummary (src/export/exporter.js) -> createAnnotationsJson (src/export/exporter.js)
- applyReviewTransition (src/review/policy.js) -> routeImage review (src/server/api.js) -> storage.writeProjectManifest (src/server/storage.js)

### discarded
- database audit table
  - reason: manifest-level review events are enough for the current local-first MVP.

## Validation Plan
- `npm run lint`
- `npm test`
- harness verification bundle
- API smoke for approved-only export and review event persistence

## Implementation Review
- Reviewed export policy propagation across frontend local ZIP, API client query,
  server ZIP, annotations, and summary JSON.
- Reviewed review history write path. Events are append-only inside
  `review_events` and are updated through the shared transition policy.
- No blocking issue found. Remaining audit/auth work is intentionally outside
  this MVP batch.

## Completed Features
- Dedicated feature status document.
- Approved-only export policy option.
- Manifest-level review history records.

## Remaining Work
- Reviewer identity/auth.
- Dedicated review detail route.
- DB-backed audit table if multi-user review starts.

## Closeout
- `npm run lint` passed.
- `npm test` passed with 73 tests.
- `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`,
  `scripts/harness/test-target.sh`, and `scripts/harness/smoke-web.sh` passed.
- API smoke confirmed approved-only export includes approved image, excludes
  submitted image, includes `not_approved`, and reports `review_events`.
- HTML smoke confirmed approved-only export control renders.
- `docs/FEATURE_STATUS.md` and `docs/DEVELOPMENT_CHECKPOINTS.md` updated with
  completed and remaining features.
