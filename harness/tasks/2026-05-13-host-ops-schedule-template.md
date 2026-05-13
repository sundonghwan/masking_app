# Task: host-ops-schedule-template

## Goal
- Provide concrete host scheduler templates for backup, audit retention, and log
  rotation handoff.

## Scope
- Add an operations scheduling document with cron, launchd, and systemd timer
  examples.
- Link it from production boundary and remaining work docs.
- Keep examples explicitly operator-reviewed; do not claim installed scheduler.

## Non-goals
- Installing a scheduler on this machine.
- Selecting the final deployment host.
- Changing app runtime code.

## Touched areas
- `docs/RUNBOOK_OPERATIONS_SCHEDULING.md`
- `docs/PRODUCTION_BOUNDARY_DECISIONS.md`
- `docs/REMAINING_WORK_BOARD.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Examples could be copied blindly with wrong paths.
- Documentation could imply a scheduler is already installed.

## Impact Chains
### suspected
- production boundary checklist -> operations scheduling runbook -> release notes owner/schedule

### validated
- production boundary checklist -> operations scheduling runbook -> release notes owner/schedule
  - validation: `scripts/harness/smoke-web.sh`, `git diff --check`

### discarded
- Host scheduler installation.
  - reason: target host is not selected in this repo session.

## Validation Plan
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Selected from remaining P1: recurring backup/audit/log retention needs a
  host-specific schedule, but the repo can provide concrete templates now.
- Added cron, launchd, systemd, and logrotate-style examples without marking
  any host scheduler as installed.

## Closeout
- Added `docs/RUNBOOK_OPERATIONS_SCHEDULING.md`.
- Linked scheduler template status from production boundary decisions,
  remaining work board, and production readiness audit.
- Validation passed:
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: final scheduler type,
  owner, and host installation are still deployment decisions.
