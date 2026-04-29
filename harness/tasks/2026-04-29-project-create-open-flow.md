# Task: project-create-open-flow

## Goal

- Replace the implicit default-project entry path with an explicit project
  creation/opening flow before entering the annotation workbench.

## Scope

- Add project ID/name inputs on the projects screen.
- Let admin users create a project and enter the workbench.
- Let authenticated users open existing server projects from the project list.
- Stop authenticated startup from auto-creating `mask_project_001`.
- Update feature status and hardcoded runtime debt notes.

## Non-goals

- Multi-project local cache.
- Project delete/archive.
- Project search, pagination, or dashboard analytics.
- Assignment queues.

## Touched Areas

- `index.html`
- `src/app.js`
- `src/styles.css`
- `tests/appContracts.test.js`
- `tests/serverApi.test.js`
- `docs/FEATURE_STATUS.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`

## Risks

- Upload/save paths must still refuse to run without an active project.
- Existing restored snapshots should still open when they already have a
  project.
- Non-admin users should not see project creation as an available action.
- Admin creation should not leave stale images from a previous selected project.

## Impact Chains

### suspected

- `loginSession (src/app.js:428-452)` -> `routeToScreen (src/app.js:1021-1027)` -> projects screen create/open UI
- `createProjectFromForm (src/app.js:1154-1200)` -> `apiClient.createProject (src/api/client.js:32-41)` -> `routeApi POST /api/projects (src/server/api.js:71-82)` -> `storage.ensureProject (src/server/storage.js:23-40)`
- `handleFiles (src/app.js:330-362)` -> `ensureBackendProject (src/app.js:663-690)` -> active project guard

### validated

- `loginSession (src/app.js:428-452)` -> `routeToScreen (src/app.js:1021-1027)` -> projects screen create/open UI
  - validation: `npm test -- tests/appContracts.test.js tests/serverApi.test.js` passed; contract verifies project create controls and no default project workbench entry.
- `createProjectFromForm (src/app.js:1154-1200)` -> `apiClient.createProject (src/api/client.js:32-41)` -> `routeApi POST /api/projects (src/server/api.js:71-82)` -> `storage.ensureProject (src/server/storage.js:23-40)`
  - validation: `npm test -- tests/appContracts.test.js tests/serverApi.test.js` passed; server API verifies admin can create and worker cannot create.
- `handleFiles (src/app.js:330-362)` -> `ensureBackendProject (src/app.js:663-690)` -> active project guard
  - validation: `npm test -- tests/appContracts.test.js tests/serverApi.test.js` passed; contract verifies the explicit project-required message exists in upload guard path.

### discarded

- Project dashboard metrics on project screen.
  - reason: dashboard remains backlog item 9 and should not be mixed into the
    basic create/open flow.

## Validation Plan

- `npm run lint`
- `npm test -- tests/appContracts.test.js tests/serverApi.test.js`
- `git diff --check`
- Harness wrapper scripts after implementation.

## Progress Notes

- Projects screen now has an admin-only create form with project ID/name inputs.
- The previous default-project button was removed.
- New app sessions start with no active project and must create or open a
  project before workbench upload/edit paths run.
- Existing server projects remain openable from the project list for all
  authenticated roles.
- Browser smoke confirmed the served HTML/JS includes the project create form,
  explicit empty initial `projectId`, project-required guard, and project create
  handler.

## Findings

- `mask_project_001` still exists as a fallback in shared runtime/export/API
  helper layers, but it is no longer the browser app's new-session entry
  project.
- Implementation review found no blocking issue after checking route state,
  admin-only creation, project-required upload guard, and frontend/backend
  create-project field alignment.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Feature status updated with completed and remaining work.
- [x] Commit completed: `4b63baf Add project create open flow`.
- [x] Push completed: `origin/main` at `8f18689`.
