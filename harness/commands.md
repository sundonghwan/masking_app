# Harness Commands

## Audience

Agents and maintainers running local validation for this repository.

## Objective

Keep standard commands in one place so agents do not guess how to install, run,
test, or validate the project.

## Current Stack

The current MVP is a dependency-free browser web app served by a Node built-in
HTTP server. JavaScript is written as browser/server ES modules and tested with
Node's built-in test runner.

## Harness Wrapper Commands

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/browser-e2e.sh
scripts/harness/storage-verify.sh
scripts/harness/deployment-check.sh
scripts/harness/security-check.sh
scripts/harness/identity-migrate-passwords.sh
scripts/harness/capacity-profile.sh
scripts/harness/backup-data-root.sh
scripts/harness/restore-verify.sh
scripts/harness/production-gate.sh
scripts/harness/staging-evidence.sh
```

## Install / Bootstrap

```bash
npm install
```

There are currently no third-party dependencies, so install is only needed when
future packages are added.

## Development Servers

```bash
npm run dev
```

Default URL:

```text
http://localhost:4173
```

Data root defaults to `data/`. Override it for isolated manual testing:

```bash
MASKING_APP_DATA_DIR=/tmp/masking-app-data npm run dev
```

Useful runtime profile overrides:

```bash
PORT=4173
MASKING_APP_HOST=127.0.0.1
MASKING_APP_MODE=local
MASKING_APP_DATA_DIR=/tmp/masking-app-data
MASKING_APP_PUBLIC_ROOT=/Users/polaris/Documents/sundonghwan/masking_app
MASKING_APP_SESSION_TTL_MS=86400000
MASKING_APP_AI_SERVING=1
MASKING_APP_AI_TASKS=detection,segmentation,classification
npm run dev
```

`MASKING_APP_AI_SERVING=1` only enables the generic API contract/stub. It does
not load a model or perform real inference.

## Lint

Preferred wrapper:

```bash
scripts/harness/lint-all.sh
```

Current behavior:

- runs `npm run lint`
- lint currently delegates to `scripts/harness/check-syntax.mjs`, which runs
  `node --check` for `server.js` and all active API, frontend, export,
  storage, backend server, and harness modules

## Typecheck

Preferred wrapper:

```bash
scripts/harness/typecheck-all.sh
```

Current behavior:

- runs `npm run typecheck`
- typecheck currently delegates to `scripts/harness/check-syntax.mjs`, which
  provides syntax-level `node --check` coverage until TypeScript or a richer
  checker is introduced

## Targeted Tests

Preferred wrapper:

```bash
scripts/harness/test-target.sh [optional-test-filter]
```

Current behavior:

- runs `npm run test`
- tests use Node's built-in test runner over `tests/*.test.js`

## Smoke

Preferred wrapper:

```bash
scripts/harness/smoke-web.sh
```

Current smoke checks:

- verifies required planning/design/harness files exist
- verifies active design screen references exist
- verifies backend/static MVP app files exist
- verifies current architecture/development checkpoint docs exist

Browser journey smoke:

```bash
scripts/harness/browser-e2e.sh
```

Current behavior:

- requires `playwright-cli` on `PATH`
- starts `npm run dev` on a temporary local port
- uses a temporary data root outside the repository
- logs in as the local MVP admin, worker, and reviewer accounts
- creates a project with a two-class label schema as admin
- uploads generated fixture images as admin and worker
- verifies the selected brush color follows the selected project label color
- paints the canvas, submits masks, verifies worker review controls are hidden,
  approves submitted work as reviewer, and triggers approved-only export

## Storage Verification

Preferred wrapper:

```bash
scripts/harness/storage-verify.sh [data-root]
scripts/harness/storage-verify.sh --json [data-root]
```

Current behavior:

- reads only; does not repair or delete files
- defaults to `MASKING_APP_DATA_DIR`, then `MASKING_APP_DATA_ROOT`, then `data`
- validates JSON manifests, identity files, project image references, mask PNG
  headers, hierarchy task/version manifests, and training-set metadata
- exits non-zero when referenced files are missing or JSON/image/mask metadata
  is invalid

## Deployment Check

Preferred wrapper:

```bash
scripts/harness/deployment-check.sh [base-url]
scripts/harness/deployment-check.sh --json [base-url]
```

Current behavior:

- checks a running server; it does not start the app
- defaults to `MASKING_APP_BASE_URL` or `http://$MASKING_APP_HOST:$PORT`
- verifies `/api/health` returns the expected service marker, deployment
  profile, and AI capability shape
- exits non-zero when the server is unreachable or the health payload does not
  match the app contract

## Security Check

Preferred wrapper:

```bash
scripts/harness/security-check.sh [data-root]
scripts/harness/security-check.sh --strict [data-root]
scripts/harness/security-check.sh --json [data-root]
```

Current behavior:

- reads only; does not modify identity files
- defaults to `MASKING_APP_DATA_DIR`, then `MASKING_APP_DATA_ROOT`, then `data`
- relaxed mode warns when local MVP seed passwords or plaintext passwords are
  present
- strict mode exits non-zero for default seed passwords or plaintext passwords
- use strict mode before shared network or production-like deployment

## Identity Password Migration

Preferred wrapper:

```bash
scripts/harness/identity-migrate-passwords.sh [data-root]
scripts/harness/identity-migrate-passwords.sh --apply [data-root]
scripts/harness/identity-migrate-passwords.sh --json [data-root]
```

Current behavior:

- dry-run by default
- converts legacy `password` fields in `identity/users.json` to
  `password_hash`
- writes a timestamped `users.json.bak-*` backup before applying
- does not change roles, display names, or active flags
- should be run only after data-root backup for real deployments

## Capacity Profile

Preferred wrapper:

```bash
scripts/harness/capacity-profile.sh [data-root]
scripts/harness/capacity-profile.sh --strict [data-root]
scripts/harness/capacity-profile.sh --json [data-root]
```

Current behavior:

- reads only; does not modify project data
- reports manifest, image, mask, other-file counts and byte totals
- reports the largest manifest file
- relaxed mode warns when default local/staging thresholds are exceeded
- strict mode exits non-zero when warning thresholds are exceeded

## Data Root Backup

Preferred wrapper:

```bash
scripts/harness/backup-data-root.sh [data-root] [backup-dir]
scripts/harness/backup-data-root.sh --json [data-root] [backup-dir]
```

Package alias:

```bash
npm run backup:data-root -- [data-root] [backup-dir]
```

Current behavior:

- creates a timestamped `masking-app-data-*.tgz` archive of the whole data root
- writes a sibling `masking-app-data-*.json` manifest for the backup run
- refuses to place backups inside the active data root
- defaults backup output to `MASKING_APP_BACKUP_DIR` or `backups`
- applies optional count-based retention with
  `MASKING_APP_BACKUP_RETENTION_COUNT`
- uses the system `tar` command and should be scheduled by cron, launchd, or
  another host-level scheduler

## Restore Verification

Preferred wrapper:

```bash
scripts/harness/restore-verify.sh /path/to/masking-app-data-YYYYMMDDTHHMMSSZ.tgz
scripts/harness/restore-verify.sh --json /path/to/masking-app-data-YYYYMMDDTHHMMSSZ.tgz
```

Package alias:

```bash
npm run restore:verify -- /path/to/masking-app-data-YYYYMMDDTHHMMSSZ.tgz
```

Current behavior:

- extracts the backup archive into a temporary restore directory
- discovers the restored data root
- runs `scripts/harness/storage-verify.mjs --json` against the restored root
- exits non-zero when the archive is missing, extraction fails, or storage
  verification fails

## Production Gate

Preferred wrapper:

```bash
MASKING_APP_MODE=production \
MASKING_APP_DATA_DIR=/path/to/masking-app-data \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
scripts/harness/production-gate.sh
```

Package alias:

```bash
npm run production:gate
```

Current behavior:

- runs deployment-profile checks from the current environment
- requires `MASKING_APP_MODE=production` or `MASKING_APP_MODE=prod`
- requires explicit filesystem acceptance through
  `MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1`
- rejects data roots inside the repository
- runs strict identity security checks against the selected data root
- exits non-zero when default seed passwords, plaintext passwords, missing
  identity files, or unsafe production settings remain

## Staging Evidence Bundle

Preferred wrapper:

```bash
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json [data-root] [backup-dir]
```

Optional running-server health evidence:

```bash
scripts/harness/staging-evidence.sh --json --base-url http://127.0.0.1:4173 [data-root] [backup-dir]
```

Current behavior:

- runs `storage-verify`, `capacity-profile`, `backup-data-root`,
  `restore-verify`, and `production-gate` in JSON mode
- uses the backup archive created by the same run for restore rehearsal
- records every sub-check result and exits non-zero when any required step fails
- runs `deployment-check` only when `--base-url` is supplied
- does not start the app server and does not replace the individual commands

Manual browser smoke:

- run `npm run dev`
- open `http://localhost:4173`
- verify `GET /api/health` returns `{ "ok": true }`
- verify app shell loads with upload, canvas, inspector, and statusbar
- upload an image
- paint/erase mask
- save mask PNG
- submit image
- export metadata JSON

## CI Equivalent

CI-equivalent local bundle:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/browser-e2e.sh
scripts/harness/storage-verify.sh "${MASKING_APP_DATA_DIR:-data}"
scripts/harness/capacity-profile.sh "${MASKING_APP_DATA_DIR:-data}"
scripts/harness/deployment-check.sh http://127.0.0.1:4173
scripts/harness/security-check.sh --strict "${MASKING_APP_DATA_DIR:-data}"
```

## Updating Commands

When adding or changing stack commands:

1. Update this file.
2. Update the matching `scripts/harness/*.sh` wrapper.
3. Run the wrapper locally.
4. Add a short entry to `harness/run_log.md`.
