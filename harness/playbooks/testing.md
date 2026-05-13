# Testing Playbook

## Audience

Agents deciding what validation to run for a change.

## Principle

Run the cheapest sensor that can catch the likely failure first, then widen only
when the changed area or risk requires it.

## Sensor Ladder

Cheap:

- lint
- typecheck
- unit tests
- changed-file boundary checks

Medium:

- API contract/integration tests
- DB migration dry-run
- route-level smoke
- save/export fixture checks

Expensive:

- `scripts/harness/browser-e2e.sh`
- Playwright/Cypress browser journeys
- visual regression screenshots
- production build
- webhook or background job end-to-end reproduction

## Current Commands

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/browser-e2e.sh
```

## Change-to-Validation Mapping

| Change area | Minimum validation |
| --- | --- |
| docs only | review checklist, smoke if links/assets changed |
| design screens/assets | file existence check, README reference check |
| shared UI component | lint, typecheck, targeted component/unit test |
| canvas coordinate math | unit test for transforms, browser editor smoke |
| mask raster update | unit test with image/mask fixtures |
| save API | backend unit/integration test, smoke save path |
| export | fixture export test, archive structure check |
| database migration | migration apply/reset check |
| auth/session | auth playbook checks and protected route smoke |
| critical labeling journey | `scripts/harness/browser-e2e.sh` |

## Impact Chain Validation

For each `validated` impact chain, record one of:

- exact test command
- exact smoke route
- exact fixture check
- direct code evidence when automated validation is not yet available

Do not mark a chain `validated` only because it looks plausible.

## Flaky Test Handling

When a test is flaky:

- rerun once to confirm
- record both results in the task file
- do not hide the flake if it touches the current change
- add a lesson only if the flake pattern is reusable
