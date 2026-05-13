# Task: session-user-audit-events

## Goal
- Wire the audit-store foundation into the first security-sensitive API routes:
  session login/logout and local user administration.

## Scope
- Add optional `auditStore` dependency to `createApiRouter`.
- Record audit events for session login success/failure, session logout, user
  create, and user update/deactivate/reactivate.
- Keep audit write failure non-blocking and logged through runtime logger.
- Wire the default filesystem audit store in `server.js`.

## Non-goals
- Project/review/export audit events.
- Audit query/export UI.
- Audit retention pruning or verifier scripts.

## Touched areas
- `src/server/api.js`
- `server.js`
- `tests/serverApi.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Logging passwords or bearer tokens in audit metadata.
- Blocking login/admin actions when audit append fails.
- Overclaiming complete audit retention before project/review/export routes are
  wired.

## Impact Chains

### suspected
- routeApi login (src/server/api.js:69-82) -> recordAuditEvent (future) -> auditStore.appendEvent (src/server/auditStore.js:22-27)
- routeApi logout (src/server/api.js:85-94) -> recordAuditEvent (future) -> auditStore.appendEvent (src/server/auditStore.js:22-27)
- routeApi users create/update (src/server/api.js:109-145) -> recordAuditEvent (future) -> auditStore.appendEvent (src/server/auditStore.js:22-27)

### validated
- routeApi login (src/server/api.js:69-103) -> recordAuditEvent (src/server/api.js:1015-1030) -> auditStore.appendEvent (src/server/auditStore.js:22-27)
  - validation: `node --test tests/serverApi.test.js`
- routeApi logout (src/server/api.js:106-125) -> recordAuditEvent (src/server/api.js:1015-1030) -> auditStore.appendEvent (src/server/auditStore.js:22-27)
  - validation: `node --test tests/serverApi.test.js`
- routeApi users create/update (src/server/api.js:140-190) -> recordAuditEvent (src/server/api.js:1015-1030) -> auditStore.appendEvent (src/server/auditStore.js:22-27)
  - validation: `node --test tests/serverApi.test.js`

### discarded
- Project/review/export audit events
  - reason: route integration is intentionally split into another batch to keep
    this security slice reviewable.

## Validation Plan
- RED/GREEN: `node --test tests/serverApi.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added optional `auditStore` dependency to `createApiRouter` and wired the
  default filesystem audit store in `server.js`.
- Added sanitized audit writes for session login success/failure, logout, user
  create, user update, user deactivate, and user reactivate.
- Added non-blocking `audit.write.failed` runtime warning when audit append
  fails.
- Validation passed:
  - RED/GREEN: `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: project, review, export,
  retention, and audit verification are still separate slices.
