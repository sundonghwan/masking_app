# Task: operational-audit-retention-design

## Goal
- Design the next production-hardening slice for durable operational audit
  retention before implementing it.

## Scope
- Inspect existing runtime log, review event, admin/user/session/export evidence.
- Compare minimal implementation options.
- Write a repository-specific design document for audit retention.
- Update run log and production-readiness references as needed.

## Non-goals
- Implement the audit store in this batch.
- Add a UI audit viewer.
- Replace runtime operational logs.
- Add an external SIEM or database.

## Touched areas
- `docs/superpowers/specs/2026-05-13-operational-audit-retention-design.md`
- `harness/run_log.md`

## Risks
- Overbuilding a DB-like audit subsystem before the filesystem MVP boundary is
  exhausted.
- Treating diagnostic runtime logs as durable audit evidence.
- Logging credentials, bearer tokens, image bytes, mask bytes, or raw request
  payloads.

## Impact Chains

### suspected
- routeApi login/logout (src/server/api.js:69-94) -> audit event capture (future) -> appendAuditEvent (future)
- routeApi admin user/project/training mutations (src/server/api.js:109-193,261-364,1323-1383) -> audit event capture (future) -> appendAuditEvent (future)
- review transition/export flows (src/server/api.js:806-847,1439-1617) -> audit event capture (future) -> appendAuditEvent (future)

### validated
- Design only; no runtime code changed.

### discarded
- Runtime JSONL as audit database
  - reason: runtime logs are diagnostic, host-rotated, and not structured around
    actor/action/resource retention guarantees.

## Validation Plan
- Review design against `docs/LOGGING.md`, `docs/PRODUCTION_READINESS_AUDIT.md`,
  and `docs/SECURITY_HARDENING_PLAN.md`.
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Created a design for a minimal append-only filesystem audit store under
  `<data_root>/audit/events-YYYY-MM.jsonl`.
- Compared runtime JSONL, project-manifest audit arrays, and a separate audit
  store; chose the separate audit store because it keeps actor/action/resource
  retention evidence distinct from diagnostic logs and project manifests.
- Split implementation into four slices: audit store foundation, session/user
  events, project/review/export events, and audit verification harness.
- Updated production readiness audit to point to the design artifact.
- Validation passed:
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
