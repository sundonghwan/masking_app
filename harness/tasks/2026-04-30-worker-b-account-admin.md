# Worker B Account Administration

## Goal

Implement local MVP account administration for the filesystem-backed user
directory and protected server API user routes.

## Scope

- `src/server/userDirectory.js`
- `tests/userDirectory.test.js`
- user-admin portions of `src/server/api.js`
- user-admin portions of `tests/serverApi.test.js`

## Non-Goals

- Do not introduce a database, password hashing, or external auth provider.
- Do not change existing session mechanics beyond using updated stored users.
- Do not change non-user API routes.
- Do not commit or push.

## Risks

- Stored `users.json` could expose passwords through public responses.
- Deactivated users could still authenticate or appear in assignment lists.
- Admin reset/rotation could overwrite other account fields unintentionally.
- Existing `GET /api/users?role=...` behavior must remain compatible.

## Impact Chains

Validated:

```text
createUser/updateUser/deactivateUser/reactivateUser (src/server/userDirectory.js:48-84) -> users.json (data/identity/users.json) -> validateCredentials/listUsers/userHasRole (src/server/userDirectory.js:22-96)
routeApi /api/users POST/PUT (src/server/api.js:91-117) -> userDirectory create/update helpers (src/server/userDirectory.js:48-78) -> public API responses (src/server/api.js:97-113)
```

Validation mapping:

- `tests/userDirectory.test.js` covers direct directory lifecycle and password
  reset behavior.
- `tests/serverApi.test.js` covers admin-only API create/update/deactivate and
  public response redaction.

## Validation Plan

```bash
node --test tests/userDirectory.test.js tests/serverApi.test.js
node --check src/server/userDirectory.js src/server/api.js
```

## Closeout Notes

Changed:

- Added filesystem-backed `createUser`, `updateUser`, `deactivateUser`, and
  `reactivateUser` helpers.
- Added default module-level account admin helper exports.
- Kept public user records password-free while preserving stored passwords in
  `identity/users.json` for local MVP login.
- Added admin-only `POST /api/users` and `PUT /api/users/{user_id}` API paths.
- Preserved existing admin-only `GET /api/users?role=...` behavior.
- Added focused userDirectory and server API tests for create, update, password
  reset, deactivate, reactivate, role filtering, and password redaction.

Validation:

```bash
node --test tests/userDirectory.test.js
# PASS: 8/8

node --test --test-name-pattern "admin (lists assignment users|creates users|updates, resets password)" tests/serverApi.test.js
# PASS: 3/3

node --check src/server/userDirectory.js src/server/api.js
# PASS

node --test tests/userDirectory.test.js tests/serverApi.test.js
# PASS: 54/54
```

Code Review:

- No password fields are included in public helper or API responses.
- Omitted API update fields stay omitted; deactivate-only requests no longer
  send `role: undefined` into role validation.
- Deactivated users no longer validate credentials or appear in active role
  lists.
- No blocking issue found in the Worker B account-admin diff.

Completed Features:

- Local MVP account create/update.
- Admin password reset/rotation through stored `users.json`.
- Deactivate/reactivate flow.
- Admin API routes under `/api/users`.

Remaining Work:

- No reusable playbook or command update is needed for this one-off task.

Commit / Push:

- Skipped per user instruction: do not commit or push.
