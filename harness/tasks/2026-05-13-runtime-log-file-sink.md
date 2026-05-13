# Task: runtime-log-file-sink

## Goal
- Add an operator-configurable JSONL runtime log file sink.

## Scope
- Node-only JSONL file sink for structured runtime logs.
- Server wiring through `MASKING_APP_LOG_FILE`.
- Tests for append behavior and mirrored console sink behavior.
- Syntax coverage and logging/deployment/production audit docs.

## Non-goals
- Build a log dashboard.
- Install host log rotation.
- Change frontend logging.
- Persist raw image, mask, password, or token data.

## Touched areas
- `server.js`
- `src/observability/logger.js`
- `src/observability/runtimeLogSink.js`
- `tests/runtimeLogSink.test.js`
- `scripts/harness/check-syntax.mjs`
- `docs/LOGGING.md`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Blocking the request path with synchronous file appends.
- Duplicating logs unexpectedly when mirroring to stdout.
- Treating file logging as a full retention/dashboard solution.

## Impact Chains

### suspected
- server logger (server.js) -> createJsonlFileSink (src/observability/runtimeLogSink.js) -> createLogger (src/observability/logger.js)

### validated
- server logger (server.js) -> createJsonlFileSink (src/observability/runtimeLogSink.js) -> createLogger (src/observability/logger.js)
  - validation: `node --test tests/runtimeLogSink.test.js`

### discarded
- frontend logger
  - reason: this task adds a Node runtime file sink only; browser logging still
    uses the existing console sink.

## Validation Plan
- `node --test tests/runtimeLogSink.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `scripts/harness/browser-e2e.sh`
- `git diff --check`

## Closeout
- Added a Node runtime JSONL file sink and wired it through
  `MASKING_APP_LOG_FILE`.
- Kept file logging as an operator-managed sink only. Rotation, retention, and
  shipping remain host/Docker/managed-platform concerns.
- Validation passed:
  - `node --test tests/runtimeLogSink.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/browser-e2e.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: the sink uses
  synchronous appends, which is acceptable for the current local/staging
  deployment shape but should be replaced with a buffered/shipper-backed path
  before high-volume multi-worker production.
