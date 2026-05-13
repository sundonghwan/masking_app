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
- lint currently uses `node --check` for `server.js` and all active API,
  frontend, export, storage, and backend server modules

## Typecheck

Preferred wrapper:

```bash
scripts/harness/typecheck-all.sh
```

Current behavior:

- runs `npm run typecheck`
- typecheck currently uses syntax-level `node --check` until TypeScript or a
  richer checker is introduced

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
- logs in as the local MVP admin account
- creates a project with a two-class label schema
- uploads a generated fixture image
- verifies the selected brush color follows the selected project label color
- paints the canvas, submits the mask, approves it, and triggers approved-only
  export

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
scripts/harness/deployment-check.sh http://127.0.0.1:4173
scripts/harness/security-check.sh --strict "${MASKING_APP_DATA_DIR:-data}"
```

## Updating Commands

When adding or changing stack commands:

1. Update this file.
2. Update the matching `scripts/harness/*.sh` wrapper.
3. Run the wrapper locally.
4. Add a short entry to `harness/run_log.md`.
