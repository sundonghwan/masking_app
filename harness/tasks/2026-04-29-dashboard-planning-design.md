# Task: dashboard-planning-design

## Goal

- Define the operational dashboard scope, audience, data contract, screen
  placement, risks, and implementation sequence before adding another app page.

## Scope

- Create a repo-specific dashboard design document.
- Align the dashboard with existing project/workbench/review/export flows.
- Mark dashboard planning/design as complete in feature status and checkpoints.
- Record validation and review evidence.

## Non-goals

- Dashboard UI implementation.
- New API endpoint.
- Chart library or analytics warehouse.
- Worker-specific dashboard variant.

## Touched Areas

- `docs/DASHBOARD_DESIGN.md`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `docs/superpowers/specs/2026-04-29-operations-revision-editor-roadmap-design.md`
- `harness/run_log.md`

## Risks

- Dashboard could duplicate workbench editing/review controls.
- Dashboard metrics could diverge from export validation logic.
- The first dashboard could become overbuilt analytics instead of an
  operational queue summary.
- Login could drift back into the workbench/dashboard shell.

## Impact Chains

### suspected

- None. Documentation/design-only task.

### validated

- `docs/ARCHITECTURE.md` -> `docs/DASHBOARD_DESIGN.md` -> `docs/FEATURE_STATUS.md`
  - validation: local context read; dashboard design maps to current manifest,
    export, review, assignment, and logging sources.

### discarded

- Dashboard implementation.
  - reason: requested item is planning/design; implementation remains a future
    development phase after the design contract is accepted.

## Validation Plan

- `rg "Dashboard planning and design|Operations Dashboard|DASHBOARD_DESIGN" docs harness`
- `git diff --check`
- Documentation review against `harness/checklists/review.md`.

## Progress Notes

- Created `docs/DASHBOARD_DESIGN.md` with dashboard audience, objective, screen
  placement, data sources, information architecture, view-model contract,
  implementation phases, validation plan, risks, and open questions.
- Marked dashboard planning/design complete in feature status and development
  checkpoints.
- Kept dashboard implementation as future hardening so the current page count
  does not expand before the design contract is reviewed.
- Validation passed: dashboard references were found across docs/harness,
  `git diff --check` passed, and `./scripts/harness/smoke-web.sh` passed.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit and push completed: `f9d436e Add dashboard planning design`.
