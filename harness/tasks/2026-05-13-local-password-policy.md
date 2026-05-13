# Task: local-password-policy

## Goal
- Add a minimal password policy for local filesystem users so new or rotated
  credentials cannot be trivially weak.

## Scope
- Validate local user passwords during user creation and password rotation.
- Add focused user-directory tests for weak password rejection.
- Document the local policy in security/deployment docs.

## Non-goals
- Add password reset, invite, MFA, lockout, or external identity provider.
- Change seeded MVP bootstrap passwords in this batch.
- Change login/session semantics.

## Touched areas
- `src/server/userDirectory.js`
- `tests/userDirectory.test.js`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Blocking existing local MVP seed/bootstrap credentials.
- Breaking account admin create/update workflows.
- Overclaiming this as production-grade password management.

## Impact Chains

### suspected
- createUser (src/server/userDirectory.js:49-66) -> normalizeStoredUser (src/server/userDirectory.js:164-173) -> hashPassword (src/server/passwords.js:8-15)
- updateUser (src/server/userDirectory.js:69-82) -> normalizeUpdatedUser (src/server/userDirectory.js:181-199) -> normalizeStoredUser (src/server/userDirectory.js:164-173)

### validated
- createUser (src/server/userDirectory.js:49-67) -> validatePasswordPolicy (src/server/userDirectory.js:209-220) -> hashPassword (src/server/passwords.js:8-15)
  - validation: `node --test tests/userDirectory.test.js`
- updateUser (src/server/userDirectory.js:70-83) -> normalizeUpdatedUser (src/server/userDirectory.js:182-200) -> validatePasswordPolicy (src/server/userDirectory.js:209-220)
  - validation: `node --test tests/userDirectory.test.js`, `node --test tests/serverApi.test.js`

### discarded
- Session validation
  - reason: this change validates new/rotated credentials only; login
    verification remains unchanged.

## Validation Plan
- RED/GREEN: `node --test tests/userDirectory.test.js`
- `node --test tests/serverApi.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added a minimal local password policy for user creation and password rotation:
  at least 8 characters, with letters plus a number or symbol.
- Existing seed/bootstrap credentials still work; this batch only affects new
  and rotated local user credentials.
- Validation passed:
  - RED/GREEN: `node --test tests/userDirectory.test.js`
  - `node --test tests/serverApi.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is a minimum local
  policy, not password reset, lockout, MFA, or an external identity provider.
