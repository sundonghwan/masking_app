# Feature Status

## Completed

- [x] Local-first mask editor
- [x] IndexedDB local persistence
- [x] Backend filesystem sync mirror
- [x] Mask save validation
- [x] Export policy unification
- [x] Sync visibility and selected retry
- [x] Upload policy and rejection UI
- [x] Server upload pre-mutation validation
- [x] Logging policy and structured runtime logs
- [x] Review approve/reject/rework MVP
- [x] Approved-only export option
- [x] Review history/audit records in manifest
- [x] Dedicated feature status document
- [x] Server-side image dimension extraction
- [x] Client/server upload dimension mismatch rejection
- [x] Full backend PNG binary mask pixel validation
- [x] Validate masks before filesystem write
- [x] Server project list API
- [x] Project summary list in workbench
- [x] Export readiness summary
- [x] Export exclusion reason list
- [x] Export ZIP structure preview
- [x] Authenticated reviewer identity display
- [x] Required authenticated reviewer ID in review audit events
- [x] Hash-based review detail route
- [x] Multipart/FormData image upload
- [x] Bearer-token API request auth and server RBAC checks
- [x] Admin image assignment workflow
- [x] Server-backed login/logout/me session endpoints
- [x] Bearer token API authentication
- [x] Project selection/manifest restore from server project list
- [x] MVP credential login with ID/password fields
- [x] Centralized runtime defaults/config for remaining MVP fallbacks
- [x] Server-owned role resolution with read-only browser role display
- [x] Authenticated review actor and assignment audit identity
- [x] Split login, project opening, and workbench into separate screens
- [x] Role-aware workbench panels for admin, worker, and reviewer
- [x] Project creation/opening flow before entering the workbench
- [x] Assignment queue filters and per-user task list counts
- [x] Submitted data edit/revision flow with audit event
- [x] Zoomed image pan/camera movement controls
- [x] Magic-click assisted mask tool for local region selection
- [x] Edge-aware magic tool using local image edge detection
- [x] Spacebar temporary pan workflow for editor efficiency
- [x] Dashboard planning and design for operational overview
- [x] Project/task/version file-storage hierarchy design
- [x] Persistent local user directory seeded from MVP accounts
- [x] Persistent filesystem session store for local operations
- [x] User-directory-backed assignment target picker
- [x] Server-first image/mask binary restore into IndexedDB
- [x] Strict project creation API requiring explicit project ID
- [x] Operations dashboard screen implementation
- [x] Magic-tool sensitivity controls
- [x] Project upload limit setting at project creation
- [x] Project/task/version storage hierarchy foundation
- [x] Training set export for selected project/task/version sources
- [x] Spacebar hold-to-camera-pan override
- [x] Expanded lint/typecheck coverage for new runtime modules
- [x] Workbench navigation back to project list and dashboard
- [x] Single-image soft remove and restore API
- [x] Deleted image exclusion from active lists, dashboard counts, and export payloads
- [x] Project/task/version API foundation for list/create/read flows
- [x] Browser API client task/version methods
- [x] Image search and operational filters for not-started, sync-needed, and deleted items
- [x] Searchable full project list instead of a capped project summary view
- [x] Structured review rejection reason codes
- [x] Dashboard review quality metrics from structured review events
- [x] Image list scroll retention on image selection
- [x] Task/version selector in the workbench
- [x] Workbench route/state wiring for selected task/version context
- [x] Version clone/delete/restore UI
- [x] Training-set export source picker tied to selected project/task/version snapshots
- [x] Project settings edit UI/API for upload limits, allowed formats, and magic presets
- [x] Project edit UI/API for name and description corrections
- [x] Project archive/restore UI/API for mistaken or obsolete projects
- [x] Project purge maintenance for archived project files
- [x] Account administration UI/API for local MVP users
- [x] Server revision guard for risky project/version mutations
- [x] Physical purge maintenance for soft-deleted version files
- [x] Saved training set management with deterministic split, list, re-export, archive, and restore
- [x] Previous-frame mask copy with draggable mask-position adjustment
- [x] Deployment profile for explicit local/staging runtime configuration
- [x] Legacy project manifest repair preview/apply API
- [x] Generic AI API serving contract for detection, segmentation, and classification stubs
- [x] Default multi-class label schema utilities
- [x] Workbench class/label selector UI
- [x] Class-labeled annotation record utility foundation
- [x] User-defined project label schema create/settings UI/API
- [x] Selected label color drives the mask overlay and brush color swatch
- [x] Class-aware mask save/load upserts `image.annotations[]` and stores per-class mask blobs/paths
- [x] Class-aware export and training-set metadata emit per-class annotation records and mask paths

## In Progress

- Multi-class mask annotation foundation implementation:
  - design source: `docs/superpowers/specs/2026-05-13-multi-class-mask-annotation-design.md`
  - implementation plan: `docs/superpowers/plans/2026-05-13-multi-class-mask-annotation-plan.md`
  - completed slice: visible workbench label selector, user-defined project label schema, local label-schema state, annotation record utilities, selected-label mask overlay color, class-aware mask save/load, class-aware export/training-set metadata
  - next slice: AI prediction import contract

## Remaining

- Multi-class mask annotation foundation:
  - AI prediction import contract with `class_id + mask_data_url`
