# Task: html-escape-refactor

## Goal
- Move HTML escaping out of the large app controller into a small tested UI
  utility.

## Scope
- Extract `escapeHtml` to `src/ui/html.js`.
- Import it from `src/app.js`.
- Add focused tests for special character escaping.
- Keep syntax-check coverage current.

## Non-goals
- Rewrite app rendering.
- Replace existing `innerHTML` templates.
- Change escaping semantics.

## Touched areas
- `src/app.js`
- `src/ui/html.js`
- `tests/html.test.js`
- `scripts/harness/check-syntax.mjs`
- `harness/run_log.md`

## Risks
- Breaking existing render templates if escaping semantics change.
- Missing the new utility in syntax validation.

## Impact Chains

### suspected
- render* (src/app.js) -> escapeHtml (src/ui/html.js:1-9)

### validated
- render* (src/app.js) -> escapeHtml (src/ui/html.js:1-9)
  - validation: `node --test tests/html.test.js`

### discarded
- Rendering markup structure
  - reason: this refactor only moves the existing escaping helper.

## Validation Plan
- `node --test tests/html.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Extracted the existing HTML escaping helper from `src/app.js` into
  `src/ui/html.js`.
- Added focused escaping tests for HTML-sensitive characters and ordinary text.
- Updated syntax-check coverage for the new utility.
- Validation passed:
  - `node --test tests/html.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (`267` tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that escaping semantics stayed the
  same and that app rendering now imports the tested utility.
