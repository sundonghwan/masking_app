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
- [x] Local reviewer identity field
- [x] Required reviewer ID in review audit events
- [x] Hash-based review detail route
- [x] Multipart/FormData image upload
- [x] Role-aware API request headers and server RBAC checks
- [x] Admin image assignment workflow
- [x] Server-backed login/logout/me session endpoints
- [x] Bearer token API authentication
- [x] Project selection/manifest restore from server project list

## In Progress

- None.

## Remaining

- [ ] MVP credential login with ID/password fields
- [ ] Centralized runtime defaults/config to replace scattered `local_*` values
- [ ] Server-owned role resolution instead of browser role selection
- [ ] Project creation/opening flow to replace default `mask_project_001`
- [ ] Authenticated reviewer/assignment identity instead of manual local actor fields
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
| `local_admin` session user | `index.html`, `src/app.js`, `src/server/api.js` | There is no ID/password credential login yet. | MVP credential login with server-side user validation |
| Browser role selector defaults to `admin` | `index.html`, `src/app.js` | Role is still editable in the UI instead of resolved by the server account. | Server-owned role resolution |
| `local_worker` / `local_reviewer` assignment defaults | `index.html`, `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | There is no user directory, queue, or assignment picker yet. | Assignment queues and per-user task list |
| Manual reviewer identity field | `index.html`, `src/app.js` | Review identity is not derived from the authenticated session yet. | Authenticated reviewer identity |
| `mask_project_001` and `Masking Project` defaults | `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | The app still boots into a default local-first project when no project is selected. | Project creation/opening flow |
| Runtime constants scattered across app/export/server | `src/app.js`, `src/export/exporter.js`, `src/server/api.js` | Defaults were added incrementally during MVP feature work. | Centralized runtime defaults/config |
