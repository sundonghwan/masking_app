# Task: dashboard-layout-regression

## Goal

- Fix the broken dashboard layout after the 12-feature batch.

## Scope

- Dashboard CSS layout contract.
- Frontend contract test for dashboard width/grid behavior.

## Non-goals

- Redesigning dashboard content or metrics.
- Changing dashboard data model.

## Risks

- Dashboard inherits generic screen panel width and breaks three-column layout.
- Shared `.review-actions` and `.panel-section` styles can leak into dashboard.

## Impact Chains

### suspected

- `dashboardScreen (index.html:71-110) -> .screen-panel (src/styles.css:69-77) -> .dashboard-layout (src/styles.css:1045-1062)`

### validated

- `dashboardScreen (index.html:71-110) -> .dashboard-panel (src/styles.css:82-99) -> .compact-dashboard (src/styles.css:1064-1075)`
  - validation: browser visual check at `http://localhost:4173/#/dashboard`; `tests/appContracts.test.js`; `scripts/harness/lint-all.sh`; `scripts/harness/test-target.sh`

### discarded

- Dashboard data/rendering bug.
  - reason: Browser accessibility tree contained all expected dashboard data; visual break was caused by CSS width inheritance.

## Validation Plan

- Browser reload dashboard and visually confirm no overlapping columns.
- `node --test tests/appContracts.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/test-target.sh`

## Findings

- Root cause: `.dashboard-panel` inherited `.screen-panel { width: min(520px, 100%) }`, while dashboard content expected a three-column grid.
- Fix: define dashboard-specific panel width, heading action layout, compact dashboard grid padding, and section containment.

## Closeout

- [x] Root cause identified before fix.
- [x] Browser visual check completed.
- [x] Contract test added.
