# Task: production-gate

## Goal
- Add an executable production gate for the remaining identity and filesystem
  deployment constraints.

## Scope
- Production gate CLI and shell wrapper.
- Shared local identity security audit and production startup safety core.
- Server startup enforcement for `MASKING_APP_MODE=production`.
- Tests for failing unsafe defaults and passing explicit production acceptance.
- Tests for production startup safety skip/fail/pass paths.
- Package script, syntax coverage, smoke references, deployment/security docs,
  production audit, and run log.

## Non-goals
- Add an external identity provider.
- Replace filesystem metadata storage with a database.
- Install host TLS, reverse proxy, scheduler, launchd, or systemd files.

## Touched areas
- `scripts/harness/production-gate.mjs`
- `scripts/harness/production-gate.sh`
- `src/server/securityAudit.js`
- `src/server/productionSafety.js`
- `server.js`
- `tests/productionGate.test.js`
- `tests/productionSafety.test.js`
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
- checkProductionGate (scripts/harness/production-gate.mjs) -> checkProductionSafety (src/server/productionSafety.js) -> checkLocalIdentitySecurity (src/server/securityAudit.js)
- server startup (server.js) -> assertProductionStartupSafety (src/server/productionSafety.js) -> checkLocalIdentitySecurity (src/server/securityAudit.js)

### validated
- checkProductionGate (scripts/harness/production-gate.mjs) -> checkProductionSafety (src/server/productionSafety.js) -> checkLocalIdentitySecurity (src/server/securityAudit.js)
  - validation: `node --test tests/productionGate.test.js`
- server startup (server.js) -> assertProductionStartupSafety (src/server/productionSafety.js) -> checkLocalIdentitySecurity (src/server/securityAudit.js)
  - validation: `node --test tests/productionSafety.test.js`

### discarded
- external IdP or database replacement
  - reason: this task blocks unsafe production-mode startup and release checks;
    it does not replace identity/storage architecture.

## Validation Plan
- `node --test tests/productionGate.test.js`
- `node --test tests/productionSafety.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `scripts/harness/browser-e2e.sh`
- `git diff --check`

## Closeout
- Added `scripts/harness/production-gate.sh` and `.mjs` for production-mode
  release checks.
- Added shared production safety and local identity audit modules under
  `src/server/`, then wired `server.js` to fail production-mode startup before
  listening when safety checks fail.
- Gate fails when production mode is not set, filesystem production acceptance
  is missing, data root is inside the repository, or strict identity security
  checks fail.
- Added tests for unsafe local defaults and a passing production-mode fixture
  with hashed identity and explicit filesystem acceptance.
- Added tests for production startup skip/fail/pass behavior.
- Updated package scripts, syntax coverage, smoke references, command docs,
  deployment runbook, security plan, and production audit.
- Validation passed:
  - `node --test tests/productionGate.test.js`
  - `node --test tests/productionSafety.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (`273` tests)
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/browser-e2e.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that the gate is explicitly
  pre-release/deployment validation and startup enforcement, not a replacement
  for external IdP, TLS, host scheduler installation, or transactional storage.
