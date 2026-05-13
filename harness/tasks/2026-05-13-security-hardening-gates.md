# Task: security-hardening-gates

## Goal
- Turn the first security hardening items into executable gates: crypto session
  tokens and default-password/plaintext-password detection.

## Scope
- Session token generation.
- Security check harness script.
- Tests for token shape and strict security checks.
- Command and readiness documentation updates.

## Non-goals
- Password hash migration.
- External identity provider integration.
- CSRF/CORS/TLS implementation.

## Touched areas
- `src/server/sessionToken.js`
- `src/server/sessionStore.js`
- `src/server/api.js`
- `scripts/harness/security-check.*`
- `tests/sessionStore.test.js`
- `tests/securityCheck.test.js`
- `package.json`
- `harness/commands.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Breaking existing bearer session login.
- Making local development unusable by failing on first-run seed accounts.
- Overclaiming production auth before password hashing exists.

## Impact Chains

### suspected
- createSession (src/server/sessionStore.js:13-34) -> createSessionToken (src/server/sessionToken.js:5-7) -> readSession (src/server/sessionStore.js:35-49)
- createSession (src/server/api.js:934-946) -> createSessionToken (src/server/sessionToken.js:5-7) -> publicSession (src/server/api.js:948-956)
- security-check CLI (scripts/harness/security-check.mjs:1-115) -> LOCAL_MVP_USER_ACCOUNTS (src/server/auth.js:3-7) -> identity/users.json

### validated
- createSession (src/server/sessionStore.js:13-34) -> createSessionToken (src/server/sessionToken.js:5-7) -> readSession (src/server/sessionStore.js:35-49)
  - validation: `tests/sessionStore.test.js` token format and uniqueness checks.
- security-check CLI (scripts/harness/security-check.mjs:1-115) -> LOCAL_MVP_USER_ACCOUNTS (src/server/auth.js:3-7) -> identity/users.json
  - validation: `tests/securityCheck.test.js` strict default/plaintext detection checks.

### discarded
- password hash migration
  - reason: requires data migration and login compatibility plan; keep as the
    next security hardening batch.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/security-check.sh data`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/security-check.sh data`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- expected strict security gate result:
  - `scripts/harness/security-check.sh --strict data` failed because current
    local data still has `admin`, `worker`, and `reviewer` default plaintext
    passwords. This confirms the deployment gate detects the known blocker.
- code review found no blocking issue after checking token generation is
  centralized in `src/server/sessionToken.js`, local development remains usable
  in relaxed mode, and strict mode fails on known unsafe identity files.
