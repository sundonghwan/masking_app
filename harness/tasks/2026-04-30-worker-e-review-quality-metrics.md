# Task: worker-e-review-quality-metrics

## Goal

- Add structured rejection reason code normalization and labels.
- Extend dashboard summary data with review quality metrics derived from image
  statuses and review events.

## Scope

- `src/review/policy.js`
- `src/dashboard/summary.js`
- `tests/reviewPolicy.test.js`
- `tests/dashboardSummary.test.js`

## Non-goals

- No dashboard DOM rendering changes.
- No app controller rewiring unless helper contracts prove insufficient.
- No backend route changes unless the policy contract cannot stay
  backwards-compatible.
- No commits or pushes.

## Touched Areas

- Review transition policy.
- Dashboard pure summary helper.
- Focused unit tests for review policy and dashboard summary.

## Risks

- Existing free-text rejection reasons could be lost or normalized too
  aggressively.
- Dashboard metrics could double-count current rejected images and historical
  rejection events if their meanings are not separated.
- Browser/server review contracts could diverge if new fields are not
  backwards-compatible.

## Impact Chains

### suspected

- `validateReviewTransition (src/review/policy.js:15-49) -> applyReviewTransition (src/review/policy.js:52-94) -> review_events[].reason_code`
- `createDashboardSummary (src/dashboard/summary.js:18-56) -> createReviewQualityMetrics (src/dashboard/summary.js:*) -> dashboard summary contract`

### validated

- `validateReviewTransition (src/review/policy.js:56-94) -> applyReviewTransition (src/review/policy.js:96-149) -> review_events[].reason_code`
  - validation: `node --test tests/reviewPolicy.test.js tests/dashboardSummary.test.js`
- `createDashboardSummary (src/dashboard/summary.js:19-57) -> createReviewQualityMetrics (src/dashboard/summary.js:175-226) -> dashboard summary contract`
  - validation: `node --test tests/reviewPolicy.test.js tests/dashboardSummary.test.js`

### discarded

- None.

## Validation Plan

- `node --test tests/reviewPolicy.test.js tests/dashboardSummary.test.js` -> focused policy and summary contract coverage.
- `node --check src/review/policy.js && node --check src/dashboard/summary.js` -> syntax check changed helpers.
- `git diff --check` -> whitespace and patch hygiene.

## Progress Notes

- Existing policy accepts free-text reject reasons only; dashboard summary is
  already pure and derives recent activity from `review_events`.
- Existing backend and browser callers pass `reason` only, so reason-code support
  must be optional and must preserve free-text behavior.
- Added `REJECTION_REASON_CODES`, reason-code label helpers, alias
  normalization, and free-text fallback normalization in `src/review/policy.js`.
- Added `reviewQuality` to dashboard summaries with review event counts,
  approval/rejection rates, current approved/rejected counts, repeated rejection
  count, unstructured rejection count, and top normalized reject reasons.
- Added recent-activity reason code/label fields so dashboard consumers can show
  structured quality context without reparsing free text.
- Kept the change in pure helpers and focused tests; no `src/app.js` or API route
  edits were needed.

## Findings

- Rejection reason codes can be introduced as an additive field because legacy
  free-text reasons can be normalized into known buckets for metrics.
- `reviewQuality.approvalRate` and `reviewQuality.rejectionRate` are based on
  review decision events only, not total images.

## File-back Candidates

- None expected unless review reason codes become a shared playbook convention.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.

## Validation Results

- `node --test tests/reviewPolicy.test.js tests/dashboardSummary.test.js`
  - passed, 11 tests.
- `node --check src/review/policy.js`
  - passed.
- `node --check src/dashboard/summary.js`
  - passed.
- `scripts/harness/lint-all.sh`
  - passed.
- `git diff --check`
  - passed.

## Review Notes

- No blocking issue found in the final implementation review.
- Remaining risk: server and browser callers do not yet pass explicit
  `reason_code`; current metrics rely on structured event fields when present
  and fallback text normalization otherwise.
- Commit/push skipped per Worker E instruction.
