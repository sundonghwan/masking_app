# Task: backend-playbook-mask-validation-refresh

## Goal
- Refresh stale harness documentation that still described backend mask validation as header-only.

## Scope
- `harness/repo_index.md`
- `harness/playbooks/backend.md`
- `harness/run_log.md`

## Non-goals
- Code changes.
- New validation logic.
- Historical task document rewrites.

## Touched areas
- Harness repository map and backend playbook.

## Risks
- Overclaiming support beyond non-interlaced 8-bit grayscale PNG masks.
- Rewriting historical task notes that should remain as history.

## Impact Chains
### suspected
- None remaining.

### validated
- backend validation docs (harness/repo_index.md:45-51, harness/playbooks/backend.md:19-26) -> future backend work intake

### discarded
- Historical task logs.
  - reason: older task files record past state and should not be rewritten as current guidance.

## Validation Plan
- `rg -n "full binary|pixel validation|0/255|IDAT|not full|later dependency" harness/repo_index.md harness/playbooks/backend.md`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Found stale current-state guidance after reading backend playbook during code-health work. Architecture and feature-status docs already describe full backend PNG binary mask validation as active.
- Updated current-state guidance to say the backend validates decoded binary pixels only for supported non-interlaced 8-bit grayscale PNG masks.

## Closeout
- `rg -n "not full|later dependency|not yet fully decode|header-only|format only" harness/repo_index.md harness/playbooks/backend.md` returned no stale current-state matches.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issue. Checked that historical task files were left unchanged and current docs do not overclaim beyond supported non-interlaced 8-bit grayscale PNG masks.
