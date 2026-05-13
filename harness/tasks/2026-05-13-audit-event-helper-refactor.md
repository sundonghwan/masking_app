# Task: audit-event-helper-refactor

## Goal
- Reduce repeated audit actor/resource field construction in server API routes without changing audit behavior.

## Scope
- `src/server/api.js` audit event object construction.
- Harness run log/task documentation.

## Non-goals
- New audit routes or event types.
- Audit retention or verifier implementation.
- Test expectation changes.

## Touched areas
- `src/server/api.js`

## Risks
- Refactor could accidentally drop actor identity, role, resource ids, or project/image ids from audit events.
- Refactor could broaden audit behavior beyond previously validated success paths.

## Impact Chains
### suspected
- None remaining.

### validated
- route audit event builders (src/server/api.js:271-1814) -> auditActor/auditResource (src/server/api.js:1124-1136) -> recordAuditEvent (src/server/api.js:1100-1116)

### discarded
- New audit behavior.
  - reason: this task is behavior-preserving cleanup only.

## Validation Plan
- Focused route regression: `node --test tests/serverApi.test.js`
- Full suite: `scripts/harness/test-target.sh`
- Syntax sensors: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Whitespace review: `git diff --check`

## Progress Notes
- Started after review/export audit coverage was committed and pushed.
- Extracted repeated actor/resource field construction into local helpers.
- Focused `tests/serverApi.test.js` passed with 64 tests after refactor.

## Closeout
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 301 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issues; checked that the helper preserves existing actor/resource field names and does not introduce new audit event types.
