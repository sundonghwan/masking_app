# Operations, Revision, And Editor Assist Roadmap Design

## Audience

Maintainers and coding agents planning the next development batches for Masking App.

## Objective

Fix the current operational gaps in a safe order, then add post-submission
editing and editor productivity tools without weakening mask/export reliability.

## Current Context

The app is a local-first manual binary mask dataset tool. The backend mirrors
project manifests, images, masks, review events, and exports to filesystem
storage. Recent work added bearer sessions, server project list restore, RBAC
checks, multipart upload, review actions, and assignment updates.

The remaining product debt falls into three tracks:

- operations/auth hardening
- screen flow separation for login, project opening, and annotation workbench
- submitted or approved mask revision workflow
- editor productivity for pan and assisted region selection
- dashboard planning for operational overview

The main risk is doing these out of order. Revision history needs trustworthy
actor identity. Editor assistance must not create invalid mask pixels or silently
export work that is still being revised.

## Chosen Order

### 1. Operations Foundation

Build this first.

Scope:

- add MVP ID/password login
- make the server decide the account role
- remove browser role selection from the normal login path
- derive reviewer and assignment actor identity from the authenticated session
- validate assignment targets against known MVP users
- centralize remaining runtime defaults/config so `local_*` values stop
  spreading across app, server, and export code

Non-goals:

- database or ORM
- production password hashing
- persistent account/session storage
- password reset, invite, account admin screens
- full project opening redesign
- assignment queues

### 2. Screen Flow Separation

Build this before adding more role-specific behavior.

Decision:

- use a minimal three-screen flow: `/login`, `/projects`, `/workbench`
- keep login out of the annotation workbench/tool panel
- keep project selection/opening out of the canvas editing surface
- keep one workbench for now, but show role-appropriate panels:
  - `admin`: assignment, review, export, and project operations
  - `worker`: assigned image editing and submission
  - `reviewer`: submitted-image review and rework decisions

Why not create every role page immediately:

Full `/worker/tasks`, `/reviewer/queue`, and `/admin/assignments` pages are
useful later, but they would be overbuilt before the project opening flow and
basic role-aware panel visibility are stable.

Non-goals:

- full multi-page admin console
- separate queue pages for every role
- production account management
- database-backed user directory

### 3. Revision State Model

Build after the screen-flow separation.

Decision:

- introduce `revision_in_progress`
- `submitted -> revision_in_progress` when a submitted mask is reopened for edits
- `approved -> revision_in_progress` when an approved mask is reopened for edits
- `revision_in_progress -> submitted` when the revised mask is submitted again
- `revision_in_progress` is excluded from default export and approved-only export

Why not reuse `in_progress`:

`in_progress` cannot distinguish first-pass annotation work from work that was
already submitted or approved and later reopened. A distinct revision state makes
UI labels, export exclusions, and audit history easier to reason about.

Audit events:

- `revision_started`
- `revision_mask_saved`
- `revision_submitted`

Each event should include actor identity, actor role, from/to status, timestamp,
and enough mask/status context for reviewers to understand what changed.

Non-goals:

- full mask version store
- restoring old masks
- concurrent editing conflict handling
- approving revision work without resubmission

### 4. Editor Pan And Magic-Click Assistance

Build after the revision state model unless a small pan-only fix is needed
earlier.

Pan decision:

- pan/camera movement must be separate from mask drawing
- pan must change only viewport offsets
- brush/erase must change only mask pixels
- temporary pan modifiers must not create a brush stroke at pointer down

Magic-click decision:

- first version is deterministic local region selection, not AI
- use connected-region or flood-fill style behavior from the clicked image pixel
- keep output binary and compatible with current mask validation
- make the action undoable in one step

Non-goals:

- AI segmentation model integration
- server inference endpoint
- SAM-like object prediction
- multi-class masks
- brush engine rewrite

### 5. Dashboard Planning And Design

Plan this after the core workbench and role flows are stable.

Decision:

- dashboard is a design/planning item first, not an immediate implementation
- dashboard should summarize project status, assignment load, export readiness,
  and recent review/revision activity
- dashboard should link into concrete work queues or project views rather than
  duplicate editor controls
- detailed design source: `docs/DASHBOARD_DESIGN.md`

Non-goals:

- production analytics stack
- billing/admin account management
- chart-heavy executive reporting
- replacing the project selection screen

