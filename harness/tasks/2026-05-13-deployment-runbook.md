# Task: deployment-runbook

## Goal
- Add repeatable deployment operation guidance and a health-check harness command
  for local/staging production-like runs.

## Scope
- Document environment variables, startup, health checks, rollback, and log
  inspection.
- Add a read-only deployment health check against a running server.
- Wire the command into harness docs.

## Non-goals
- Add Docker, launchd, systemd, or cloud deployment packaging.
- Add TLS termination or reverse proxy configuration.
- Replace the current Node built-in HTTP server.

## Touched areas
- `docs/RUNBOOK_DEPLOYMENT.md`
- `scripts/harness/deployment-check.*`
- `harness/commands.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- A health endpoint check proves process/API availability, not full product
  correctness.
- Deployment docs must not imply current local bearer sessions are hardened
  production identity.

## Impact Chains

### suspected
- resolveDeploymentProfile (src/server/deploymentProfile.js:6-31) -> server.listen (server.js:64-68) -> routeApi health (src/server/api.js:35-49)

### validated
- resolveDeploymentProfile (src/server/deploymentProfile.js:6-31) -> server.listen (server.js:64-68) -> routeApi health (src/server/api.js:35-49)
  - validation: started server with `MASKING_APP_MODE=staging` on `127.0.0.1:59941` and ran `scripts/harness/deployment-check.sh http://127.0.0.1:59941`.

### discarded
- process manager service file
  - reason: launchd/systemd/Docker packaging depends on the target host choice and is outside this baseline runbook batch.

## Validation Plan
- `scripts/harness/deployment-check.sh <running-url>`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Added deployment health checker as a read-only sensor against a running app.
- Deployment runbook explicitly keeps TLS, reverse proxy, process manager, and
  production identity hardening as follow-up decisions.

## Closeout
- validation passed:
  - `scripts/harness/deployment-check.sh http://127.0.0.1:59941`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/storage-verify.sh data`
  - `git diff --check`
- code review found no blocking issue after checking health payload validation,
  startup/rollback docs, and explicit production constraints.
