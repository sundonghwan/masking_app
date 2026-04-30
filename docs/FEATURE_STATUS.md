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

## In Progress

- Next batch planning: version-scoped workbench wiring and operational admin surfaces.

## Remaining

- Task/version selector in the workbench so normal editing is version-scoped.
- Version clone/delete/restore UI on top of the storage hierarchy primitives.
- Server revision or optimistic concurrency guard for multi-user edits.
- Project settings edit UI/API for upload limits, allowed formats, and tool presets.
- Account administration UI for local users, disabled state, and password rotation.
- Training-set export source picker tied directly to selected task/version snapshots.
- Optional physical purge maintenance for soft-deleted files.

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

- [ ] AI-backed segmentation model integration behind the magic-click tool after local edge-aware selection reaches its limit.
- [ ] Add full user/account administration UI for creating, disabling, and rotating local accounts.
- [ ] Add project settings edit screen for changing upload formats and limits after project creation.
- [ ] Wire project/task/version selectors throughout the workbench instead of using legacy project-only routes.
- [ ] Add version clone/delete/restore UI on top of the storage hierarchy primitives.
- [ ] Add server revision or optimistic concurrency checks before multi-user editing expands.
- [ ] Promote training-set export source selection into the main workbench/project flow.
- [ ] Add physical purge maintenance for deleted version files if operations needs it.

## Hardcoded Runtime Debt

These values remain intentionally because the corresponding product feature is
not implemented yet. They should not be treated as final architecture.

| Current hardcoded area | Current location | Why it remains | Required feature |
| --- | --- | --- | --- |
| Local MVP account seed passwords: `admin/admin123`, `worker/worker123`, `reviewer/reviewer123` | `src/server/auth.js`, `data/identity/users.json` after first use, tests | Passwords moved out of browser-imported config and seed a local filesystem user directory. This is still local-MVP credential handling, not production account security. | Account administration UI, password rotation, disabled-user management |
| `worker` / `reviewer` fallback assignment targets | `src/config/runtimeDefaults.js`, `index.html`, `src/app.js` | Used only as local fallback options when the user list API is unavailable or before admin login. The normal assignment path now loads users from `GET /api/users`. | Remove fallback once first-run user-directory bootstrap is mandatory |
| `mask_project_001` and `Masking Project` fallback defaults | `src/config/runtimeDefaults.js` | Kept for legacy local snapshots and tests. New project creation API now rejects missing project IDs, and export helpers no longer inject the default project ID. | Manifest migration/repair flow for old local snapshots |
| Empty server manifest/project-name fallback | `src/server/storage.js`, `src/app.js` | Manifest creation and restore can still fall back to project ID/name when partial data is received. This keeps old or malformed local data recoverable. | Strict project metadata schema and manifest migration/repair flow |
| Upload format allowlist | `src/upload/policy.js` | Project creation can set upload size limit, but allowed formats remain the global PNG/JPEG/BMP/WEBP policy. | Project settings edit screen for allowed formats |
| Local filesystem data root and dev port defaults | `server.js`, `src/server/storage.js`, `harness/commands.md` | `PORT=4173` and `data/` are local development defaults with env overrides. They are not blocking product features. | Deployment config profile if moving beyond local dev |
| Magic-tool max region cap | `src/editor/maskEditor.js` | UI now controls color tolerance and edge threshold. Max-pixel cap remains an internal safety default. | Project-level tool presets if real datasets need different caps |
| Server export vs local ZIP fallback | `src/app.js`, `src/export/exporter.js` | Local-first recovery still allows fallback export when server sync is incomplete. This is a deliberate MVP safety path. | Server-first restore/sync reconciliation before multi-user production use |
| Legacy project-only workbench routes | `src/server/api.js`, `src/app.js` | Storage hierarchy helpers exist, but current workbench routes still operate on project-level manifests for compatibility. | Task/version selector and route wiring |

## Feature Development Items From Hardcoded Debt

Recommended order:

1. Task/version selector and version clone/delete/restore UI.
   - Wires the storage hierarchy into normal workbench navigation.
2. Project settings edit screen.
   - Lets admins update upload limits, allowed formats, and tool presets after
     project creation.
3. Account administration UI.
   - Lets admins create, disable, and rotate local user accounts.
4. AI-backed segmentation adapter.
   - Add only after local edge-aware magic controls hit real dataset limits.
5. Deployment profile.
   - Moves data root, port, and operational retention settings into explicit
     deployment configuration when needed.

## MVP Accounts

These accounts are for the current local MVP only.

| Role | User ID | Password | Current purpose |
| --- | --- | --- | --- |
| admin | `admin` | `admin123` | Project/admin actions, assignment, review, export |
| worker | `worker` | `worker123` | Image upload and mask editing/submission |
| reviewer | `reviewer` | `reviewer123` | Submitted-image review actions |
