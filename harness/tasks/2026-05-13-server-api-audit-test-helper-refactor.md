# Task: server-api-audit-test-helper-refactor

## Goal
- Remove repeated audit capture setup from server API tests without changing API behavior.

## Scope
- `tests/serverApi.test.js` audit event capture helper.
- Replace duplicated in-test `auditEvents`/`auditStore.appendEvent` setup.
- Run focused and full test validation.

## Non-goals
- Production route behavior changes.
- New audit event coverage.
- Splitting `src/server/api.js`.

## Touched areas
- `tests/serverApi.test.js`

## Risks
- Refactor could hide mutation of captured audit event objects.
- Refactor could accidentally change existing audit assertions.

## Impact Chains
### suspected
- None remaining.

### validated
- createAuditCapture (tests/serverApi.test.js:19-30) -> createApiHarness auditStore injection (tests/serverApi.test.js:437-1702) -> server route audit assertions (tests/serverApi.test.js:447-1779)

### discarded
- Production API route changes.
  - reason: test-only helper extraction; no production file should change.

## Validation Plan
- Focused: `node --test tests/serverApi.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Candidate selected from code health checklist after audit route batch; duplicated audit capture setup appears repeatedly in `tests/serverApi.test.js`.
- Extracted a test-only `createAuditCapture()` helper that deep-copies appended audit events exactly like the duplicated setup did.

## Closeout
- `node --test tests/serverApi.test.js` passed with 66 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 307 tests.
- `git diff --check` passed.
- Code review found no blocking issue. Checked that production files were untouched, the capture helper preserves the previous JSON deep-copy behavior, and the intentionally failing audit-store test still uses its local throwing store.
