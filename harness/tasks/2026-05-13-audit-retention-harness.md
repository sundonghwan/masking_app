# Task: audit-retention-harness

## Goal
- Add explicit operator-visible audit retention pruning with dry-run default and `--apply` deletion.

## Scope
- `scripts/harness/audit-retention.mjs`
- `scripts/harness/audit-retention.sh`
- Retention tests.
- Syntax/smoke harness coverage.
- Command and readiness docs.

## Non-goals
- Silent automatic retention during API requests.
- Partial JSONL line rewriting.
- Tamper-proof audit storage.

## Touched areas
- `scripts/harness/`
- `tests/`
- `harness/commands.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Audit evidence must not be deleted unless the operator explicitly passes `--apply`.
- Retention should delete only whole monthly files safely older than the cutoff, not rewrite mixed-month evidence.
- Fresh data roots without an `audit/` directory should remain non-blocking.

## Impact Chains
### suspected
- None remaining.

### validated
- audit monthly files (<data_root>/audit/events-YYYY-MM.jsonl) -> planAuditRetention (scripts/harness/audit-retention.mjs:20-40) -> plan (scripts/harness/audit-retention.mjs:64-109) -> unlink old whole-month files only with --apply (scripts/harness/audit-retention.mjs:101-105)

### discarded
- Automatic request-time retention.
  - reason: retention must remain explicit and operator-visible.

## Validation Plan
- RED/GREEN: `node --test tests/auditRetention.test.js`
- Wrapper smoke: `scripts/harness/audit-retention.sh --json data`
- Syntax sensors: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Full suite: `scripts/harness/test-target.sh`
- Harness smoke: `scripts/harness/smoke-web.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after audit verification harness was committed and pushed.
- RED failed on missing audit retention module.
- GREEN added dry-run default retention planning and explicit `--apply` deletion for only fully expired monthly audit files.

## Closeout
- Targeted `tests/auditRetention.test.js` passed with 2 tests.
- `scripts/harness/audit-retention.sh --json data` passed with warning `audit_dir_missing` and no candidates.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 305 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues; checked dry-run default, `--apply`-only deletion, whole-month-only pruning, fresh data root warning behavior, and no request-time automatic retention.