- AI-backed segmentation adapter remains optional hardening after the generic AI serving contract and local edge-aware magic tool reach real dataset limits.
- Production identity provider remains out of MVP scope.
- Database-backed storage remains out of MVP scope until filesystem operation becomes a bottleneck.

## Recommended Development Order

1. MVP credential login with ID/password fields and server-owned roles. `[done]`
2. Split login, project opening, and workbench into separate screens. `[done]`
3. Project creation/opening flow to replace default workbench entry project. `[done]`
4. Role-aware workbench panels for admin, worker, and reviewer. `[done]`
5. Assignment queues and per-user task list. `[done]`
6. Submitted data edit/rework flow after submission. `[done]`
7. Pan/camera movement while image is zoomed. `[done]`
8. Magic-click assisted mask tool for local region selection. `[done]`
9. Dashboard planning and design for operational overview. `[done]`

## Future Hardening

- [ ] Derived indexed-mask export generated from class-labeled binary masks.
- [ ] AI-backed segmentation model integration behind the magic-click tool after local edge-aware selection reaches its limit.
- [x] Add full user/account administration UI for creating, disabling, and rotating local accounts.
- [x] Add project settings edit screen for changing upload formats and limits after project creation.
- [x] Wire project/task/version selectors throughout the workbench instead of using legacy project-only routes.
- [x] Add version clone/delete/restore UI on top of the storage hierarchy primitives.
- [x] Add server revision or optimistic concurrency checks before multi-user editing expands.
- [x] Promote training-set export source selection into the main workbench/project flow.
- [x] Add physical purge maintenance for deleted version files if operations needs it.

## Hardcoded Runtime Debt

These values remain intentionally because the corresponding product feature is
not implemented yet. They should not be treated as final architecture.

| Current hardcoded area | Current location | Why it remains | Required feature |
| --- | --- | --- | --- |
| Local MVP account seed passwords: `admin/admin123`, `worker/worker123`, `reviewer/reviewer123` | `src/server/auth.js`, `data/identity/users.json` after first use, tests | Admin UI/API can now create, update, deactivate, reactivate, and rotate passwords for local users. Seed accounts remain first-run bootstrap credentials only. | Production identity provider if moving beyond local MVP |
| `worker` / `reviewer` fallback assignment targets | `src/config/runtimeDefaults.js`, `index.html`, `src/app.js` | Normal assignment/account admin paths now use `GET /api/users` and admin user management. Fallback remains only for unavailable user-directory recovery. | Remove fallback once first-run user-directory bootstrap is mandatory |
| `mask_project_001` and `Masking Project` fallback defaults | `src/config/runtimeDefaults.js` | Kept for legacy local snapshots and tests. New project creation API now rejects missing project IDs, and export helpers no longer inject the default project ID. Admin manifest repair can normalize old project manifests in place. | Production migration only if old snapshots repeatedly block operation |
| Empty server manifest/project-name fallback | `src/server/storage.js`, `src/app.js` | Manifest creation and restore can still fall back to project ID/name when partial data is received. Admin manifest repair can preview/apply normalization for malformed records. | Strict project metadata schema only if production storage is introduced |
| Upload format allowlist | `src/upload/policy.js` | Project settings UI/API can update per-project upload limits and MIME format policy. The global policy remains the default bootstrap value. | Dataset-specific settings templates if repeated presets emerge |
| Local filesystem data root and dev port defaults | `server.js`, `src/server/deploymentProfile.js`, `src/server/storage.js`, `harness/commands.md` | Deployment profile now centralizes mode, host, port, public root, data root, log level, and generic AI serving flags. | Production deployment packaging if moving beyond local dev |
| Magic-tool max region cap | `src/editor/maskEditor.js` | UI now controls color tolerance and edge threshold. Max-pixel cap remains an internal safety default. | Project-level tool presets if real datasets need different caps |
| Server export vs local ZIP fallback | `src/app.js`, `src/export/exporter.js` | Local-first recovery still allows fallback export when server sync is incomplete. This is a deliberate MVP safety path. | Server-first restore/sync reconciliation before multi-user production use |
| Legacy project-only workbench routes | `src/server/api.js`, `src/app.js` | Workbench now exposes task/version selection and version operations while keeping legacy project manifest compatibility for older project data. | Full migration tool only if legacy manifests become a support burden |

## Feature Development Items From Hardcoded Debt

Recommended order:

1. AI-backed segmentation adapter.
   - Add only after local edge-aware magic controls hit real dataset limits.
2. Generic AI API serving layer. `[done: contract/stub]`
   - Model-agnostic API contract can accept detection, segmentation, or
     classification requests without binding the app to one model family.
3. Deployment profile. `[done]`
   - Data root, port, host, public root, log level, and AI serving flags are
     centralized in server deployment config.
4. Legacy manifest migration/repair tool. `[done: preview/apply repair]`
   - Admins can preview and apply legacy project manifest normalization.

## MVP Accounts

These accounts are for the current local MVP only.

| Role | User ID | Password | Current purpose |
| --- | --- | --- | --- |
| admin | `admin` | `admin123` | Project/admin actions, assignment, review, export |
| worker | `worker` | `worker123` | Image upload and mask editing/submission |
| reviewer | `reviewer` | `reviewer123` | Submitted-image review actions |
