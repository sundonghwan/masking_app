# Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace browser-selected roles and local actor defaults with MVP credential login, server-owned roles, authenticated review/assignment actors, and centralized runtime defaults.

**Architecture:** Add a small dependency-free auth/defaults module that owns demo users, default project metadata, and compatibility actor defaults. Server login validates `user_id/password` against that module and creates bearer sessions with server-owned roles. The browser sends password only during login, displays the returned role as read-only, and protected actions derive actor identity from the session where possible.

**Tech Stack:** Dependency-free Node HTTP server, browser ES modules, Node test runner, existing filesystem manifest storage.

**Implementation note:** Public runtime defaults intentionally contain user IDs
and roles only. Demo password validation lives in the server-only auth module,
and static serving blocks server/docs/harness/test paths.

---

## File Structure

- Create `src/config/runtimeDefaults.js`
  - owns MVP demo users and runtime fallback constants
  - exports lookup/validation helpers shared by server/export/app code
- Modify `src/server/api.js`
  - validate login credentials
  - create sessions from account records
  - use session user for review actor
  - validate assignment target roles
- Modify `src/api/client.js`
  - send `password` during login
  - stop sending role in login payload
  - stop sending reviewer identity in review payload
- Modify `index.html`
  - replace role selector with password field and read-only role display
- Modify `src/app.js`
  - store password draft only for login
  - render role as returned session role
  - remove normal runtime dependence on manual reviewer ID for review actions
  - use centralized defaults for remaining local fallback values
- Modify `src/export/exporter.js`
  - import centralized default project/worker constants
- Modify tests:
  - `tests/apiClient.test.js`
  - `tests/serverApi.test.js`
  - `tests/reviewPolicy.test.js` only if needed for server actor compatibility
  - `tests/appContracts.test.js`

## Task 1: Central Runtime Defaults Module

**Files:**
- Create: `src/config/runtimeDefaults.js`
- Modify: `src/export/exporter.js`
- Modify: `src/app.js`
- Modify: `src/server/api.js`
- Test: `tests/appContracts.test.js`

- [x] **Step 1: Write failing tests for defaults module**

Add to `tests/appContracts.test.js`:

```js
import {
  DEFAULT_PROJECT,
  DEFAULT_ACTORS,
  findMvpUser,
  validateMvpCredentials,
  userHasRole,
} from "../src/config/runtimeDefaults.js";

test("runtime defaults expose explicit MVP project and actor fallbacks", () => {
  assert.equal(DEFAULT_PROJECT.id, "mask_project_001");
  assert.equal(DEFAULT_PROJECT.name, "Masking Project");
  assert.equal(DEFAULT_ACTORS.admin, "admin");
  assert.equal(DEFAULT_ACTORS.worker, "worker");
  assert.equal(DEFAULT_ACTORS.reviewer, "reviewer");
});

test("MVP users validate credentials and expose server-owned roles", () => {
  const admin = validateMvpCredentials({ userId: "admin", password: "admin123" });
  assert.equal(admin.user_id, "admin");
  assert.equal(admin.role, "admin");

  assert.equal(validateMvpCredentials({ userId: "admin", password: "bad" }), null);
  assert.equal(findMvpUser("worker").role, "worker");
  assert.equal(userHasRole("reviewer", "reviewer"), true);
  assert.equal(userHasRole("reviewer", "worker"), false);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/appContracts.test.js
```

Expected: FAIL because `src/config/runtimeDefaults.js` does not exist.

- [x] **Step 3: Create the defaults module**

Create `src/config/runtimeDefaults.js`:

```js
export const ROLES = {
  WORKER: "worker",
  REVIEWER: "reviewer",
  ADMIN: "admin",
};

export const DEFAULT_PROJECT = {
  id: "mask_project_001",
  name: "Masking Project",
};

export const DEFAULT_ACTORS = {
  admin: "admin",
  worker: "worker",
  reviewer: "reviewer",
};

export const MVP_USERS = [
  { user_id: "admin", role: ROLES.ADMIN, display_name: "Admin" },
  { user_id: "worker", role: ROLES.WORKER, display_name: "Worker" },
  { user_id: "reviewer", role: ROLES.REVIEWER, display_name: "Reviewer" },
];

export function normalizeActorId(value) {
  return String(value || "").trim();
}

export function normalizeRole(value, fallback = "") {
  const role = String(value || "").trim().toLowerCase();
  return Object.values(ROLES).includes(role) ? role : fallback;
}

export function findMvpUser(userId) {
  const normalized = normalizeActorId(userId);
  return MVP_USERS.find((user) => user.user_id === normalized) || null;
}

export function userHasRole(userId, role) {
  const user = findMvpUser(userId);
  return Boolean(user && user.role === role);
}

export function publicMvpUser(user = {}) {
  if (!user.user_id) return null;
  return {
    user_id: user.user_id,
    userId: user.user_id,
    role: user.role,
    display_name: user.display_name || user.user_id,
  };
}
```

