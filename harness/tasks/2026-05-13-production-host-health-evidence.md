# Task: production-host-health-evidence

## Goal
- Start the app in production mode against the migrated staging data-root copy
  and capture deployment health evidence.

## Scope
- Run the Node server with production env flags and the copied staging data root.
- Run `scripts/harness/deployment-check.sh --json` against the live server.
- Save the health evidence as a release artifact.
- Update production progress docs.

## Non-goals
- Installing TLS, reverse proxy, launchd/systemd, or Docker on a target host.
- Claiming final production readiness.
- Mutating the repository `data/` directory.

## Touched areas
- `release-artifacts/`
- `docs/REMAINING_WORK_BOARD.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Port conflict with an existing local dev server.
- Evidence is local host evidence, not final deployment host evidence.

## Impact Chains
### suspected
- server startup (server.js:18-45) -> assertProductionStartupSafety (src/server/productionSafety.js:1-1) -> deployment-check health evidence

### validated
- server startup (server.js:18-45) -> assertProductionStartupSafety (src/server/productionSafety.js:1-1) -> deployment-check health evidence
  - validation: `scripts/harness/deployment-check.sh --json http://127.0.0.1:4183`

### discarded
- TLS/reverse proxy installation.
  - reason: local health evidence is separate from host network hardening.

## Validation Plan
- Start production server on a non-default local port.
- Run `scripts/harness/deployment-check.sh --json`.
- Run `git diff --check`.

## Progress Notes
- Selected from P1: host deployment evidence exists only after a live
  production-mode server passes `/api/health` checks.
- First server start inside the sandbox failed with `EPERM` on local port
  listen; reran with approved local server execution.
- Server started in production mode on `127.0.0.1:4183` using
  `/tmp/masking-app-staging-data-20260513`.

## Closeout
- Captured local production health artifact at
  `release-artifacts/deployment-check-20260513-production-local.json`.
- Deployment check verified `/api/health`, production deployment profile, and
  generic AI capability contract from the live server.
- Validation passed:
  - `scripts/harness/deployment-check.sh --json http://127.0.0.1:4183`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is local production
  health evidence, not final target-host TLS/reverse-proxy/scheduler evidence.
