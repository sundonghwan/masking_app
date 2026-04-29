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

## In Progress

- None.

## Remaining

- [ ] Split login, project opening, and workbench into separate screens
- [ ] Project creation/opening flow to replace default `mask_project_001`
- [ ] Role-aware workbench panels for admin, worker, and reviewer
- [ ] Assignment queues and per-user task list
- [ ] Submitted data edit/rework flow after submission
- [ ] Pan/camera movement while image is zoomed
- [ ] Magic-click assisted mask tool for local region selection

## Future Hardening

- [ ] Persist session/account storage beyond the current in-memory MVP session map.
- [ ] Restore server image/mask binaries into IndexedDB for full cross-device editing.
- [ ] AI-backed segmentation model integration behind the magic-click tool.

## Hardcoded Runtime Debt

These values remain intentionally because the corresponding product feature is
not implemented yet. They should not be treated as final architecture.

| Current hardcoded area | Current location | Why it remains | Required feature |
| --- | --- | --- | --- |
| `worker` / `reviewer` default assignment targets | `src/config/runtimeDefaults.js`, `index.html`, `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | There is no user directory, queue, or assignment picker yet. | Assignment queues and per-user task list |
| `mask_project_001` and `Masking Project` defaults | `src/config/runtimeDefaults.js`, `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | The app still boots into a default local-first project when no project is selected. | Project creation/opening flow |

## MVP Accounts

These accounts are for the current local MVP only.

| Role | User ID | Password | Current purpose |
| --- | --- | --- | --- |
| admin | `admin` | `admin123` | Project/admin actions, assignment, review, export |
| worker | `worker` | `worker123` | Image upload and mask editing/submission |
| reviewer | `reviewer` | `reviewer123` | Submitted-image review actions |
