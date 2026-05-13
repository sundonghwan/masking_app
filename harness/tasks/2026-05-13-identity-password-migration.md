# Task: identity-password-migration

## Goal
- Provide an explicit, backup-producing migration path from legacy plaintext
  `identity/users.json` passwords to `password_hash`.

## Scope
- Dry-run and apply migration script.
- Backup creation before mutating identity data.
- Tests for dry-run immutability and applied migration.
- Command and security documentation updates.

## Non-goals
- Automatically mutate the active local `data/` directory.
- Add password reset or first-login force-change UX.
- Remove compatibility with legacy plaintext records before migration.

## Touched areas
- `scripts/harness/identity-migrate-passwords.*`
- `tests/identityMigratePasswords.test.js`
- `package.json`
- `scripts/harness/smoke-web.sh`
- `harness/commands.md`
- `docs/SECURITY_HARDENING_PLAN.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Accidentally mutating real local identity data.
- Losing credentials during migration.
- Making strict security check appear resolved without operator action.

## Impact Chains

### suspected
- identity-migrate-passwords CLI (scripts/harness/identity-migrate-passwords.mjs:1-95) -> hashPassword (src/server/passwords.js:8-15) -> identity/users.json
- security-check CLI (scripts/harness/security-check.mjs:1-115) -> identity/users.json

### validated
- identity-migrate-passwords CLI (scripts/harness/identity-migrate-passwords.mjs:1-95) -> hashPassword (src/server/passwords.js:8-15) -> identity/users.json
  - validation: `tests/identityMigratePasswords.test.js` verifies dry-run does not mutate, apply removes `password`, writes `password_hash`, and creates a backup.

### discarded
- applying migration to `data/identity/users.json`
  - reason: real data mutation requires explicit operator approval and backup.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/identity-migrate-passwords.sh data`
- `scripts/harness/security-check.sh data`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/identity-migrate-passwords.sh data`
  - `scripts/harness/security-check.sh data`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- dry-run against current local `data/` reported `migrated=3`, `skipped=0`
  and did not apply changes.
- code review found no blocking issue after checking that apply mode writes a
  timestamped backup before replacing `users.json`, dry-run is non-mutating, and
  the active local data root is not changed by this task.
