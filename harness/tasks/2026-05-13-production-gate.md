# Task: production-gate

## Goal
- Add an executable production gate for the remaining identity and filesystem
  deployment constraints.

## Scope
- Production gate CLI and shell wrapper.
- Tests for failing unsafe defaults and passing explicit production acceptance.
- Package script, syntax coverage, smoke references, deployment/security docs,
  production audit, and run log.

## Non-goals
- Add an external identity provider.
- Replace filesystem metadata storage with a database.
- Install host TLS, reverse proxy, scheduler, launchd, or systemd files.

## Touched areas
- `scripts/harness/production-gate.mjs`
- `scripts/harness/production-gate.sh`
- `tests/productionGate.test.js`
- `package.json`
- `scripts/harness/check-syntax.mjs`
- `scripts/harness/smoke-web.sh`
- `harness/commands.md`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Treating an explicit filesystem acceptance flag as a full production database
  replacement.
- Failing production mode because a local/staging command is run with defaults.
- Overclaiming security readiness while external IdP, TLS, and host scheduler
  are still deployment decisions.

## Impact Chains

### suspected
- checkProductionGate (scripts/harness/production-gate.mjs:21-72) -> resolveDeploymentProfile (src/server/deploymentProfile.js) -> checkSecurity (scripts/harness/security-check.mjs)

### validated
- checkProductionGate (scripts/harness/production-gate.mjs:21-72) -> resolveDeploymentProfile (src/server/deploymentProfile.js) -> checkSecurity (scripts/harness/security-check.mjs)
  - validation: `node --test tests/productionGate.test.js`

### discarded
- runtime server startup
  - reason: this gate is a pre-release/deployment harness command; it does not
    change `npm run dev` or server startup behavior.

## Validation Plan
- `node --test tests/productionGate.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added `scripts/harness/production-gate.sh` and `.mjs` for production-mode
  release checks.
- Gate fails when production mode is not set, filesystem production acceptance
  is missing, data root is inside the repository, or strict identity security
  checks fail.
- Added tests for unsafe local defaults and a passing production-mode fixture
  with hashed identity and explicit filesystem acceptance.
- Updated package scripts, syntax coverage, smoke references, command docs,
  deployment runbook, security plan, and production audit.
- Validation passed:
  - `node --test tests/productionGate.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (`269` tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that the gate is explicitly
  pre-release/deployment validation, not a replacement for external IdP, TLS,
  host scheduler installation, or transactional storage.
