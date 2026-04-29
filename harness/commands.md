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
```

## Updating Commands

When adding or changing stack commands:

1. Update this file.
2. Update the matching `scripts/harness/*.sh` wrapper.
3. Run the wrapper locally.
4. Add a short entry to `harness/run_log.md`.
