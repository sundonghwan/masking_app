# Task: assignment-training-set-audit-events

## Goal
- Complete the remaining route-level audit coverage for assignment updates and saved training-set lifecycle mutations.

## Scope
- Image assignment update audit event.
- Saved training-set create, archive, and restore audit events.
- Server API tests and audit/readiness docs.

## Non-goals
- Failed assignment/training-set attempt audit policy.
- Audit verifier or retention changes.
- UI changes.

## Touched areas
- `src/server/api.js`
- `tests/serverApi.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Assignment audit must use authenticated admin session identity, not body input.
- Training-set audit metadata must remain count-oriented and not include archive payloads.
- Audit write failure must stay non-blocking through the existing `recordAuditEvent` helper.

## Impact Chains
### suspected
- None remaining.

### validated
- routeImage assignment (src/server/api.js:977-1033) -> storage.writeProjectManifest (src/server/api.js:1013-1013) -> recordAuditEvent (src/server/api.js:1113-1129)
- createSavedTrainingSet (src/server/api.js:1578-1642) -> storage.writeTrainingSetManifest (src/server/api.js:1614-1630) -> recordAuditEvent (src/server/api.js:1113-1129)
- routeTrainingSet archive/restore (src/server/api.js:1531-1572) -> storage training-set lifecycle helpers (src/server/api.js:1537-1565) -> recordAuditEvent (src/server/api.js:1113-1129)

### discarded
- Failed mutation audit events.
  - reason: failure audit policy should be handled consistently across route families in a separate decision.

## Validation Plan
- RED/GREEN: `node --test tests/serverApi.test.js`
- Full suite: `scripts/harness/test-target.sh`
- Syntax sensors: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Harness smoke: `scripts/harness/smoke-web.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after audit verification and retention harnesses were committed and pushed.
- RED confirmed assignment and saved training-set lifecycle audit events were not written.
- GREEN confirmed assignment.update and training_set.create/archive/restore success events.

## Closeout
- Targeted `tests/serverApi.test.js` passed with 66 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 307 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues. One test assertion was tightened to check the serialized audit event stream for source image/mask payload leakage instead of checking only object keys.
