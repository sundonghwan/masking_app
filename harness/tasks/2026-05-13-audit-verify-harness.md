# Task: audit-verify-harness

## Goal
- Add an executable audit verification harness that validates audit JSONL files before retention cleanup is introduced.

## Scope
- `scripts/harness/audit-verify.mjs`
- `scripts/harness/audit-verify.sh`
- Syntax harness coverage.
- Audit verifier tests.
- Harness command docs and production audit tracking docs.

## Non-goals
- Deleting or pruning audit files.
- Admin UI for audit search.
- Tamper-proof storage.

## Touched areas
- `scripts/harness/`
- `tests/`
- `harness/commands.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Verifier must fail on malformed evidence without mutating audit files.
- Verifier must detect forbidden metadata keys even if historical logs were manually edited.
- Verifier must report enough counts for operators without exposing payloads.

## Impact Chains
### suspected
- None remaining.

### validated
- audit JSONL files (<data_root>/audit/events-YYYY-MM.jsonl) -> verifyAuditRoot (scripts/harness/audit-verify.mjs:37-55) -> verifyAuditEvent (scripts/harness/audit-verify.mjs:112-134) -> verifyForbiddenMetadata (scripts/harness/audit-verify.mjs:136-153)

### discarded
- Audit retention pruning.
  - reason: verification should land before deletion to avoid silently destroying evidence.

## Validation Plan
- RED/GREEN: `node --test tests/auditVerify.test.js`
- Syntax sensor: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Full suite: `scripts/harness/test-target.sh`
- Harness smoke: `scripts/harness/smoke-web.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after audit event route coverage and audit helper refactor were committed and pushed.
- RED failed on missing audit verifier module.
- GREEN added read-only audit verification for JSONL parseability, required fields, timestamps, outcomes, action counts, and unredacted forbidden metadata.

## Closeout
- Targeted `tests/auditVerify.test.js` passed with 2 tests.
- `scripts/harness/audit-verify.sh --json data` passed with warning `audit_dir_missing`.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 303 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues; checked read-only behavior, parse/field/timestamp/outcome validation, unredacted forbidden metadata detection, and missing audit dir warning behavior for fresh data roots.
