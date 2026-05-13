# Deployment Runbook

## Audience

Maintainers operating Masking App in local or staging production-like
environments.

## Objective

Start, verify, monitor, and roll back the current Node-based deployment without
guessing runtime variables or health-check steps.

## Current Deployment Shape

The app is a dependency-free Node HTTP server:

```bash
npm run dev
```

`server.js` serves static app files and routes `/api/*` requests to the backend
API. Runtime settings are resolved by `src/server/deploymentProfile.js`.

This runbook includes a baseline Docker/Compose packaging path for local or
staging operation. TLS, reverse proxying, and database storage remain separate
production-hardening decisions.

## Required Runtime Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` or `MASKING_APP_PORT` | `4173` | HTTP listen port |
| `MASKING_APP_HOST` | `localhost` | Listen host. Use `127.0.0.1` for local-only staging smoke. |
| `MASKING_APP_MODE` | `local` | Mode label exposed by `/api/health` |
| `MASKING_APP_DATA_DIR` or `MASKING_APP_DATA_ROOT` | `data` | Filesystem runtime data root |
| `MASKING_APP_PUBLIC_ROOT` | repo root | Static file root |
| `MASKING_APP_LOG_LEVEL` | `info` | Log level placeholder for current logger policy |
| `MASKING_APP_LOG_FILE` | unset | Optional JSONL runtime log file path |
| `MASKING_APP_AI_SERVING` | disabled | Enables generic AI contract/stub only |
| `MASKING_APP_AI_PROVIDER` | `stub` | AI provider label |
| `MASKING_APP_AI_TASKS` | `detection,segmentation,classification` | Advertised AI task capabilities |
| `MASKING_APP_AI_MAX_IMAGE_BYTES` | `5242880` | AI request image byte limit |
| `MASKING_APP_ALLOWED_ORIGINS` | empty | Comma-separated CORS allowlist. Empty means same-origin only. |
| `MASKING_APP_CONTENT_SECURITY_POLICY` | built-in baseline | Optional override for the response Content-Security-Policy header. |

## Start Procedure

1. Install dependencies if needed:

   ```bash
   npm install
   ```

   The current repository has no third-party runtime dependencies.

2. Verify the data root before startup:

   ```bash
   scripts/harness/storage-verify.sh "${MASKING_APP_DATA_DIR:-data}"
   ```

3. Start the server:

   ```bash
   MASKING_APP_HOST=127.0.0.1 \
   MASKING_APP_MODE=staging \
   MASKING_APP_DATA_DIR=/path/to/masking-app-data \
   MASKING_APP_LOG_FILE=/path/to/masking-app-runtime.jsonl \
   npm run dev
   ```

4. Verify health:

   ```bash
   scripts/harness/deployment-check.sh http://127.0.0.1:4173
   ```

5. Run the critical browser workflow if this is a staging candidate:

   ```bash
   scripts/harness/browser-e2e.sh
   ```

## Docker Compose Procedure

Use this path when the target host should restart the app process automatically
and keep runtime data outside the image.

1. Build and start:

   ```bash
   docker compose up --build -d
   ```

2. Verify the container is running:

   ```bash
   docker compose ps
   ```

3. Verify health from the host:

   ```bash
   scripts/harness/deployment-check.sh http://127.0.0.1:4173
   ```

4. Inspect logs:

   ```bash
   docker compose logs --tail=100 masking-app
   ```

5. Stop without deleting the named data volume:

   ```bash
   docker compose down
   ```

The default Compose file mounts a named volume, `masking_app_data`, at
`/app/data`. Do not rely on files under the repository `data/` directory when
running through Compose unless you intentionally replace the volume mapping.

## Health Check

Direct endpoint:

```bash
curl -sS http://127.0.0.1:4173/api/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "masking-app-backend",
  "deployment": {
    "mode": "staging",
    "port": 4173,
    "data_root_configured": true,
    "public_root_configured": true
  },
  "ai_serving": {
    "enabled": false,
    "provider": "stub",
    "tasks": ["detection", "segmentation", "classification"]
  }
}
```

