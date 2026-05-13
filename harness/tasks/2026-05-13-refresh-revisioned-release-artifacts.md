# Task: refresh-revisioned-release-artifacts

## Goal
- Refresh release evidence artifacts so they include source revision metadata.

## Scope
- Regenerate staging evidence against the existing migrated copied staging data
  root.
- Regenerate local production health evidence if a production-mode local server
  can be started.
- Keep boundary decisions unchanged.

## Non-goals
- Claiming final production readiness.
- Running evidence against the final target host or final target data root.
- Changing release candidate gate rules.

## Touched areas
- `release-artifacts/staging-evidence-20260513-after-identity-migration.json`
- `release-artifacts/deployment-check-20260513-production-local.json`
- `docs/REMAINING_WORK_BOARD.md`
- `harness/run_log.md`

## Risks
- Local refreshed evidence could be confused with final host evidence.
- Server startup can fail in the sandbox without escalated local listen access.

## Impact Chains
### suspected
- staging-evidence -> revisioned release artifact -> release-candidate-gate
- deployment-check -> revisioned release artifact -> release-candidate-gate

### validated
- staging-evidence -> release-artifacts/staging-evidence-20260513-after-identity-migration.json -> release-candidate-gate
  - validation: staging artifact passed and gate no longer reports staging artifact revision errors
- deployment-check -> release-artifacts/deployment-check-20260513-production-local.json -> release-candidate-gate
  - validation: deployment artifact passed and gate no longer reports deployment artifact revision errors

### discarded
- Boundary decision failures.
  - reason: this task refreshes evidence only and does not decide production
    identity/storage/network/backup/audit boundaries.

## Validation Plan
- `scripts/harness/staging-evidence.sh --json --output ... /tmp/masking-app-staging-data-20260513 /tmp/masking-app-staging-backups-20260513`
- `scripts/harness/deployment-check.sh --json http://127.0.0.1:<port>`
- `scripts/harness/release-candidate-gate.sh --json` expected-failed only on boundary decisions after evidence refresh
- `git diff --check`

## Progress Notes
- `/tmp/masking-app-staging-data-20260513` still exists, passes
  `storage-verify`, and passes strict `security-check`.
- Initial production server startup failed inside the sandbox with `EPERM`; rerun
  with approved escalated local listen access.
- Local production server was stopped after deployment-check evidence capture.

## Closeout
- Refreshed staging evidence with `source_revision` metadata.
- Added `--output` support to `deployment-check` and refreshed local production
  health evidence with `source_revision` metadata.
- Release candidate gate now fails only on unresolved production boundary
  decisions, not stale/missing artifact revision metadata.
- Validation:
  - `scripts/harness/staging-evidence.sh --json --output ...` passed
  - `scripts/harness/deployment-check.sh --json --output ... http://127.0.0.1:4183` passed
  - `scripts/harness/release-candidate-gate.sh --json` expected-failed only on boundary decisions
  - `scripts/harness/lint-all.sh` passed
  - `scripts/harness/typecheck-all.sh` passed
  - `scripts/harness/test-target.sh` passed, 325 tests
  - `scripts/harness/smoke-web.sh` passed
  - `git diff --check` passed
- Code review: no blocking findings; refreshed evidence is still labeled as
  copied staging data root and local production health, not final production
  host evidence.
