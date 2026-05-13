# Task: role-browser-e2e

## Goal
- Expand browser E2E coverage from an admin-only happy path to role-specific
  admin, worker, and reviewer UI journeys.

## Scope
- Browser E2E script flow.
- Shared session logout UI exposed from non-login screens.
- Stable project summary selector metadata for browser automation.
- Production readiness audit update.
- Harness run log update.

## Non-goals
- Full visual regression.
- External identity provider.
- Multi-browser matrix.

## Touched areas
- `scripts/harness/browser-e2e.mjs`
- `index.html`
- `src/app.js`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `docs/FEATURE_STATUS.md`
- `harness/commands.md`
- `harness/run_log.md`

## Risks
- Flaky selectors in the real browser workflow.
- Reusing the same fixture image in one project causing wrong row selection.
- Login-only logout action making role switches impossible from the real UI.
- Overclaiming complete production identity coverage.

## Impact Chains

### suspected
- loginAs/logout/openProject (scripts/harness/browser-e2e.mjs:179-202) -> routeToScreen/session controls (src/app.js:474-478,2588-2600)
- browser-e2e admin flow (scripts/harness/browser-e2e.mjs:218-271) -> server auth/project/upload/mask/review/export APIs
- browser-e2e worker flow (scripts/harness/browser-e2e.mjs:273-281) -> upload/mask submit UI
- browser-e2e reviewer flow (scripts/harness/browser-e2e.mjs:283-290) -> review approve UI

### validated
- loginAs/logout/openProject (scripts/harness/browser-e2e.mjs:179-202) -> session logout controls (index.html:49-51,96-99,161-164) -> bindEvents/renderSessionPanel (src/app.js:474-478,2588-2600)
  - validation: `scripts/harness/browser-e2e.sh` passed
- browser-e2e admin flow (scripts/harness/browser-e2e.mjs:218-271) -> server auth/project/upload/mask/review/export APIs
  - validation: `scripts/harness/browser-e2e.sh` passed
- browser-e2e worker flow (scripts/harness/browser-e2e.mjs:273-281) -> upload/mask submit UI
  - validation: `scripts/harness/browser-e2e.sh` passed
- browser-e2e reviewer flow (scripts/harness/browser-e2e.mjs:283-290) -> review approve UI
  - validation: `scripts/harness/browser-e2e.sh` passed

### discarded
- visual regression capture
  - reason: this batch verifies role workflow behavior; screenshot/trace storage
    can be added as the next anti-flake layer.

## Validation Plan
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/browser-e2e.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Browser E2E exposed two product/testability smells:
  - logout was only reachable inside the hidden login screen after login
  - project summary rows had no stable project-id selector
- Fixed by adding shared `data-session-logout` controls to projects,
  dashboard, and workbench, and adding `data-project-id` to project summary
  main buttons.
- Validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` with 252 passing tests
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/browser-e2e.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining follow-up is optional browser
  trace/screenshot artifacts if this role journey becomes flaky.
