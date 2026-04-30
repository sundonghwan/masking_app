# Task: worker-d-discovery-ux

## Goal

- Improve discovery UX by adding image search, `not_started` and sync-needed image filters, and removing the hard project list limit with full project discovery behavior.

## Scope

- In scope: project/image discovery controls and contract tests for the browser app.
- Write scope: `index.html`, `src/app.js`, `src/styles.css`, `tests/appContracts.test.js`; `src/dashboard/summary.js` and `tests/dashboardSummary.test.js` only if needed.

## Non-goals

- Do not edit workbench topbar navigation buttons.
- Do not change mask editing, save/load/export contracts, backend storage, upload, or sync APIs.
- Do not commit or push.

## Touched Areas

- `index.html`
- `src/app.js`
- `src/styles.css`
- `tests/appContracts.test.js`

## Risks

- Discovery filters could hide the active image unexpectedly.
- Search state could make an empty project appear broken if there is no empty-state copy.
- Project discovery could regress by showing only the first four projects.

## Impact Chains

### suspected

- `renderImageList (src/app.js:1244-1282)` -> image queue DOM in `index.html:159-178`
- `renderProjectSummaries (src/app.js:1298-1335)` -> project list DOM in `index.html:67-71`

### validated

- `renderImageList (src/app.js:1244-1282)` -> image queue DOM in `index.html:159-178`
  - validation: `scripts/harness/test-target.sh appContracts`
- `renderProjectSummaries (src/app.js:1298-1335)` -> project list DOM in `index.html:67-71`
  - validation: `scripts/harness/test-target.sh appContracts`

### discarded

- None yet.

## Validation Plan

- `scripts/harness/test-target.sh appContracts` -> focused contract coverage for discovery controls and project list behavior.
- `scripts/harness/lint-all.sh` -> syntax checks for changed frontend modules.
- `scripts/harness/typecheck-all.sh` -> current syntax-level typecheck.

## Progress Notes

- Worker D owns discovery UX only. Existing dirty harness changes from other work must not be reverted.
- Added image status filters for `not_started` and sync-needed, plus an image search input.
- Replaced the project summary `slice(0, 4)` behavior with full-list rendering and project search.
- Observed concurrent/topbar navigation edits in `index.html`, `src/app.js`, and `tests/appContracts.test.js`; left them intact and did not claim ownership.

## Findings

- `sync_needed` can reuse the existing `hasSyncIssue(image)` predicate, so no backend or mask/export contract changes were needed.
- The project list is now constrained by scrollable CSS instead of truncating data in JavaScript.

## File-back Candidates

- None yet.

## Closeout

- [x] Scope matched actual diff for Worker D-owned changes; concurrent topbar edits in scoped files were left untouched.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run: `scripts/harness/test-target.sh appContracts`, `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`.
- [x] Reusable findings were considered for `lessons.md` or playbooks; no promotion needed.
- [x] Commit and push skipped by direct user instruction.
