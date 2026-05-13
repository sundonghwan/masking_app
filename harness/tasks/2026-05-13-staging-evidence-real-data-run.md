# Task: staging-evidence-real-data-run

## Goal
- Run the staging evidence bundle against a representative copied data root and
  capture the JSON artifact.

## Scope
- Copy the current ignored `data/` directory to a temporary staging data root
  outside the repository.
- Run `scripts/harness/staging-evidence.sh --json --output`.
- Inspect the resulting JSON for production blockers.
- Update progress docs with the evidence result.

## Non-goals
- Mutating the active local `data/` directory.
- Installing host TLS, scheduler, or reverse proxy.
- Claiming production readiness if the evidence run fails.

## Touched areas
- `harness/tasks/2026-05-13-staging-evidence-real-data-run.md`
- `harness/run_log.md`
- `docs/REMAINING_WORK_BOARD.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Evidence may fail due to expected production gate blockers.
- Evidence artifact may include machine-local paths and should be reviewed
  before committing or sharing.

## Impact Chains
### suspected
- staging-evidence wrapper (scripts/harness/staging-evidence.sh:1-1) -> collectStagingEvidence (scripts/harness/staging-evidence.mjs:41-90) -> production gate evidence

### validated
- staging-evidence wrapper (scripts/harness/staging-evidence.sh:1-1) -> collectStagingEvidence (scripts/harness/staging-evidence.mjs:41-90) -> production gate evidence
  - validation: `staging-evidence.sh --json --output` passed on copied data root after identity migration

### discarded
- Browser deployment health.
  - reason: this batch does not start a long-running staging server; it focuses
    on data-root evidence.

## Validation Plan
- Run staging evidence with production env flags against a `/tmp` data-root copy.
- Inspect JSON artifact summary.
- Run `git diff --check`.

## Progress Notes
- Current `data/` contains representative rail image files but is ignored by
  git and inside the repo, so it is copied outside the repo before running the
  production-style data-root gate.
- First evidence run on the copied data root failed only at `production_gate`
  because copied `identity/users.json` still had default plaintext seed
  passwords.
- Applied `identity-migrate-passwords.sh --apply` to the copied data root only.
- `security-check.sh --strict` and `production-gate.sh` then passed on the
  copied data root.

## Closeout
- Captured passing evidence artifact at
  `release-artifacts/staging-evidence-20260513-after-identity-migration.json`.
- Passing evidence covers storage verification, audit verification, audit
  retention dry-run, capacity profile, backup creation, restore rehearsal, and
  production gate on the copied data root.
- Validation passed:
  - `scripts/harness/identity-migrate-passwords.sh --json /tmp/masking-app-staging-data-20260513`
  - `scripts/harness/identity-migrate-passwords.sh --apply --json /tmp/masking-app-staging-data-20260513`
  - `scripts/harness/security-check.sh --strict /tmp/masking-app-staging-data-20260513`
  - `MASKING_APP_MODE=production MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 scripts/harness/production-gate.sh /tmp/masking-app-staging-data-20260513`
  - `MASKING_APP_MODE=production MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 scripts/harness/staging-evidence.sh --json --output /tmp/masking-app-staging-evidence-20260513-after-identity-migration.json /tmp/masking-app-staging-data-20260513 /tmp/masking-app-staging-backups-20260513`
- Remaining risk: this proves the current representative copy can pass after
  password migration; final production release still needs the same evidence on
  the final target data root and host.
