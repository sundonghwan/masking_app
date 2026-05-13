# Task: password-hash-storage

## Goal
- Stop storing newly seeded, created, or rotated local MVP account passwords as
  plaintext while preserving login compatibility with legacy plaintext files.

## Scope
- PBKDF2 password hashing helper.
- User directory seed/create/update/validate behavior.
- Tests proving public users omit passwords and stored records use
  `password_hash`.
- Security and readiness documentation updates.

## Non-goals
- Automatic in-place migration of the existing `data/identity/users.json`.
- Password reset workflow.
- External identity provider integration.

## Touched areas
- `src/server/passwords.js`
- `src/server/userDirectory.js`
- `tests/userDirectory.test.js`
- `package.json`
- `scripts/harness/smoke-web.sh`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Breaking login for default seed accounts.
- Breaking admin-created user login.
- Accidentally removing compatibility with existing plaintext identity files.

## Impact Chains

### suspected
- createUserDirectory.ensureSeeded (src/server/userDirectory.js:14-28) -> normalizeStoredUser (src/server/userDirectory.js:159-172) -> hashPassword (src/server/passwords.js:8-15)
- createUserDirectory.validateCredentials (src/server/userDirectory.js:91-97) -> verifyPassword (src/server/passwords.js:16-20)
- createUserDirectory.updateUser (src/server/userDirectory.js:64-76) -> normalizeUpdatedUser (src/server/userDirectory.js:178-202) -> normalizeStoredUser (src/server/userDirectory.js:159-172)

### validated
- createUserDirectory.ensureSeeded (src/server/userDirectory.js:14-28) -> normalizeStoredUser (src/server/userDirectory.js:159-172) -> hashPassword (src/server/passwords.js:8-15)
  - validation: `tests/userDirectory.test.js` verifies seed users store `password_hash` and omit `password`.
- createUserDirectory.validateCredentials (src/server/userDirectory.js:91-97) -> verifyPassword (src/server/passwords.js:16-20)
  - validation: `tests/userDirectory.test.js` and server login tests verify default and created users still authenticate.

### discarded
- automatic migration of existing `data/identity/users.json`
  - reason: data-root mutation needs explicit operator action and backup.

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
  - `scripts/harness/security-check.sh --strict data` still fails because the
    existing local `data/identity/users.json` has legacy default plaintext
    accounts. New seed/create/update paths now write `password_hash`.
- code review found no blocking issue after checking default login remains
  compatible, admin-created users authenticate, stored public records omit
  `password`, and existing data is not mutated without an operator backup.
