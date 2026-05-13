# Task: docker-deployment-packaging

## Goal
- Add baseline Docker/Compose packaging so the app has a repeatable packaged
  process runner for local/staging operation.

## Scope
- Dockerfile, Compose file, and dockerignore.
- Packaging contract tests.
- Deployment runbook, production audit, smoke check, and run log.

## Non-goals
- Build or push a remote image.
- Install launchd/systemd service files on a host.
- Add TLS or reverse proxy configuration.
- Replace the current filesystem storage backend.

## Touched areas
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `tests/deploymentPackaging.test.js`
- `scripts/harness/smoke-web.sh`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Accidentally baking runtime `data/` into the image.
- Running as root in the container.
- Treating packaging files as evidence of a real staging deployment.

## Impact Chains

### suspected
- Dockerfile (Dockerfile:1-25) -> server startup (server.js:1-80) -> deployment health check (scripts/harness/deployment-check.mjs:1-70)
- docker-compose.yml (docker-compose.yml:1-18) -> Dockerfile (Dockerfile:1-25) -> data volume `/app/data`

### validated
- Dockerfile (Dockerfile:1-25) -> deployment package contract (tests/deploymentPackaging.test.js:5-14)
  - validation: `node --test tests/deploymentPackaging.test.js`
- docker-compose.yml (docker-compose.yml:1-18) -> data volume `/app/data`
  - validation: `node --test tests/deploymentPackaging.test.js`
- .dockerignore (.dockerignore:1-7) -> image build context exclusions
  - validation: `node --test tests/deploymentPackaging.test.js`

### discarded
- live Docker build
  - reason: packaging contract is validated locally; live build may require
    network/base-image availability and belongs to staging evidence.

## Validation Plan
- `node --test tests/deploymentPackaging.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added Dockerfile, Compose file, and dockerignore for baseline local/staging
  packaged operation.
- Container runs as a non-root `masking` user, exposes `4173`, keeps runtime
  data in `/app/data`, and defines a healthcheck against `/api/health`.
- Compose uses a named `masking_app_data` volume so repository `data/` is not
  implicitly bound into the container.
- Validation passed:
  - `node --test tests/deploymentPackaging.test.js`
  - `docker compose config`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` with 258 passing tests
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is packaging
  validation, not live staging deployment evidence or TLS/reverse-proxy
  coverage.
