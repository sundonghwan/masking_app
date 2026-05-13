# Task: browser-e2e-smoke

## Goal
- Add an automated browser smoke that exercises the critical labeling journey
  instead of relying only on file-existence smoke checks.

## Scope
- Start the app with an isolated data root.
- Drive the real browser UI through login, project creation, label schema
  selection, image upload, canvas painting, submit, review approval, and export.
- Wire the command into the harness command docs.

## Non-goals
- Add visual regression screenshots.
- Replace Node unit/API tests.
- Add a production browser test framework dependency unless the existing local
  Playwright CLI cannot cover the smoke.

## Touched areas
- `scripts/harness/*`
- `package.json`
- `harness/commands.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Browser automation can become a false positive if it bypasses the real UI.
- The script must not mutate the repository's normal `data/` directory.
- Browser download/export handling must not leave hanging processes.

## Impact Chains

### suspected
- loginSession (src/app.js:1034-1062) -> routeToScreen (src/app.js) -> createProjectFromForm (src/app.js:2351-2394)
- syncUploadedImage (src/app.js:1507-1542) -> MaskEditor.loadImage (src/editor/maskEditor.js:173-190) -> MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:598-668)
- submitCurrentImage (src/app.js:1129-1142) -> syncMaskToBackend (src/app.js:1545-1568) -> reviewSelectedImage (src/app.js:1724-1804) -> exportProject (src/app.js:1321-1380)

### validated
- loginSession (src/app.js:1034-1062) -> createProjectFromForm (src/app.js:2351-2394)
  - validation: `scripts/harness/browser-e2e.sh` logs in as admin and creates a temp project.
- syncUploadedImage (src/app.js:1507-1542) -> MaskEditor.loadImage (src/editor/maskEditor.js:173-190) -> MaskEditor.bindCanvasEvents (src/editor/maskEditor.js:598-668)
  - validation: `scripts/harness/browser-e2e.sh` uploads a generated PNG fixture, loads it into the canvas, selects a class label, verifies brush color, and paints the canvas.
- submitCurrentImage (src/app.js:1129-1142) -> syncMaskToBackend (src/app.js:1545-1568) -> reviewSelectedImage (src/app.js:1724-1804) -> exportProject (src/app.js:1321-1380)
  - validation: `scripts/harness/browser-e2e.sh` submits, approves, and triggers approved-only export.

### discarded
- full visual regression screenshot diff
  - reason: this task adds a journey smoke only; screenshot baselines need a separate artifact policy.

## Validation Plan
- `scripts/harness/browser-e2e.sh`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Use an isolated temp data root for every run.
- Use the existing system `playwright-cli` so the app remains dependency-free.
- Added a project-label brush color assertion because label color drift was a
  recent user-reported risk.
- First browser run found a real save-contract issue: browser canvas PNG output
  was truecolor-alpha, while the server accepted only 8-bit grayscale masks.
  Server save now normalizes binary truecolor-alpha masks to grayscale before
  validation/storage.

## Findings
- Browser E2E is now the first sensor that catches "painted mask cannot be
  saved to server" regressions.
- Download handling is captured inside the browser so the smoke proves export
  without leaving ZIP files on disk.

## Closeout
- validated chain line ranges refreshed for major flows.
- validation passed:
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `scripts/harness/browser-e2e.sh`
  - `git diff --check`
- code review found no blocking issue after checking the browser smoke harness,
  RGBA-to-grayscale normalization path, API save mutation, and docs/harness
  updates.
