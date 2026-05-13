# Task: password-policy-helper-refactor

## Goal
- Extract the local password policy check from `userDirectory.js` into a focused
  helper module so the identity boundary stays small and testable.

## Scope
- Add a focused password policy test.
- Move policy validation into `src/server/passwordPolicy.js`.
- Keep user creation and password rotation behavior unchanged.
- Update run log and feature status context for the cleanup batch.

## Non-goals
- Change password strength requirements.
- Add password reset, lockout, MFA, or external identity provider behavior.
- Change seeded MVP account compatibility.

## Touched areas
- `src/server/passwordPolicy.js`
- `src/server/userDirectory.js`
- `tests/passwordPolicy.test.js`
- `tests/checkSyntax.test.js`
- `scripts/harness/check-syntax.mjs`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Accidentally changing the public API error shape for account creation/update.
- Accidentally applying policy to existing seeded bootstrap passwords.

## Impact Chains

### suspected
- createUser (src/server/userDirectory.js:49-67) -> validatePasswordPolicy (src/server/userDirectory.js:209-220) -> hashPassword (src/server/passwords.js:8-15)
- updateUser (src/server/userDirectory.js:70-83) -> normalizeUpdatedUser (src/server/userDirectory.js:176-201) -> validatePasswordPolicy (src/server/userDirectory.js:209-220)

### validated
- createUser (src/server/userDirectory.js:50-69) -> validatePasswordPolicy (src/server/passwordPolicy.js:1-12) -> hashPassword (src/server/passwords.js:8-15)
  - validation: `node --test tests/passwordPolicy.test.js tests/userDirectory.test.js tests/checkSyntax.test.js`
- updateUser (src/server/userDirectory.js:71-83) -> normalizeUpdatedUser (src/server/userDirectory.js:177-202) -> validatePasswordPolicy (src/server/passwordPolicy.js:1-12)
  - validation: `node --test tests/passwordPolicy.test.js tests/userDirectory.test.js tests/checkSyntax.test.js`

### discarded
- Password policy strength change
  - reason: this batch extracts the existing local policy unchanged.

## Validation Plan
- RED/GREEN: `node --test tests/passwordPolicy.test.js`
- Regression: `node --test tests/userDirectory.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Extracted the local password policy into `src/server/passwordPolicy.js`.
- Kept `userDirectory` create/update behavior and `weak_password` error shape
  unchanged.
- Added focused password-policy tests and kept user-directory regression tests.
- Added the new helper to the syntax check harness file list.
- Validation passed:
  - RED/GREEN: `node --test tests/passwordPolicy.test.js`
  - `node --test tests/passwordPolicy.test.js tests/userDirectory.test.js tests/checkSyntax.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: this is a code-health
  extraction only; stronger password requirements remain a separate product and
  security decision.
