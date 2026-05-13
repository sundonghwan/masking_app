# Task: syntax-check-harness-refactor

## Goal
- Remove duplicated syntax-check command lists from `package.json`.

## Scope
- Add a reusable syntax check harness script.
- Point `npm run lint` and `npm run typecheck` at the shared script.
- Add tests that keep the package scripts and syntax file list aligned.
- Update harness command docs and run log.

## Non-goals
- Introduce ESLint, TypeScript, or third-party dependencies.
- Change runtime behavior.
- Split large application modules.

## Touched areas
- `package.json`
- `scripts/harness/check-syntax.mjs`
- `tests/checkSyntax.test.js`
- `harness/commands.md`
- `harness/run_log.md`

## Risks
- Accidentally dropping files from syntax coverage.
- Hiding the distinction between lint and typecheck.

## Impact Chains

### suspected
- npm run lint (package.json:8) -> checkSyntax (scripts/harness/check-syntax.mjs:54-62)
- npm run typecheck (package.json:9) -> checkSyntax (scripts/harness/check-syntax.mjs:54-62)

### validated
- npm run lint (package.json:8) -> checkSyntax (scripts/harness/check-syntax.mjs:54-62)
  - validation: `scripts/harness/lint-all.sh`
- npm run typecheck (package.json:9) -> checkSyntax (scripts/harness/check-syntax.mjs:54-62)
  - validation: `scripts/harness/typecheck-all.sh`

### discarded
- Runtime app behavior
  - reason: refactor only changes validation command wiring.

## Validation Plan
- `node --test tests/checkSyntax.test.js`
- `scripts/harness/lint-all.sh`
- `scripts/harness/typecheck-all.sh`
- `scripts/harness/test-target.sh`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Replaced duplicated `package.json` syntax-check command lists with a shared
  `scripts/harness/check-syntax.mjs` entrypoint.
- Added tests that ensure `lint` and `typecheck` use the shared harness and
  that every syntax-check target exists.
- Updated harness command docs and smoke references.
- Validation passed:
  - `node --test tests/checkSyntax.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (`265` tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that coverage still includes the
  active runtime, server, export, storage, and harness modules and that
  `typecheck` remains documented as syntax-level validation.
