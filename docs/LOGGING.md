# Logging Policy

## Audience

Maintainers and coding agents adding backend APIs, frontend sync behavior,
validation, export, or future review/admin workflows.

## Objective

Separate development task logs from runtime operational logs, and define the
minimum event fields needed to debug local MVP operations without leaking image
payloads or mask data.

## 1. Log Types

### Development Logs

Development logs live in the harness:

- detailed task context: `harness/tasks/*.md`
- short append-only summary: `harness/run_log.md`

Use these for:

- implementation plan
- impact chains
- commands run
- validation results
- blockers
- reusable lesson candidates

Do not use harness logs for runtime request traces or user data.

### Runtime Operational Logs

Runtime logs are emitted by the app while it runs.

Use runtime logs for:

- API request completion
- API request failure
- backend validation failure
- project/image/mask/export operations
- frontend backend-sync failure
- local fallback behavior

By default the Node server writes structured runtime logs to stdout. For
production-like operation, set `MASKING_APP_LOG_FILE` to append the same
sanitized JSON entries to a JSONL file while still mirroring to stdout:

```bash
MASKING_APP_LOG_FILE=/var/log/masking-app/runtime.jsonl npm run dev
```

The repository does not install log rotation. Use the host platform, Docker log
driver, or a managed log shipper for retention and archival.

## 2. Runtime Log Format

Runtime logs should be structured JSON or a structured console object with these
fields:

```json
{
  "ts": "2026-04-29T00:00:00.000Z",
  "level": "info",
  "event": "api.request.completed",
  "component": "server",
  "request_id": "req_...",
  "method": "GET",
  "path": "/api/health",
  "status": 200,
  "duration_ms": 4
}
```

Required fields:

| Field | Meaning |
| --- | --- |
| `ts` | ISO timestamp |
| `level` | `debug`, `info`, `warn`, or `error` |
| `event` | stable machine-readable event name |
| `component` | `server`, `frontend`, `storage`, `validation`, or `export` |

Recommended fields:

| Field | Meaning |
| --- | --- |
| `request_id` | request correlation ID |
| `project_id` | project identifier |
| `image_id` | image identifier |
| `status` | HTTP or domain status |
| `duration_ms` | elapsed operation time |
| `reason` | stable failure reason |
| `fallback` | fallback path used, such as `local_zip` |

## 3. Event Naming

Use dot-separated event names:

```text
api.request.completed
api.request.failed
mask.validation.failed
mask.save.completed
export.completed
export.failed
sync.project.failed
sync.image.failed
sync.mask.failed
sync.export.fallback
```

Rules:

- keep names stable once tests or dashboards depend on them
- describe what happened, not where the code lives
- include `failed` only for failed operations
- include `fallback` when the app deliberately changes path after failure

## 4. Data Safety

Never log:

- image data URLs
- mask data URLs
- raw image bytes
- raw mask bytes
- passwords
- bearer/session tokens
- authorization headers
- full filesystem paths outside the repo if not needed
- browser object URLs
- large request bodies

Allowed:

- project IDs
- image IDs
- archive-relative paths
- validation reason codes
- file sizes
- HTTP status codes
- request durations

## 5. MVP Required Events

Backend:

- `api.request.completed`
- `api.request.failed`
- `mask.validation.failed`
- `export.completed`
- `export.failed`

Frontend:

- `sync.project.failed`
- `sync.image.failed`
- `sync.mask.failed`
- `sync.export.fallback`

## 6. Development Rules

When adding or changing high-risk flows, update logs with the same care as tests:

- mask save changes should log validation failures without payloads
- export changes should log exported/excluded counts
- sync changes should log fallback path and reason
- storage changes should log only archive-relative paths or counts
- auth/review/admin additions must define user/action IDs before implementation
- auth/session changes must never log passwords, bearer tokens, or authorization
  headers

## 7. Verification

For logging changes:

```bash
npm run lint
npm test
scripts/harness/smoke-web.sh
```

For backend runtime checks:

```bash
npm run dev
curl -sS http://localhost:4173/api/health
```

Inspect the terminal output for structured `api.request.completed` events.
When `MASKING_APP_LOG_FILE` is configured, also inspect the JSONL file:

```bash
tail -n 5 "$MASKING_APP_LOG_FILE"
```