## Recommended Implementation Batches

### Batch A1: Credential Login And Server-Owned Role

Files likely touched:

- `index.html`
- `src/app.js`
- `src/api/client.js`
- `src/server/api.js`
- `tests/apiClient.test.js`
- `tests/serverApi.test.js`

Acceptance criteria:

- login form has user ID and password fields
- login sends `user_id` and `password`
- server rejects invalid credentials with `401`
- server role comes from the MVP user directory
- browser no longer selects role during login
- protected browser requests use bearer session only

### Batch A2: Authenticated Actor Identity And Defaults

Files likely touched:

- `src/server/api.js`
- `src/review/policy.js`
- `src/export/exporter.js`
- `src/app.js`
- `tests/serverApi.test.js`
- `tests/reviewPolicy.test.js`
- `tests/exporter.test.js`

Acceptance criteria:

- review events use authenticated actor identity
- assignment `assigned_by` uses authenticated admin identity
- assignment target worker/reviewer IDs are validated against known users
- remaining fallback defaults are centralized in one runtime config module
- scattered `local_*` defaults are removed from normal runtime paths or clearly
  marked as compatibility fixtures

### Batch A3: Login, Projects, And Workbench Separation

Files likely touched:

- `index.html`
- `src/app.js`
- `src/api/client.js`
- `tests/appContracts.test.js`
- `tests/apiClient.test.js`

Acceptance criteria:

- login is a separate first screen and is not embedded in the annotation tool
  panel
- project selection/opening is a separate screen before the annotation
  workbench
- workbench assumes an authenticated session and selected/open project
- admin, worker, and reviewer see role-appropriate workbench panels
- default MVP accounts are documented near the login/project workflow
- no new route can bypass bearer-session checks for protected API calls

### Batch A4: Assignment Queue Filters

Files touched:

- `index.html`
- `src/app.js`
- `src/assignment/queue.js`
- `tests/assignmentQueue.test.js`
- `tests/appContracts.test.js`

Acceptance criteria:

- workbench image list exposes `all`, `my_work`, and `my_review` queue filters
- queue counts are derived from the current project manifest images
- worker queue uses `worker_id`
- reviewer queue uses `reviewer_id` and only review-ready statuses
- queue filtering composes with the existing status filter

### Batch C1: Revision State And Export Policy

Files likely touched:

- `index.html`
- `src/api/client.js`
- `src/server/api.js`
- `src/app.js`
- `tests/apiClient.test.js`
- `tests/appContracts.test.js`
- `tests/serverApi.test.js`

Acceptance criteria:

- submitted/approved images can enter revision edit mode and return to
  `in_progress`
- revision events are appended to history
- revision images are excluded from export through existing `in_progress`
  export policy
- approve/reject still only apply to `submitted`
- revised masks must be submitted again before export/review

### Batch B1: Zoom Pan

Files likely touched:

- `src/editor/maskEditor.js`
- `src/app.js`
- `index.html`
- `tests/maskEditor.test.js`

Acceptance criteria:

- pan tool changes viewport and never changes mask pixels
- arrow-key camera movement changes viewport and never changes mask pixels
- brush/erase changes mask pixels and never changes viewport
- image switch resets viewport through the existing fit-on-load behavior
- view/pan labels and shortcuts are consistent

### Batch B2: Deterministic Magic-Click

Files likely touched:

- `src/editor/maskEditor.js`
- `src/app.js`
- `index.html`
- `tests/maskEditor.test.js`

Acceptance criteria:

- same fixture, click, and tolerance produce the same region
- region selection is local connected-region, not global threshold fill
- max pixel/radius cap prevents runaway fills
- result is binary and undoable
- no AI/model/network dependency

## Risks And Guardrails

- Do not remove fallback `mask_project_001` defaults from export/API helper
  layers until every caller requires explicit project identity. The app entry
  flow itself now requires project create/open before workbench entry.
- Do not claim server-owned role is complete while browser role selection can
  still change runtime permissions.
- Do not allow submitted/approved mask saves to silently keep exportable status.
- Do not make pan part of undo history.
- Do not call magic-click AI-assisted until a real model-backed design exists.

## Verification

Every implementation batch must run:

```bash
npm run lint
npm test
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
```

For auth, review, assignment, export, and revision work, add targeted server API
tests before implementation.
