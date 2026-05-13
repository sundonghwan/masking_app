# Task: security-hardening-plan

## Goal
- Document the current MVP security boundary and hardening sequence before
  making the app network-exposed.

## Scope
- Current auth/session/user-directory constraints.
- Hard stops for public deployment.
- Recommended hardening order and production acceptance criteria.
- Update production readiness audit.

## Non-goals
- Implement password hashing or IdP integration in this batch.
- Add CORS/CSRF/TLS code.

## Touched areas
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Overclaiming security maturity.
- Hiding plaintext password/session-token constraints.

## Impact Chains

### suspected
- validateDirectoryCredentials (src/server/auth.js:15-18) -> createUserDirectory (src/server/userDirectory.js:8-109) -> createSessionStore (src/server/sessionStore.js:8-76)

### validated
- validateDirectoryCredentials (src/server/auth.js:15-18) -> createUserDirectory (src/server/userDirectory.js:8-109) -> createSessionStore (src/server/sessionStore.js:8-76)
  - validation: direct code review and existing auth/session tests via `scripts/harness/test-target.sh`.

### discarded
- external identity provider implementation
  - reason: requires deployment identity decision and is intentionally deferred.

## Validation Plan
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- code review found no blocking issue after checking that the document does not
  overclaim current MVP auth and explicitly lists default password, plaintext
  storage, session token, CORS/CSRF, and TLS gaps.
