# Task: worker-f-server-storage

## Goal

- Implement dependency-free Node filesystem helpers for project images, masks, manifests, and export folders under a configurable data root.

## Scope

- `src/server/storage.js`
- `tests/serverStorage.test.js`
- Harness task/log notes for this task only.

## Non-goals

- Do not edit `server.js`, `app.js`, frontend files, package scripts, or browser storage.
- Do not implement HTTP routes, ZIP export generation, mask pixel validation, or database writes.

## Touched Areas

- Server filesystem storage helper API.
- Node test coverage for path sanitization, data URL writes, manifests, listing, and cleanup.

## Risks

- Path traversal could write outside the configured data root.
- Export/archive metadata could leak absolute server paths.
- Data URL decoding could silently accept malformed image or mask payloads.

## Impact Chains

### suspected

- None remaining.

### validated

- `writeImageFromDataUrl (src/server/storage.js:65-86) -> safeJoin (src/server/storage.js:222-232)`
  - validation: `node --test tests/serverStorage.test.js` passed; covers sanitized image ids, sanitized filenames, archive-relative `images/...` paths, and root-contained filesystem paths.
- `writeMaskFromDataUrl (src/server/storage.js:87-107) -> safeJoin (src/server/storage.js:222-232)`
  - validation: `node --test tests/serverStorage.test.js` passed; covers deterministic `masks/..._mask.png` paths, PNG MIME enforcement, and root-contained filesystem paths.
- `listProjectFiles (src/server/storage.js:113-119) -> collectFiles (src/server/storage.js:258-279)`
  - validation: `node --test tests/serverStorage.test.js` passed; covers sorted project-relative paths for images, masks, and manifest.

### discarded

- None.

## Validation Plan

- `node --check src/server/storage.js` -> syntax check for the new server module.
- `node --test tests/serverStorage.test.js` -> targeted storage helper behavior.
- `scripts/harness/test-target.sh serverStorage` -> harness-backed targeted test command.

## Progress Notes

- Initial read found browser-side `src/storage/projectStore.js`; server storage was created concurrently by backend scaffold work during this task.
- `package.json` test glob already includes `tests/*.test.js`, so the new test file is picked up without script changes.
- While working, another backend scaffold added `src/server/api.js`, `src/server/httpUtils.js`, and an initial `src/server/storage.js`; storage changes preserved the API-facing `buffer`, `path`, `relativePath`, and `readProjectFile` shape instead of breaking that integration.
- Added module-level default exports for the requested storage APIs while keeping `createFileStorage({ rootDir })` as the testable configurable entrypoint.

## Findings

- `scripts/harness/test-target.sh serverStorage` currently runs the full `tests/*.test.js` glob plus a literal `serverStorage` argument; this is broader than the filter name implies, but it passed.

## File-back Candidates

- None yet.

## Validation Results

- `node --check src/server/storage.js` -> passed.
- `node --test tests/serverStorage.test.js` -> passed, 9 tests.
- `scripts/harness/test-target.sh serverStorage` -> passed, 38 tests.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
