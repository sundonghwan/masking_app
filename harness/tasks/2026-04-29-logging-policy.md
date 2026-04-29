# Task: logging-policy

## Goal

- Define development and runtime logging rules before expanding operational
  features.
- Add minimal structured runtime logging for backend requests, validation/export
  operations, and frontend backend-sync failures.

## Scope

- `docs/LOGGING.md`
- `src/observability/logger.js`
- `server.js`
- `src/server/api.js`
- `src/app.js`
- tests and harness docs

## Non-goals

- External log aggregation.
- Persistent audit logs.
- User/session logging.
- Dashboard metrics.

## Touched Areas

- runtime logging
- backend request handling
- frontend sync failure handling
- documentation and harness references

## Risks

- Logs can leak image or mask payloads if not redacted.
- Operational debugging remains hard if event names are ad hoc.
- Review/admin work will need stronger audit logs later.

## Impact Chains

### suspected

- createServer (server.js:18-58) -> createLogger (src/observability/logger.js:1-42)
- syncMaskToBackend (src/app.js:348-380) -> logger.warn (src/observability/logger.js:20-22)

### validated

- createServer (server.js:18-58) -> createLogger (src/observability/logger.js:1-42)
- sync failure handlers (src/app.js:278-397) -> sanitizeLogFields (src/observability/logger.js:44-73)

### discarded

- persistent audit log
  - reason: future review/admin workflow needs a separate durable audit design.

## Validation Plan

- `npm run lint`
- `npm test`
- `scripts/harness/smoke-web.sh`
- runtime smoke: `GET /api/health` emits `api.request.completed`

## Progress Notes

- Added `docs/LOGGING.md`.
- Added structured logger with payload redaction.
- Replaced frontend sync `console.warn` calls with structured log events.
- Added backend request completion/failure, mask validation, mask save, and
  export completion events.

## Findings

- Current logging is enough for local MVP debugging.
- Future review/admin work still needs durable audit records, not just runtime
  console logs.
- Runtime smoke confirmed a structured `api.request.completed` event with
  `request_id`, method, path, status, and duration.

## Closeout

- [x] Scope matched actual diff.
- [x] Logger tests cover structure, redaction, and error serialization.
- [x] Harness docs reference logging policy.