Use the harness wrapper for automated checks:

```bash
scripts/harness/deployment-check.sh --json http://127.0.0.1:4173
```

## HTTP Security Boundary

The server applies baseline browser security headers to all responses:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

CORS is denied by default. Only origins listed in
`MASKING_APP_ALLOWED_ORIGINS` receive `Access-Control-Allow-Origin`. This keeps
the local/staging default same-origin and avoids accidentally opening bearer
token APIs to arbitrary browser origins.

Example:

```bash
MASKING_APP_ALLOWED_ORIGINS=https://label.example.com,https://review.example.com \
npm run dev
```

TLS is still expected to terminate before the Node server, either in a reverse
proxy or managed platform. Do not expose the Node process directly on a shared
network without TLS termination.

## Logs

Runtime logs are structured JSON lines written to stdout/stderr by the Node
process.

Important events:

- `api.request.completed`
- `api.request.failed`
- `mask.validation.failed`
- `mask.save.completed`
- `review.transition.completed`
- `export.completed`

Logs must not contain image data URLs, mask data URLs, object URLs, or raw image
bytes. If those appear, treat it as a logging policy bug.

## Rollback

Rollback is currently process and data-root based:

1. Stop the current process.
2. Check out the previous known-good commit.
3. Point `MASKING_APP_DATA_DIR` back to the previous known-good data root or
   restored backup.
4. Start the server.
5. Run:

   ```bash
   scripts/harness/storage-verify.sh "$MASKING_APP_DATA_DIR"
   scripts/harness/deployment-check.sh http://127.0.0.1:4173
   ```

Do not purge projects or training sets as part of rollback unless a separate
incident plan says to do so.

## Validation Before Release

Run this bundle before declaring a staging build ready:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/storage-verify.sh "${MASKING_APP_DATA_DIR:-data}"
scripts/harness/browser-e2e.sh
scripts/harness/deployment-check.sh http://127.0.0.1:4173
```

`browser-e2e.sh` starts its own temporary server/data root. `deployment-check.sh`
checks the server you point it at.

For a production-like staging data root, collect the data-root evidence bundle:

```bash
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json \
  --base-url http://127.0.0.1:4173 \
  "${MASKING_APP_DATA_DIR:-data}" \
  "${MASKING_APP_BACKUP_DIR:-backups}"
```

This bundle does not start the app. It records storage verification, capacity
profile, backup creation, restore rehearsal against the created archive,
production gate, and optional deployment health evidence in one JSON object.

For Docker packaging changes, also run:

```bash
node --test tests/deploymentPackaging.test.js
```

Before declaring a production-mode deployment acceptable, run the production
gate with the real target data root:

```bash
MASKING_APP_MODE=production \
MASKING_APP_DATA_DIR="/path/to/masking-app-data" \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/production-gate.sh
```

Only set `MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1` after the team accepts
the filesystem metadata boundary documented in
`docs/STORAGE_CONCURRENCY_DECISION.md`. Only set
`MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` after the team accepts the
local filesystem user directory as the first production identity boundary, or
replace it with an external identity provider. The gate still does not install
TLS, reverse proxy rules, or a scheduler; those remain host responsibilities.

When `MASKING_APP_MODE=production`, the server also runs the production safety
check during startup and fails before listening if the data root is inside the
repository, filesystem production acceptance is missing, or strict local
identity acceptance/checks fail.

## Current Production Constraints

- Local bearer-token sessions are still MVP identity, not hardened production
  auth. `production-gate.sh` blocks default seed passwords and plaintext
  passwords, but it is not an external identity provider.
- TLS termination is still external to the Node server and must be configured in
  the deployment host or reverse proxy.
- `MASKING_APP_LOG_FILE` writes JSONL runtime logs, but log rotation and
  retention are host-managed.
- Docker Compose is the current packaged process runner. Host-native launchd,
  systemd, and managed platform service definitions are not installed here.
- No database or object storage backend exists yet.
- Backup scheduling is host-managed; the repository provides the backup command
  and retention option but does not install a scheduler.