- [x] **Step 4: Replace scattered default constants where no behavior changes are intended**

Use imports from `src/config/runtimeDefaults.js` in:

```js
// src/export/exporter.js
import { DEFAULT_ACTORS, DEFAULT_PROJECT } from "../config/runtimeDefaults.js";
```

Replace exporter fallback literals:

```js
id: normalizeText(input.id || input.projectId || DEFAULT_PROJECT.id),
name: normalizeText(input.name || DEFAULT_PROJECT.name),
worker_id: normalizeText(input.workerId || input.worker_id || DEFAULT_ACTORS.worker),
project_id: options.projectId || DEFAULT_PROJECT.id,
worker_id: DEFAULT_ACTORS.worker,
```

Use imports from `src/config/runtimeDefaults.js` in `src/app.js`:

```js
import { DEFAULT_ACTORS, DEFAULT_PROJECT } from "./config/runtimeDefaults.js";
```

Replace app state defaults:

```js
projectId: DEFAULT_PROJECT.id,
projectName: DEFAULT_PROJECT.name,
sessionUserId: DEFAULT_ACTORS.admin,
reviewerId: DEFAULT_ACTORS.reviewer,
assignmentWorkerId: DEFAULT_ACTORS.worker,
assignmentReviewerId: DEFAULT_ACTORS.reviewer,
```

Use imports from `src/config/runtimeDefaults.js` in `src/server/api.js`:

```js
import { DEFAULT_ACTORS, DEFAULT_PROJECT, ROLES, normalizeActorId, normalizeRole } from "../config/runtimeDefaults.js";
```

Remove the local `ROLES`, `normalizeActorId`, and `normalizeRole` definitions from `src/server/api.js` after confirming all call sites use imported helpers.

- [x] **Step 5: Run tests**

Run:

```bash
npm test -- tests/appContracts.test.js
npm test
```

Expected: all tests pass.

## Task 2: Credential Login And Server-Owned Role

**Files:**
- Modify: `src/server/api.js`
- Modify: `src/api/client.js`
- Modify: `tests/serverApi.test.js`
- Modify: `tests/apiClient.test.js`

- [x] **Step 1: Add failing server credential tests**

Add to `tests/serverApi.test.js` near existing session tests:

```js
test("session login validates password and uses server-owned role", async () => {
  const { route } = createApiHarness();

  const rejected = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "wrong",
    role: "worker",
  }, {});
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.body.error, "unauthorized");

  const accepted = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "admin123",
    role: "worker",
  }, {});
  assert.equal(accepted.statusCode, 201);
  assert.equal(accepted.body.session.user_id, "admin");
  assert.equal(accepted.body.session.role, "admin");
  assert.match(accepted.body.session.token, /^sess_/);
});
```

- [x] **Step 2: Add failing API client login payload test**

Update `tests/apiClient.test.js` login test so the client calls:

```js
const login = await client.login({ userId: "admin", password: "admin123", role: "worker" });
assert.deepEqual(JSON.parse(calls[0].options.body), {
  user_id: "admin",
  password: "admin123",
});
```

Expected: current client includes `role`, so the assertion fails.

- [x] **Step 3: Run focused tests and verify failures**

Run:

```bash
npm test -- tests/serverApi.test.js tests/apiClient.test.js
```

Expected: FAIL on credential login behavior.

- [x] **Step 4: Implement server credential validation**

In `src/server/api.js`, import:

```js
import { validateMvpCredentials } from "../config/runtimeDefaults.js";
```

Change `/api/session/login` to:

```js
if (url.pathname === "/api/session/login" && request.method === "POST") {
  const body = await readJsonBody(request);
  const account = validateMvpCredentials({
    user_id: body.user_id || body.userId,
    password: body.password,
  });
  if (!account) {
    return sendJson(response, 401, {
      error: "unauthorized",
      message: "Invalid user ID or password",
    });
  }
  const session = createSession(account);
  sessions.set(session.token, session);
  return sendJson(response, 201, { session });
}
```

Change `createSession(input)` so it expects account role and does not default role from browser input:

```js
function createSession(input = {}) {
  const userId = normalizeActorId(input.userId || input.user_id || DEFAULT_ACTORS.admin);
  const role = normalizeRole(input.role, ROLES.WORKER);
  const createdAt = new Date().toISOString();
  return {
    token: createSessionToken(),
    user_id: userId,
    userId,
    role,
    created_at: createdAt,
  };
}
```

