# Task: backend-scaffold

## Goal

- Add a dependency-free backend scaffold for Masking App.
- Serve the frontend and expose MVP APIs for project metadata, image/mask file
  persistence, mask validation, and ZIP export.

## Scope

- Node built-in HTTP server.
- Filesystem project storage.
- PNG header/dimension validation.
- Export ZIP endpoint.
- Tests and harness command updates.

## Non-goals

- Auth/session/roles.
- Database migrations.
- Multipart upload parsing.
- Full PNG pixel decode.
- Production deployment hardening.

## Touched Areas

- `src/server/`
- `server.js`
- `package.json`
- `tests/`
- `harness/`
- `README.md`

## Risks

- File APIs can allow path traversal if IDs or filenames are not sanitized.
- JSON data URL uploads can be too large for production but are acceptable for
  this dependency-free scaffold.
- Mask validation can check PNG headers and dimensions, but not full binary pixel
  contents without a PNG decoder.
- Export ZIP must use archive-relative paths only.

## Impact Chains

### suspected

- requestHandler (server.js:1-1) -> routeApi (src/server/api.js:1-1) -> fileStorage.writeImageFromDataUrl (src/server/storage.js:1-1)
- requestHandler (server.js:1-1) -> routeApi (src/server/api.js:1-1) -> validateMaskContract (src/server/maskValidation.js:1-1)
- requestHandler (server.js:1-1) -> exportProject (src/server/api.js:1-1) -> createZipBlob (src/export/zip.js:1-1)

### validated

- requestHandler (server.js:14-35) -> routeApi (src/server/api.js:7-26) -> writeImageFromDataUrl (src/server/storage.js:51-73)
- requestHandler (server.js:14-35) -> routeApi (src/server/api.js:70-100) -> validateMaskContract (src/server/maskValidation.js:64-126)
- requestHandler (server.js:14-35) -> exportProject (src/server/api.js:105-137) -> createZipBlob (src/export/zip.js:44-76)

### discarded

- multipart upload chain
  - reason: this scaffold uses JSON data URL payloads to avoid dependencies.

## Validation Plan

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `scripts/harness/smoke-web.sh`
- `curl -I http://localhost:4173`
- API smoke for `/api/health`

## Progress Notes

- Workers:
  - Worker F owns `src/server/storage.js`
  - Worker G owns `src/server/maskValidation.js`

## Findings

- Filesystem storage sanitizes project IDs, image IDs, filenames, and
  project-relative reads before joining paths under the configured root.
- Backend mask validation is header/dimension/format validation only. Binary
  pixel validation remains covered at the editor/export boundary until a PNG
  decoder is introduced.

## File-back Candidates

- Update backend playbook with actual endpoint and storage flow.
- Update commands with backend dev server behavior.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
