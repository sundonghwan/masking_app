# Task: log-redaction-hardening

## Goal
- Prevent credential and session fields from leaking into structured runtime
  logs before log retention or ingestion is expanded.

## Scope
- Runtime logger redaction keys.
- Unit test coverage for credential/token redaction.
- Logging policy and production readiness updates.

## Non-goals
- Add log ingestion backend.
- Add dashboard UI.
- Persist runtime logs to files.

## Touched areas
- `src/observability/logger.js`
- `tests/logger.test.js`
- `docs/LOGGING.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Accidentally logging bearer sessions or passwords.
- Redacting useful non-sensitive IDs too broadly.

## Impact Chains

### suspected
- createLogger (src/observability/logger.js:13-34) -> sanitizeLogFields (src/observability/logger.js:36-64) -> defaultSink (src/observability/logger.js:71-74)

### validated
- createLogger (src/observability/logger.js:13-34) -> sanitizeLogFields (src/observability/logger.js:36-64) -> defaultSink (src/observability/logger.js:71-74)
  - validation: `tests/logger.test.js` verifies password, token, sessionToken,
    and authorization are redacted.

### discarded
- log ingestion implementation
  - reason: redaction is the immediate prerequisite; ingestion/retention can be
    added after log safety is stronger.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- code review found no blocking issue after checking that redaction covers
  passwords, bearer/session tokens, and authorization headers without redacting
  non-sensitive user IDs.
