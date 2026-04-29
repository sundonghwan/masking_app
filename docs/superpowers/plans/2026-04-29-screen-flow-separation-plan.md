# Screen Flow Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Split login, project opening, and annotation workbench into a minimal three-screen flow so authentication is no longer embedded in the workbench tool panel.

**Architecture:** Keep the current dependency-free single-page app and introduce hash-based screen routing for `#/login`, `#/projects`, and `#/workbench`. Move the session controls into a login screen, keep project selection on a project screen, and let the workbench render only after an authenticated session and selected project are available.

**Tech Stack:** Browser ES modules, static `index.html`, Node HTTP backend, Node test runner, existing `createMaskingApiClient` session endpoints.

---

## File Structure

- Modify `index.html`
  - add screen containers for login, projects, and workbench
  - move current session panel markup into the login screen
  - move project browser markup into the projects screen
  - keep canvas/editor/inspector inside workbench
- Modify `src/app.js`
  - add hash screen routing
  - redirect unauthenticated users to login
  - redirect authenticated users without selected/open project to projects
  - hide role-inappropriate panels in the workbench
- Modify `src/styles.css`
  - add compact full-screen auth/project layouts using the existing design language
  - keep cards limited to actual repeated items/forms
- Modify `tests/appContracts.test.js`
  - assert login/project/workbench containers exist
  - assert session controls are not inside the workbench inspector
  - assert route guard strings/functions exist
- Update docs and harness task/run log

## Task 1: Contract Tests For Screen Boundaries

**Files:**
- Modify: `tests/appContracts.test.js`
- Modify later: `index.html`
- Modify later: `src/app.js`

- [x] **Step 1: Add screen-boundary contract tests**

Add a test that reads `index.html` and `src/app.js`:

```js
test("screen flow separates login projects and workbench", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="loginScreen"/);
  assert.match(html, /id="projectsScreen"/);
  assert.match(html, /id="workbenchScreen"/);
  assert.match(html, /id="sessionPassword"/);
  assert.match(html, /id="projectSummaryList"/);
  assert.match(html, /id="editorCanvas"/);
  assert.match(app, /function routeToScreen\(/);
  assert.match(app, /function currentScreen\(/);
  assert.match(app, /function canEnterWorkbench\(/);
});
```

Add a second test that protects the specific UX problem:

```js
test("login controls are not embedded in the workbench inspector", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const inspectorStart = html.indexOf('<aside class="sidebar inspector"');
  const inspectorEnd = html.indexOf("</aside>", inspectorStart);
  const inspector = html.slice(inspectorStart, inspectorEnd);

  assert.equal(inspector.includes("sessionPassword"), false);
  assert.equal(inspector.includes("loginButton"), false);
  assert.equal(inspector.includes("logoutButton"), false);
});
```

- [x] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/appContracts.test.js
```

Expected: FAIL because screen containers and route helpers are not implemented.

## Task 2: Markup Split

**Files:**
- Modify: `index.html`

- [x] **Step 1: Add screen containers**

Wrap the app in three top-level screens:

```html
<section class="screen login-screen" id="loginScreen" data-screen="login"></section>
<section class="screen projects-screen" id="projectsScreen" data-screen="projects" hidden></section>
<section class="app-shell workbench-screen" id="workbenchScreen" data-screen="workbench" hidden></section>
```

- [x] **Step 2: Move operating session markup to login screen**

Move `#sessionUserId`, `#sessionPassword`, `#sessionRoleLabel`, `#loginButton`,
`#logoutButton`, and `#sessionMessage` out of the inspector and into
`#loginScreen`.

- [x] **Step 3: Move project browser markup to projects screen**

Move `#refreshProjectsButton` and `#projectSummaryList` out of the left workbench
panel and into `#projectsScreen`. Leave the image list and upload controls in
the workbench.

- [x] **Step 4: Keep editor controls in workbench only**

Ensure `#workbenchScreen` contains the current topbar, image sidebar, canvas
workspace, inspector, and status bar.

## Task 3: Routing And Guards

**Files:**
- Modify: `src/app.js`

- [x] **Step 1: Add screen state helpers**

Add:

```js
const SCREENS = {
  LOGIN: "login",
  PROJECTS: "projects",
  WORKBENCH: "workbench",
};

function currentScreen() {
  const value = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return Object.values(SCREENS).includes(value) ? value : SCREENS.LOGIN;
}

function canEnterProjects() {
  return Boolean(state.sessionAuthenticated && state.sessionToken);
}

function canEnterWorkbench() {
  return canEnterProjects() && Boolean(state.backendProjectReady || state.images.length > 0);
}
```

- [x] **Step 2: Add routeToScreen**

Add:

```js
function routeToScreen(screen) {
  const next = Object.values(SCREENS).includes(screen) ? screen : SCREENS.LOGIN;
  if (window.location.hash !== `#/${next}`) {
    window.location.hash = `#/${next}`;
  }
  renderScreen();
}
```

- [x] **Step 3: Add renderScreen**

Add:

```js
function renderScreen() {
  let screen = currentScreen();
  if (screen !== SCREENS.LOGIN && !canEnterProjects()) screen = SCREENS.LOGIN;
  if (screen === SCREENS.WORKBENCH && !canEnterWorkbench()) screen = SCREENS.PROJECTS;

  els.loginScreen.hidden = screen !== SCREENS.LOGIN;
  els.projectsScreen.hidden = screen !== SCREENS.PROJECTS;
  els.workbenchScreen.hidden = screen !== SCREENS.WORKBENCH;
}
```

- [x] **Step 4: Wire screen navigation after auth/project actions**

After successful login, call `routeToScreen(SCREENS.PROJECTS)`.
After logout, call `routeToScreen(SCREENS.LOGIN)`.
After loading/opening a server project, call `routeToScreen(SCREENS.WORKBENCH)`.

## Task 4: Role-Aware Workbench Panels

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/styles.css`

- [x] **Step 1: Add role markers to workbench panels**

Use attributes like:

```html
<section class="panel-section" data-role-panel="admin reviewer"></section>
```

- [x] **Step 2: Add renderRolePanels**

Add:

```js
function renderRolePanels() {
  document.querySelectorAll("[data-role-panel]").forEach((panel) => {
    const allowed = String(panel.dataset.rolePanel || "").split(/\s+/);
    panel.hidden = !allowed.includes(state.sessionRole);
  });
}
```

- [x] **Step 3: Call renderRolePanels from render**

Call `renderRolePanels()` alongside other render helpers.

## Task 5: Validation And Closeout

**Files:**
- Modify: `harness/tasks/2026-04-29-screen-flow-separation.md`
- Modify: `harness/run_log.md`
- Modify: `docs/FEATURE_STATUS.md`
- Modify: `docs/DEVELOPMENT_CHECKPOINTS.md`

- [x] **Step 1: Run full validation**

Run:

```bash
npm run lint
npm test
./scripts/harness/lint-all.sh
./scripts/harness/typecheck-all.sh
./scripts/harness/test-target.sh
./scripts/harness/smoke-web.sh
```

- [x] **Step 2: Browser smoke**

With `npm run dev` running, verify:

```bash
curl -sS http://localhost:4173/ -o /tmp/masking-screen-flow.html
rg "loginScreen|projectsScreen|workbenchScreen|sessionPassword|projectSummaryList|editorCanvas" /tmp/masking-screen-flow.html
```

- [x] **Step 3: Update feature status**

Mark `Split login, project opening, and workbench into separate screens` complete
only after tests and smoke pass.

- [x] **Step 4: Commit and push**

Commit the implementation and push to `origin/main`.