- [x] **Step 5: Implement API client login payload**

Change `src/api/client.js` login body to:

```js
body: {
  user_id: input.userId || input.user_id,
  password: input.password,
},
```

- [x] **Step 6: Run focused tests and full tests**

Run:

```bash
npm test -- tests/serverApi.test.js tests/apiClient.test.js
npm test
```

Expected: all tests pass.

## Task 3: Login UI With Password And Read-Only Role

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`

- [x] **Step 1: Update HTML login controls**

Replace the role select in `index.html` with a password input and read-only role output:

```html
<label>
  Password
  <input class="text-input" id="sessionPassword" type="password" autocomplete="current-password">
</label>
<div class="metadata-grid compact">
  <div><dt>서버 역할</dt><dd id="sessionRoleLabel">로그인 전</dd></div>
</div>
```

Keep `loginButton`, `logoutButton`, and `sessionMessage`.

- [x] **Step 2: Update app state and element refs**

In `src/app.js`, add:

```js
sessionPassword: "",
```

Change element refs:

```js
sessionPassword: document.querySelector("#sessionPassword"),
sessionRoleLabel: document.querySelector("#sessionRoleLabel"),
```

Remove `sessionRole: document.querySelector("#sessionRole")`.

- [x] **Step 3: Update event binding**

Replace the role select event with password input:

```js
els.sessionPassword.addEventListener("input", () => {
  state.sessionPassword = els.sessionPassword.value;
  state.sessionToken = "";
  state.sessionAuthenticated = false;
  render();
});
```

- [x] **Step 4: Update loginSession and renderSessionPanel**

Change login payload:

```js
const response = await apiClient.login({
  userId: state.sessionUserId,
  password: state.sessionPassword,
});
```

After successful login:

```js
state.sessionPassword = "";
els.sessionPassword.value = "";
```

In `renderSessionPanel`:

```js
if (document.activeElement !== els.sessionPassword) {
  els.sessionPassword.value = state.sessionPassword;
}
els.sessionRoleLabel.textContent = state.sessionAuthenticated ? state.sessionRole : "로그인 전";
els.loginButton.disabled = !state.sessionUserId || !state.sessionPassword;
```

- [x] **Step 5: Manual smoke criteria**

Expected browser behavior:

- login panel shows ID and password
- role is read-only text
- wrong password shows login failure
- successful login clears password field and displays returned role

## Task 4: Authenticated Review Actor And Assignment Target Validation

**Files:**
- Modify: `src/server/api.js`
- Modify: `src/api/client.js`
- Modify: `src/app.js`
- Modify: `tests/serverApi.test.js`
- Modify: `tests/apiClient.test.js`

- [x] **Step 1: Add failing tests for review actor from session**

Add to `tests/serverApi.test.js`:

```js
test("review events use authenticated session identity instead of request body reviewer", async () => {
  const { route, storage } = createApiHarness();
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "reviewer",
    password: "reviewer123",
  }, {});
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", {
    ...baseImage(),
    status: "submitted",
    current_mask_path: "masks/image-1_mask.png",
  });

  const response = await callJson(route, "PUT", "/api/images/image-1/review", {
    project_id: "project-1",
    action: "approve",
    reviewer_id: "spoofed-reviewer",
  }, { authorization: `Bearer ${login.body.session.token}` });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.image.reviewer_id, "reviewer");
  assert.equal(response.body.image.review_events[0].reviewer_id, "reviewer");
});
```

- [x] **Step 2: Add failing tests for assignment target validation**

Add to `tests/serverApi.test.js`:

```js
test("admin assignment validates worker and reviewer target roles", async () => {
  const { route, storage } = createApiHarness();
  const login = await callJson(route, "POST", "/api/session/login", {
    user_id: "admin",
    password: "admin123",
  }, {});
  const headers = { authorization: `Bearer ${login.body.session.token}` };
  await storage.ensureProject("project-1", { name: "Project 1" });
  await storage.addImage("project-1", baseImage());

  const invalid = await callJson(route, "PUT", "/api/images/image-1/assignment", {
    project_id: "project-1",
    worker_id: "reviewer",
    reviewer_id: "worker",
  }, headers);
  assert.equal(invalid.statusCode, 422);

  const valid = await callJson(route, "PUT", "/api/images/image-1/assignment", {
    project_id: "project-1",
    worker_id: "worker",
    reviewer_id: "reviewer",
  }, headers);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.image.worker_id, "worker");
  assert.equal(valid.body.image.reviewer_id, "reviewer");
  assert.equal(valid.body.image.assigned_by, "admin");
});
```

- [x] **Step 3: Run focused tests and verify failures**

Run:

```bash
npm test -- tests/serverApi.test.js
```

Expected: FAIL because review still uses body reviewer and assignment target roles are not validated.

- [x] **Step 4: Update server review route**

In `src/server/api.js`, change review input to use session user:

```js
const result = applyReviewTransition(image, {
  ...body,
  reviewer_id: session.userId,
});
```

- [x] **Step 5: Update API client and app review payload**

In `src/api/client.js`, remove `reviewer_id` from `reviewImage` body:

```js
body: {
  project_id: projectId,
  action: input.action,
  reason: input.reason || input.reject_reason,
},
```

In `src/app.js`, stop passing `reviewerId` to `apiClient.reviewImage`.

- [x] **Step 6: Validate assignment targets**

In `src/server/api.js`, import `userHasRole`.

Before assignment mutation:

```js
const workerId = normalizeActorId(body.worker_id || image.worker_id || DEFAULT_ACTORS.worker);
const reviewerId = normalizeActorId(body.reviewer_id || image.reviewer_id || "");
if (!userHasRole(workerId, ROLES.WORKER) || !userHasRole(reviewerId, ROLES.REVIEWER)) {
  return sendJson(response, 422, {
    error: "assignment_validation_failed",
    message: "Assignment target roles are invalid",
    validation: {
      worker_id: userHasRole(workerId, ROLES.WORKER),
      reviewer_id: userHasRole(reviewerId, ROLES.REVIEWER),
    },
  });
}
```

- [x] **Step 7: Run tests**

Run:

```bash
npm test -- tests/serverApi.test.js tests/apiClient.test.js
npm test
```

Expected: all tests pass.

## Task 5: Documentation, Harness Closeout, And Verification

**Files:**
- Modify: `docs/FEATURE_STATUS.md`
- Modify: `docs/DEVELOPMENT_CHECKPOINTS.md`
- Modify: `harness/run_log.md`
- Create: `harness/tasks/2026-04-29-operations-foundation.md`

- [x] **Step 1: Create harness task file**

Create `harness/tasks/2026-04-29-operations-foundation.md` with:

```md
# Task: operations-foundation

