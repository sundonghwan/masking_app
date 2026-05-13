# Task: audit-store-foundation

## Goal
- Implement the filesystem audit-store foundation from the operational audit
  retention design.

## Scope
- Add a focused `src/server/auditStore.js` module.
- Add tests for append/list, required field validation, and metadata redaction.
- Add audit store to the syntax check harness.
- Update production/security docs to reflect the foundation status.

## Non-goals
- Wire audit events into API routes in this batch.
- Add UI audit browsing or export.
- Add retention pruning command.
- Replace runtime logs.

## Touched areas
- `src/server/auditStore.js`
- `tests/auditStore.test.js`
- `tests/checkSyntax.test.js`
- `scripts/harness/check-syntax.mjs`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `harness/run_log.md`

## Risks
- Leaking credentials or tokens through audit metadata.
- Overbuilding beyond the current filesystem MVP.
- Treating the foundation as complete route-level audit retention.

## Impact Chains

### suspected
- appendEvent (src/server/auditStore.js:22-27) -> normalizeAuditEvent (src/server/auditStore.js:56-77) -> writeFile (node:fs/promises)
- listEvents (src/server/auditStore.js:28-48) -> readFile (node:fs/promises) -> JSON.parse
- sanitizeAuditMetadata (src/server/auditStore.js:113-131) -> appendEvent (src/server/auditStore.js:22-27)

### validated
- appendEvent (src/server/auditStore.js:22-27) -> normalizeAuditEvent (src/server/auditStore.js:56-77) -> writeFile (node:fs/promises)
  - validation: `node --test tests/auditStore.test.js`
- listEvents (src/server/auditStore.js:28-48) -> readFile (node:fs/promises) -> JSON.parse
  - validation: `node --test tests/auditStore.test.js`
- sanitizeAuditMetadata (src/server/auditStore.js:113-131) -> appendEvent (src/server/auditStore.js:22-27)
  - validation: `node --test tests/auditStore.test.js`

### discarded
- API route audit writes
  - reason: route integration is the next slice; this batch keeps the storage
    boundary isolated and tested first.

## Validation Plan
- RED/GREEN: `node --test tests/auditStore.test.js`
- `node --test tests/checkSyntax.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added `src/server/auditStore.js` with append-only monthly JSONL writes under
  `<data_root>/audit/`.
- Added required-field validation, `success|failure` outcome validation,
  deterministic event shape, list support, and recursive metadata redaction for
  password/token/authorization/payload-style fields, including case-insensitive
  authorization metadata keys.
- Added focused tests and syntax harness coverage.
- Updated security and production readiness docs to clarify that the audit-store
  foundation exists, while route integration and retention verification remain
  next slices.
- Validation passed:
  - RED/GREEN: `node --test tests/auditStore.test.js`
  - `node --test tests/auditStore.test.js tests/checkSyntax.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found and fixed one blocking issue: uppercase `Authorization`
  metadata was not redacted by the first implementation.
- Re-ran full sensors after that fix; all checks passed.
