# Task: local-identity-production-acceptance

## Goal
- Require explicit operator acceptance before production-mode startup or
  production gate can use the local filesystem identity provider.

## Scope
- Add `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` production safety check.
- Update production safety/gate tests and staging evidence tests/fixtures.
- Document the env var in security, deployment, commands, and production audit
  docs.

## Non-goals
- Implement an external identity provider.
- Change local/staging default login behavior.
- Change password hashing, session storage, or RBAC semantics.

## Touched areas
- `src/server/productionSafety.js`
- `tests/productionSafety.test.js`
- `tests/productionGate.test.js`
- `tests/stagingEvidence.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/commands.md`
- `harness/run_log.md`

## Risks
- Existing production-mode commands need the new env var.
- The change must not affect local/staging startup.
- The docs must not imply local identity equals a full external IDP.

## Impact Chains

### suspected
- checkProductionSafety (src/server/productionSafety.js:17-62) -> checkProductionGate (scripts/harness/production-gate.mjs:19-36) -> production startup/gate failure before listen
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:33-80) -> production-gate JSON command -> staging evidence required step

### validated
- checkProductionSafety (src/server/productionSafety.js:17-68) -> checkProductionGate (scripts/harness/production-gate.mjs:19-36) -> production startup/gate failure before listen
  - validation: `node --test tests/productionSafety.test.js tests/productionGate.test.js tests/stagingEvidence.test.js`
- collectStagingEvidence (scripts/harness/staging-evidence.mjs:33-80) -> production-gate JSON command -> staging evidence required step
  - validation: manual staging evidence CLI fixture with `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1`

### discarded
- Browser login flow
  - reason: this change only affects forced production-mode safety checks.

## Validation Plan
- RED/GREEN: `node --test tests/productionSafety.test.js tests/productionGate.test.js tests/stagingEvidence.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` as an explicit
  production safety requirement whenever the local filesystem identity provider
  is used in forced/production-mode checks.
- Updated production gate, production startup safety, and staging evidence tests
  to require/pass the new acceptance.
- Updated command docs and production/security runbooks so operators do not
  treat local identity as silently production-ready.
- Validation passed:
  - RED/GREEN: `node --test tests/productionSafety.test.js tests/productionGate.test.js tests/stagingEvidence.test.js`
  - manual `scripts/harness/staging-evidence.sh --json` fixture run with
    production mode, filesystem acceptance, local identity acceptance, and
    hashed local identity
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is explicit
  acceptance, not an external identity provider; internet-facing deployment
  should still prefer external identity.