## Goal
- Implement MVP credential login, server-owned roles, authenticated actor identity, and centralized defaults.

## Scope
- Login payload and UI
- Server MVP user directory
- Review actor identity
- Assignment target role validation
- Runtime defaults centralization

## Non-goals
- Persistent account DB
- Password reset/invites
- Assignment queue
- Project opening redesign
- Revision state model
- Editor pan/magic-click

## Risks
- Role fallback can accidentally preserve browser-selected auth
- Review events can spoof reviewer identity if body fields remain trusted
- Assignment targets can accept invalid users if not validated

## Impact Chains
### suspected
- loginSession (src/app.js) -> apiClient.login (src/api/client.js) -> validateMvpCredentials (src/config/runtimeDefaults.js) -> createSession (src/server/api.js)
- reviewSelectedImage (src/app.js) -> apiClient.reviewImage (src/api/client.js) -> applyReviewTransition (src/review/policy.js)
- assignSelectedImage (src/app.js) -> apiClient.assignImage (src/api/client.js) -> userHasRole (src/config/runtimeDefaults.js)

### validated
- Pending.

### discarded
- assignment queue
  - reason: requires separate task-list UI and project access model.

## Validation Plan
- npm run lint
- npm test
- scripts/harness/lint-all.sh
- scripts/harness/typecheck-all.sh
- scripts/harness/test-target.sh
- scripts/harness/smoke-web.sh
```

- [x] **Step 2: Update feature status**

When implementation is verified, mark these completed in `docs/FEATURE_STATUS.md`:

```md
- [x] MVP credential login with ID/password fields
- [x] Centralized runtime defaults/config to replace scattered `local_*` values
- [x] Server-owned role resolution instead of browser role selection
- [x] Authenticated reviewer/assignment identity instead of manual local actor fields
```

Keep these remaining:

```md
- [x] Project creation/opening flow to replace default `mask_project_001`
- [x] Assignment queues and per-user task list
```

- [x] **Step 3: Run full verification**

Run:

```bash
npm run lint
npm test
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
curl -sS http://localhost:4173/api/health
```

Expected: all commands pass.

- [x] **Step 4: Commit and push**

Run:

```bash
git add src index.html tests docs harness
git commit -m "Add operations foundation auth"
git push
```

Expected: pushed to `origin/main`.

## Self-Review Checklist

- The plan covers Batch A1 and A2 from the design document.
- The plan does not include DB, persistent sessions, project opening redesign,
  assignment queues, revision state, pan, or magic-click.
- Every risky behavior has a server-side test before implementation.
- Browser role selection is removed from the normal login path.
- Assignment target role validation is server-side, not UI-only.
