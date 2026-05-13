# Task: user-session-invalidation

## Goal
- Invalidate existing bearer sessions when an admin changes a user's password, role, or active status to inactive.

## Scope
- Filesystem session store user-session deletion.
- In-memory session fallback deletion by user ID.
- User update route session invalidation.
- Security documentation and tests.

## Non-goals
- Password reset workflow UI.
- Lockout policy.
- External identity provider integration.
- Cookie/CSRF changes.

## Touched areas
- `src/server/sessionStore.js`
- `src/server/api.js`
- `tests/sessionStore.test.js`
- `tests/serverApi.test.js`
- security/readiness docs

## Risks
- Existing sessions with stale roles could remain authorized after role changes.
- Deactivation or password rotation could leave old bearer tokens usable.
- Invalidation must not run for display-name-only profile edits.

## Impact Chains
### suspected
- None remaining.

### validated
- update user route (src/server/api.js:187-214) -> invalidateUserSessions (src/server/api.js:1152-1165) -> sessionStore.deleteSessionsForUser (src/server/sessionStore.js:58-82)
- update user route (src/server/api.js:187-214) -> invalidateUserSessions (src/server/api.js:1152-1165) -> in-memory sessions map fallback (src/server/api.js:1156-1164)

### discarded
- Login-time session rotation.
  - reason: this batch targets stale sessions after account mutation, not per-request token rotation.

## Validation Plan
- RED/GREEN: `node --test tests/sessionStore.test.js tests/serverApi.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected from production readiness audit open item: token lifetime and rotation remained an open security decision; stale sessions after account mutation are a concrete executable slice.
- RED confirmed existing sessions stayed authorized after password rotation and `deleteSessionsForUser` was not exported by the filesystem session store.
- GREEN added persistent and in-memory session invalidation for password changes, role changes, and deactivation. Display-name-only updates keep sessions active.

## Closeout
- `node --test tests/sessionStore.test.js tests/serverApi.test.js` passed with 74 tests.
- `scripts/harness/lint-all.sh` passed.
- `scripts/harness/typecheck-all.sh` passed.
- `scripts/harness/test-target.sh` passed with 313 tests.
- `scripts/harness/smoke-web.sh` passed.
- `git diff --check` passed.
- Code review found no blocking issue. Checked that stale role/password/deactivated sessions are revoked, display-name-only changes do not churn sessions, and docs avoid claiming full identity-provider or broad token-rotation completion.
