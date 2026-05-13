# Task: http-security-boundary

## Goal
- Add baseline HTTP security headers and explicit CORS allowlisting at the Node
  server boundary.

## Scope
- Security header/CORS policy helper.
- Server integration for all responses and CORS preflight.
- Tests, lint/typecheck coverage, smoke reference, deployment/security/audit docs.

## Non-goals
- TLS termination inside Node.
- Cookie-based sessions or CSRF tokens.
- Reverse proxy config for a specific provider.

## Touched areas
- `src/server/httpSecurity.js`
- `server.js`
- `tests/httpSecurity.test.js`
- `package.json`
- `scripts/harness/smoke-web.sh`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- CSP accidentally blocking the browser app.
- CORS policy accidentally opening bearer-token APIs to arbitrary origins.
- Overclaiming TLS/CSRF completion.

## Impact Chains

### suspected
- createHttpSecurityPolicy (src/server/httpSecurity.js:4-18) -> applyHttpSecurityHeaders (src/server/httpSecurity.js:21-32) -> server request boundary (server.js:28-47)
- createHttpSecurityPolicy (src/server/httpSecurity.js:4-18) -> handleCorsPreflight (src/server/httpSecurity.js:34-50) -> server request boundary (server.js:28-47)

### validated
- createHttpSecurityPolicy (src/server/httpSecurity.js:4-18) -> applyHttpSecurityHeaders (src/server/httpSecurity.js:21-32)
  - validation: `node --test tests/httpSecurity.test.js`
- createHttpSecurityPolicy (src/server/httpSecurity.js:4-18) -> handleCorsPreflight (src/server/httpSecurity.js:34-50)
  - validation: `node --test tests/httpSecurity.test.js`

### discarded
- TLS termination implementation
  - reason: TLS should terminate at the reverse proxy or managed platform, not
    inside this dependency-free Node app.
- CSRF token flow
  - reason: current sessions use bearer authorization headers, not cookies.

## Validation Plan
- `node --test tests/httpSecurity.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `scripts/harness/browser-e2e.sh`
- `git diff --check`

## Closeout
- Added baseline response security headers and explicit CORS allowlisting.
- Default deployment remains same-origin only unless
  `MASKING_APP_ALLOWED_ORIGINS` is set.
- CORS preflight succeeds for allowed origins and returns 403 for disallowed
  origins.
- Validation passed:
  - `node --test tests/httpSecurity.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` with 261 passing tests
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/browser-e2e.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: TLS termination and
  reverse proxy configuration are host/platform concerns and still require real
  deployment evidence.
