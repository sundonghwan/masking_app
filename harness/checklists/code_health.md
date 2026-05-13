# Code Health Checklist

## Audience

Agents and maintainers doing regular refactoring while feature work continues.

## Objective

Keep small code-smell cleanup in the normal development loop without turning it
into broad rewrites or speculative architecture work.

## When To Run

Run this checklist after a feature batch is validated and before starting the
next risky feature, or when a file repeatedly creates friction during nearby
work.

Do not pause urgent bug fixes just to satisfy this checklist.

## Good Refactor Candidates

- duplicated command lists, constants, or validation rules
- small helpers buried inside very large controllers
- repeated string formatting or escaping logic that needs focused tests
- test setup helpers duplicated across several test files
- scripts that are hard to extend because the file list or config is embedded
  in `package.json`

## Avoid During Routine Cleanup

- broad app-controller decomposition without a feature or test boundary
- renaming public API fields, storage keys, or exported metadata paths
- changing canvas coordinate math together with UI cleanup
- mixing behavior changes with pure refactor commits
- moving generated assets or runtime data

## Required Shape

1. Create a `harness/tasks/` file when the cleanup touches code.
2. State the behavior that must not change.
3. Add or keep at least one focused test around the extracted helper or command.
4. Run the cheapest relevant sensor first.
5. Run full `scripts/harness/test-target.sh` when shared validation, rendering,
   storage, export, auth, or canvas code is touched.
6. Commit and push the cleanup as its own batch after validation passes.

## Verification

Minimum:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
git diff --check
```

Add targeted tests for the moved helper or script. Add
`scripts/harness/test-target.sh` and `scripts/harness/smoke-web.sh` when the
cleanup touches app code, harness commands, or user-visible rendering.

## Current High-Value Targets

- `src/app.js` remains large and should be reduced only through tested helper
  extraction or feature-bounded componentization.
- `src/server/api.js` remains large and should be reduced route group by route
  group, with server API tests kept green.
- Repeated `innerHTML` templates should only be changed when the escaping and
  rendered structure are covered by focused tests.
