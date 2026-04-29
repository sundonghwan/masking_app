# Operations Dashboard Design

## Audience

Maintainers and coding agents planning the first dashboard screen for Masking
App.

## Objective

Define the dashboard as an operational overview for project progress, workload,
export readiness, and recent quality events without turning it into another
editor or a speculative analytics product.

## Decision

The first dashboard is an admin/operator planning surface. It should answer:

- which project needs attention now
- which images are blocked, rejected, or ready for export
- which worker/reviewer queues are overloaded
- what recent review, revision, validation, or sync event changed the project
  state

It must link users into existing project, workbench, assignment, review, and
export flows. It should not duplicate brush, review, assignment, or export
controls inside the dashboard.

## Current Product Context

The current app already has these data sources:

| Source | Relevant data |
| --- | --- |
| `manifest.images[*].status` | `in_progress`, `submitted`, `approved`, `rejected` progress counts |
| `manifest.images[*].assigned_worker` | worker queue ownership |
| `manifest.images[*].assigned_reviewer` | reviewer queue ownership |
| `manifest.images[*].review_events` | approve/reject/rework/revision audit history |
| `manifest.images[*].sync` | image/mask backend sync readiness |
| `src/export/exporter.js` validation | exportable/excluded counts and exclusion reasons |
| `docs/LOGGING.md` events | runtime failure categories such as sync and validation failures |

Current implementation is dependency-free browser JavaScript plus a Node HTTP
server. Do not introduce a charting framework or dashboard data warehouse for
the first dashboard.

## Screen Placement

Recommended placement:

```text
Login
  -> Projects
    -> Dashboard
    -> Workbench
    -> Export
```

The Projects screen remains the project selection and creation surface. The
Dashboard is entered after a project is selected and summarizes that selected
project.

Do not place login inside the dashboard or workbench. The login flow belongs
before project access.

## Primary User

The first dashboard is for `admin` and reviewer lead behavior.

Worker users should continue to land in focused work queues. A worker-facing
dashboard can be considered later, but it should not block the first operational
overview.

## Information Architecture

### 1. Project Health Strip

Compact top strip with:

- total images
- in progress
- submitted
- approved
- rejected
- export-ready count
- blocked validation count

Primary action links:

- open workbench
- open review queue
- open export setup

### 2. Workload Table

Rows grouped by worker/reviewer:

- worker or reviewer ID
- assigned images
- in-progress count
- submitted count awaiting review
- rejected/rework count
- oldest pending item age when timestamps are available

Initial implementation can use current assignment fields and omit age if the
manifest does not yet have stable assignment timestamps.

### 3. Export Readiness Panel

Show export policy readiness without generating an export:

- default export included/excluded counts
- approved-only included/excluded counts
- top exclusion reasons
- sync blockers for server export

Source this from the same validation logic used by `src/export/exporter.js` so
the dashboard and export flow do not diverge.

### 4. Quality And Revision Activity

Recent activity list from image review events:

- submitted
- approved
- rejected with reason
- rework started
- revision started

Each row should link to the image in workbench/review context.

### 5. Actionable Blockers

Small table of items that need a decision:

- invalid mask dimensions
- invalid binary mask values
- rejected images awaiting rework
- submitted images without assigned reviewer
- exportable images missing backend image/mask sync

The dashboard should surface these as navigation targets, not as inline repair
forms.

## Visual Direction

Use the existing `DESIGN.md` and `docs/design/screens-v2/06-operations-dashboard.png`
as the visual reference.

Design constraints:

- compact, work-focused, data-dense
- same shell rhythm as Projects and Workbench
- status chips reuse existing status color roles
- cards are only individual metric/panel containers, not nested page sections
- charts are secondary; tables and queues carry the operational detail
- no hero layout, decorative gradients, or marketing copy

## Data Contract

First implementation should derive a view model from existing project state:

```js
{
  projectId,
  totals: {
    total,
    inProgress,
    submitted,
    approved,
    rejected,
    exportReady,
    blocked,
  },
  workload: [
    {
      userId,
      role,
      assigned,
      inProgress,
      awaitingReview,
      rejectedOrRework,
    },
  ],
  exportReadiness: {
    defaultPolicy,
    approvedOnlyPolicy,
    topExclusionReasons,
    syncBlockers,
  },
  recentActivity: [
    {
      imageId,
      imageName,
      action,
      actor,
      reason,
      createdAt,
    },
  ],
  blockers: [
    {
      imageId,
      imageName,
      type,
      label,
      targetView,
    },
  ],
}
```

Recommended ownership:

- `src/dashboard/summary.js`: pure summary/view-model helpers
- `src/app.js`: screen routing, state wiring, and DOM rendering
- `tests/dashboardSummary.test.js`: pure data contract tests
- `tests/appContracts.test.js`: screen placement and role-gating contract tests

Keep the summary helper pure so dashboard logic can later move behind a server
endpoint without rewriting the screen.

## Implementation Phases

### Phase 1: Pure Summary Model

- Add `src/dashboard/summary.js`.
- Summarize current project manifest and export validation results.
- Add tests for status counts, workload grouping, export readiness, and recent
  activity ordering.

### Phase 2: Dashboard Screen Shell

- Add a Dashboard view between Projects and Workbench.
- Gate it to `admin` first.
- Render metric strip, workload table, export readiness, recent activity, and
  blocker list from the pure summary.

### Phase 3: Navigation Targets

- Link dashboard rows into:
  - workbench with selected image
  - review queue
  - export setup
  - project list

### Phase 4: Server Summary Endpoint

Only add this after the pure summary model is stable:

```http
GET /api/projects/{project_id}/dashboard
```

The endpoint should reuse the same summary helper or equivalent server-side
logic to avoid dashboard/export drift.

## Validation Plan

When dashboard implementation starts, run:

```bash
npm test -- tests/dashboardSummary.test.js tests/appContracts.test.js
npm run lint
./scripts/harness/typecheck-all.sh
./scripts/harness/test-target.sh
./scripts/harness/smoke-web.sh
```

Manual smoke:

- login as `admin`
- open a project
- verify Dashboard shows totals matching the image list
- verify rejected/submitted/approved counts match queue filters
- verify export readiness agrees with Export Setup
- verify dashboard actions navigate to the intended queue or image

## Risks

- Dashboard counts can drift from export rules if it reimplements validation.
  Reuse export validation helpers.
- A chart-heavy dashboard can hide the actual work queues. Keep tables and
  blockers prominent.
- Adding a worker dashboard too early can complicate navigation. Start with the
  admin/operator view.
- Missing timestamps can make aging metrics unreliable. Omit age until stable
  event timestamps exist.
- Server endpoint implementation can duplicate frontend logic. Start with a pure
  shared summary model before adding a backend route.

## Open Questions

- Should reviewer leads share the same dashboard as admin or get a review-only
  filtered view?
- Should dashboard activity use current review events only, or should upload,
  save, sync, and export events be promoted into durable project activity?
- Should export readiness be computed only locally first, or should the first
  implementation require server-synced manifests?
