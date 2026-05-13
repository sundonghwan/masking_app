# Task: review-export-audit-events

## Goal
- Record operational audit events for review transitions and dataset export routes.

## Scope
- Successful image review transitions.
- Project ZIP export route.
- Immediate training-set export route.
- Saved training-set export route.
- Server API tests and production readiness/security tracking docs.

## Non-goals
- Failed review-transition audit events.
- Audit retention deletion/window enforcement.
- Audit verification CLI.
- UI changes.

## Touched areas
- `src/server/api.js`
- `tests/serverApi.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Export audit metadata must not include image bytes, mask bytes, data URLs, or ZIP payload contents.
- Audit writes must not block completed review/export responses.
- Project export functions currently receive context but not actor information, so caller session context must be passed explicitly.

## Impact Chains
### suspected
- None remaining.

### validated
- routeImage review (src/server/api.js:930-988) -> applyReviewTransition (src/review/policy.js:91-151) -> storage.writeProjectManifest (src/server/api.js:964-964) -> recordAuditEvent (src/server/api.js:1098-1114)
- routeProject export (src/server/api.js:576-582) -> exportProject (src/server/api.js:1616-1723) -> recordAuditEvent (src/server/api.js:1098-1114)
- routeApi training-set export (src/server/api.js:207-212) -> exportTrainingSet (src/server/api.js:1725-1770) -> recordAuditEvent (src/server/api.js:1098-1114)
- routeTrainingSet saved export (src/server/api.js:1511-1516) -> exportSavedTrainingSet (src/server/api.js:1772-1825) -> recordAuditEvent (src/server/api.js:1098-1114)

### discarded
- Failed review transition audit events.
  - reason: needs separate decision on whether invalid attempts should be stored as audit events or only runtime warning logs.

## Validation Plan
- RED/GREEN: `node --test tests/serverApi.test.js`
- Full suite: `scripts/harness/test-target.sh`
- Syntax sensors: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Harness smoke: `scripts/harness/smoke-web.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after project/image lifecycle audit events were committed and pushed.
- RED confirmed missing review and export audit events.
- GREEN confirmed successful review transition, project export, immediate training-set export, and saved training-set export audit events.

## Closeout
- Targeted `tests/serverApi.test.js` passed with 64 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 301 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues; checked actor propagation into export helpers, payload-free export metadata, audit failure non-blocking behavior through the existing helper, and failed-review audit intentionally left for a later policy decision.
