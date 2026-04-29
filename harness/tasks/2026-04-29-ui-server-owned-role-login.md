# Task: ui-server-owned-role-login

## Goal

- Replace the browser-owned role selector with a password field and read-only role display for server-owned role login.

## Scope

- `index.html` operating session panel markup.
- `src/app.js` session state, element references, event binding, login payload, and session panel rendering.

## Non-goals

- No server, API client, tests, docs, or authorization policy changes.
- No full test-suite run unless needed for syntax validation.
- No unrelated UI, canvas, upload, review, assignment, export, or sync changes.

## Touched Areas

- Login/session UI state and rendering.

## Risks

- Login can be enabled without a required credential.
- Password could accidentally be persisted in the local project snapshot.
- Existing `sessionRole` consumers could break if the role display stops reflecting server-returned role state.

## Impact Chains

### suspected

- `bindEvents (src/app.js)` -> `loginSession (src/app.js)` -> `apiClient.login`
- `loginSession (src/app.js)` -> `renderSessionPanel (src/app.js)` -> `renderAssignmentPanel (src/app.js)`
- `persistProject (src/app.js)` -> `restoreProject (src/app.js)` -> `renderSessionPanel (src/app.js)`

### validated

- `bindEvents (src/app.js:227-238)` -> `loginSession (src/app.js:381-394)` -> `apiClient.login`
  - validation: `node --check src/app.js` passed; diff review confirmed login payload now sends `password` instead of client-selected `role`.
- `loginSession (src/app.js:381-394)` -> `renderSessionPanel (src/app.js:1067-1080)` -> `renderAssignmentPanel (src/app.js:1083-1100)`
  - validation: diff review confirmed successful login stores server-returned `sessionRole`, clears transient password, and existing role consumers continue reading `state.sessionRole`.
- `persistProject (src/app.js:1389-1411)` -> `restoreProject (src/app.js:1415-1435)` -> `renderSessionPanel (src/app.js:1067-1080)`
  - validation: diff review confirmed `sessionPassword` is not persisted or restored.

### discarded

- None.

## Validation Plan

- `node --check src/app.js` -> verifies JavaScript syntax for the changed browser controller without running the full suite.
- Manual diff review -> verifies only requested files plus harness task/run-log changed.

## Progress Notes

- Current UI renders `#sessionRole` as a selectable role, and `loginSession` sends `{ userId, role }`.
- Replaced role selector with password input plus read-only role display.
- Kept `sessionRole` state as the server-returned role source for assignment gating.
- Password is transient UI state only; successful login and project clear reset it.

## Findings

- The working tree contains unrelated concurrent edits outside this slice (`src/api/client.js`, `src/export/exporter.js`, `src/server/api.js`, tests, and `src/config/`). They were not changed by this task.

## File-back Candidates

- None expected; this is a one-off UI contract alignment.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.

Validation:

- `node --check src/app.js` passed.
- Full suite skipped by request because this is a bounded UI state/rendering patch.

Review:

- No blocking issue found in the owned login-panel diff.
- Remaining concern: server/API client contract was intentionally not edited, so this assumes the current `apiClient.login` forwards unknown payload fields or has already been updated by the concurrent server-owned role work.

Feature status:

- Completed: UI no longer lets the browser select a role at login; login requires user ID and password; read-only role display reflects `state.sessionRole`.
- Remaining: end-to-end credential validation depends on the server/API client slice outside this task.

Harness updates:

- No reusable playbook or lessons update needed.

Commit/push:

- Not committed or pushed; working tree contains unrelated concurrent edits by others.
