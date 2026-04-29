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

## In Progress

- None.

## Remaining

- [ ] Pan/camera movement while image is zoomed
- [ ] Magic-click assisted mask tool for local region selection
- [ ] Dashboard planning and design for operational overview

## Recommended Development Order

1. MVP credential login with ID/password fields and server-owned roles. `[done]`
2. Split login, project opening, and workbench into separate screens. `[done]`
3. Project creation/opening flow to replace default workbench entry project. `[done]`
4. Role-aware workbench panels for admin, worker, and reviewer. `[done]`
5. Assignment queues and per-user task list. `[done]`
6. Submitted data edit/rework flow after submission. `[done]`
7. Pan/camera movement while image is zoomed.
8. Magic-click assisted mask tool for local region selection.
9. Dashboard planning and design for operational overview.

## Future Hardening

- [ ] Persist session/account storage beyond the current in-memory MVP session map.
- [ ] Restore server image/mask binaries into IndexedDB for full cross-device editing.
- [ ] AI-backed segmentation model integration behind the magic-click tool.

## Hardcoded Runtime Debt

These values remain intentionally because the corresponding product feature is
not implemented yet. They should not be treated as final architecture.

| Current hardcoded area | Current location | Why it remains | Required feature |
| --- | --- | --- | --- |
| `worker` / `reviewer` fallback assignment targets | `src/config/runtimeDefaults.js`, `index.html`, `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | Queue filters now exist, but there is still no user directory or dynamic assignment picker. | User directory and assignment target picker |
| `mask_project_001` and `Masking Project` fallback defaults | `src/config/runtimeDefaults.js`, `src/export/exporter.js`, `src/server/api.js` | Kept only for legacy/export fallback records and API bodies that omit project identity. New app sessions now require explicit project create/open before workbench entry. | Future migration can remove fallback once all callers require explicit project ID |

## MVP Accounts

These accounts are for the current local MVP only.

| Role | User ID | Password | Current purpose |
| --- | --- | --- | --- |
| admin | `admin` | `admin123` | Project/admin actions, assignment, review, export |
| worker | `worker` | `worker123` | Image upload and mask editing/submission |
| reviewer | `reviewer` | `reviewer123` | Submitted-image review actions |
