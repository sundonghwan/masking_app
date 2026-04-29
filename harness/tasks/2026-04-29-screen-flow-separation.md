# Task: screen-flow-separation

## Goal

- Split login, project opening, and annotation workbench into separate screens so
  session controls are not embedded in the workbench tool area.

## Scope

- `#/login` screen for MVP account login.
- `#/projects` screen for server project list/opening.
- `#/workbench` screen for annotation, review, export, and sync tools.
- Role-aware workbench panel visibility for admin/reviewer-specific controls.
- Documentation and feature status updates, including dashboard planning as
  backlog item 9.

## Non-goals

- New project creation form.
- Assignment queues.
- Dedicated worker/reviewer/admin route pages.
- Dashboard implementation.
- Submitted-data revision workflow.

## Touched Areas

- `index.html`
- `src/app.js`
- `src/styles.css`
- `tests/appContracts.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `docs/superpowers/specs/2026-04-29-operations-revision-editor-roadmap-design.md`
- `docs/superpowers/plans/2026-04-29-screen-flow-separation-plan.md`

## Risks

- Existing review hash routes could stop selecting images.
- Project API calls could run before login and create noisy auth failures.
- Login controls could remain inside the inspector despite visual changes.
- Role-based panel hiding could hide required editor controls from worker users.

## Impact Chains

### suspected

- `routeToInitialScreen (src/app.js:163-175)` -> `renderScreen (src/app.js:1007-1023)` -> `loginSession (src/app.js:406-430)`
- `loadServerProject (src/app.js:1118-1132)` -> `restoreServerManifest (src/app.js:1134-1157)` -> `routeToScreen (src/app.js:999-1005)`
- `render (src/app.js:967-983)` -> `renderRolePanels (src/app.js:1025-1030)` -> workbench panel visibility
- `handleShortcut (src/app.js:1348-1362)` -> workbench-only shortcut mutations

### validated

- `routeToInitialScreen (src/app.js:163-175)` -> `renderScreen (src/app.js:1007-1023)` -> `loginSession (src/app.js:406-430)`
  - validation: `npm test` passed; app contract verifies `loginScreen`, `projectsScreen`, and `workbenchScreen`.
- `loadServerProject (src/app.js:1118-1132)` -> `restoreServerManifest (src/app.js:1134-1157)` -> `routeToScreen (src/app.js:999-1005)`
  - validation: `npm test` passed; focused contract verifies project list is outside workbench.
- `render (src/app.js:967-983)` -> `renderRolePanels (src/app.js:1025-1030)` -> workbench panel visibility
  - validation: `npm test` passed; app contract verifies login controls are no longer embedded in the workbench inspector and role-marked workbench actions exist.
- `handleShortcut (src/app.js:1348-1362)` -> workbench-only shortcut mutations
  - validation: `npm test` passed; app contract verifies shortcut handling is gated to the visible workbench.

### discarded

- Dedicated `/worker/tasks`, `/reviewer/queue`, and `/admin/assignments` pages.
  - reason: deferred to assignment queues; current batch keeps one workbench with role-aware panels.

## Validation Plan

- `npm run lint`
- `npm test`
- `git diff --check`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- Browser smoke via `curl` for screen containers.

## Progress Notes

- Login screen now owns user ID, password, and read-only role display.
- Project list moved to its own screen.
- Workbench now contains annotation/editor controls only.
- `#/review/:imageId` remains supported as a workbench route.
- Login and project list API calls are gated so unauthenticated startup does not
  immediately call protected project APIs.
- A default project open button gives newly authenticated users a workbench
  entry path even when the server project list is empty.
- Guarded workbench/review hashes are normalized back to the visible screen when
  the user lacks the required session or project state.

## Findings

- Project creation/opening still needs a first-class create/open flow; current
  project screen hosts existing server project rows plus a default project
  fallback.
- Dashboard planning/design is now tracked as backlog item 9, not an immediate
  implementation target.
- Code review found four issues and all were fixed in this batch:
  fresh-auth users needed a path from projects to workbench, hidden workbench
  shortcuts needed gating, role-marked panels needed to include top-level
  actions, and guarded URLs needed to match the downgraded visible screen.

## File-back Candidates

- None yet. If more screen routes are added, promote the route-guard pattern to
  the frontend playbook.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit completed: `635640d Add screen flow separation`.
- [x] Push completed: `origin/main` at `3a89cd8`.
