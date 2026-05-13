# Task: session-ttl-config

## Goal
- Make local bearer session lifetime configurable for deployment profiles.

## Scope
- Session store default TTL configuration.
- Deployment profile health payload field.
- Tests for configured TTL.
- Command/security documentation updates.

## Non-goals
- Cookie sessions.
- Session rotation on every request.
- CSRF policy.

## Touched areas
- `src/server/sessionStore.js`
- `src/server/deploymentProfile.js`
- `tests/sessionStore.test.js`
- `harness/commands.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `harness/run_log.md`

## Risks
- Accidentally changing default 24-hour session behavior.
- Accepting invalid TTL values.
- Exposing sensitive session tokens in health payload.

## Impact Chains

### suspected
- createSessionStore (src/server/sessionStore.js:8-75) -> createSession (src/server/sessionStore.js:13-34) -> readSession (src/server/sessionStore.js:35-49)
- resolveDeploymentProfile (src/server/deploymentProfile.js:6-33) -> publicDeploymentProfile (src/server/deploymentProfile.js:36-44) -> /api/health

### validated
- createSessionStore (src/server/sessionStore.js:8-75) -> createSession (src/server/sessionStore.js:13-34) -> readSession (src/server/sessionStore.js:35-49)
  - validation: `tests/sessionStore.test.js` verifies configured default TTL changes `expires_at`.

### discarded
- cookie session implementation
  - reason: needs CSRF policy first.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- code review found no blocking issue after checking the 24-hour default is
  preserved, invalid deployment TTL values are rejected, and `/api/health`
  exposes only TTL metadata rather than session tokens.
