# Task: hardcoded-debt-audit

## Goal

- Audit remaining hardcoded/default values and convert feature-blocking items
  into explicit development work.

## Scope

- Review runtime defaults, MVP auth, assignment defaults, upload policy, magic
  tool defaults, project fallbacks, local storage/export fallback, and session
  storage.
- Update `docs/FEATURE_STATUS.md` with hardcoded runtime debt and recommended
  feature development order.

## Non-goals

- Implement user directory, settings, or persistence features.
- Remove fallbacks in this audit task.

## Touched Areas

- `docs/FEATURE_STATUS.md`
- `harness/tasks/2026-04-30-hardcoded-debt-audit.md`
- `harness/run_log.md`

## Risks

- Treating safe local development defaults as urgent product debt.
- Missing hardcoded values that are feature blockers.

## Impact Chains

### suspected

- None. Documentation/audit-only task.

### validated

- `runtimeDefaults/auth/storage/upload/magic/server evidence` -> `docs/FEATURE_STATUS.md`
  - validation: `rg` evidence check for `MVP_PASSWORDS`, `DEFAULT_PROJECT`,
    `DEFAULT_ACTORS`, `UPLOAD_POLICY`, `PORT`, `DEFAULT_ROOT_DIR`,
    `MAGIC_DEFAULTS`, and `sessions` matched the documented rows.

### discarded

- Code changes.
  - reason: this task classifies debt and feature work only.

## Validation Plan

- `rg` evidence check for documented hardcoded areas.
- `git diff --check`.
- `./scripts/harness/smoke-web.sh`.

## Progress Notes

- Expanded `docs/FEATURE_STATUS.md` with nine hardcoded runtime debt rows.
- Added seven feature development items ordered by dependency and product value.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit and push completed: `ea24af3 Document hardcoded runtime debt`.
