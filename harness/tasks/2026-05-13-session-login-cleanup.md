# Task: session-login-cleanup

## Goal
- Run expired-session cleanup during successful login so filesystem bearer
  session files do not accumulate indefinitely during normal use.

## Scope
- Call `sessionStore.cleanupExpiredSessions()` from the login/session creation
  path when the store supports it.
- Keep login available if cleanup fails; log the cleanup failure without
  exposing credentials or tokens.
- Add server API regression tests and update security docs.

## Non-goals
- Add session rotation across all active devices.
- Add lockout, password reset, MFA, or external identity provider behavior.
- Change session token or TTL format.

## Touched areas
- `src/server/api.js`
- `tests/serverApi.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Blocking login when cleanup encounters filesystem errors.
- Logging sensitive session or credential data.

## Impact Chains

### suspected
- routeApi login (src/server/api.js:69-82) -> createSession (src/server/api.js:934-949) -> sessionStore.createSession (src/server/sessionStore.js:13-31)
- createSession (src/server/api.js:934-949) -> sessionStore.cleanupExpiredSessions (src/server/sessionStore.js:49-72)

### validated
- routeApi login (src/server/api.js:69-82) -> createSession (src/server/api.js:934-950) -> sessionStore.createSession (src/server/sessionStore.js:13-31)
  - validation: `node --test tests/serverApi.test.js`
- createSession (src/server/api.js:934-950) -> cleanupExpiredSessionsForLogin (src/server/api.js:952-962) -> sessionStore.cleanupExpiredSessions (src/server/sessionStore.js:58-80)
  - validation: `node --test tests/serverApi.test.js`

### discarded
- Cleanup failure blocks login
  - reason: cleanup is operational hygiene; credential login should remain
    available and emit `session.cleanup.failed` instead.

## Validation Plan
- RED/GREEN: `node --test tests/serverApi.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Login now attempts expired persisted-session cleanup before creating a new
  persistent session when the session store exposes cleanup support.
- Cleanup failure logs `session.cleanup.failed` with sanitized error context and
  does not block credential login.
- Validation passed:
  - RED/GREEN: `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: session rotation policy
  and non-expired session retention windows are still separate production
  decisions.
