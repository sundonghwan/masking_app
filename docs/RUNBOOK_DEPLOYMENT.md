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

This runbook does not add process supervision, TLS, reverse proxying, Docker, or
database storage. Those remain separate production-hardening decisions.

## Required Runtime Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` or `MASKING_APP_PORT` | `4173` | HTTP listen port |
| `MASKING_APP_HOST` | `localhost` | Listen host. Use `127.0.0.1` for local-only staging smoke. |
| `MASKING_APP_MODE` | `local` | Mode label exposed by `/api/health` |
| `MASKING_APP_DATA_DIR` or `MASKING_APP_DATA_ROOT` | `data` | Filesystem runtime data root |
| `MASKING_APP_PUBLIC_ROOT` | repo root | Static file root |
| `MASKING_APP_LOG_LEVEL` | `info` | Log level placeholder for current logger policy |
| `MASKING_APP_AI_SERVING` | disabled | Enables generic AI contract/stub only |
| `MASKING_APP_AI_PROVIDER` | `stub` | AI provider label |
| `MASKING_APP_AI_TASKS` | `detection,segmentation,classification` | Advertised AI task capabilities |
| `MASKING_APP_AI_MAX_IMAGE_BYTES` | `5242880` | AI request image byte limit |

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

## Current Production Constraints

- Local bearer-token sessions are still MVP identity, not hardened production
  auth.
- No TLS or reverse proxy policy is included here.
- No process manager is configured in this repository.
- No database or object storage backend exists yet.
- Backup scheduling and retention are not automated.
