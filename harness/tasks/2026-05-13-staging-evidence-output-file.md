# Task: staging-evidence-output-file

## Goal
- Let operators save staging evidence JSON to a durable file instead of relying on terminal output.

## Scope
- Add an output-file writer for `scripts/harness/staging-evidence.mjs`.
- Add tests for evidence JSON persistence.
- Update command docs, deployment runbook, release checklist, and production audit references.

## Non-goals
- Running a real staging evidence collection against production data.
- Adding a scheduler or artifact repository.
- Changing staging evidence checks.

## Touched areas
- `scripts/harness/staging-evidence.mjs`
- `tests/stagingEvidence.test.js`
- `harness/commands.md`
- `harness/checklists/release.md`
- `docs/RUNBOOK_DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`

## Risks
- Output writing could hide a failing evidence run.
- Operators might accidentally write evidence inside the active data root.
- Docs could imply that saved evidence alone proves production readiness.

## Impact Chains
### suspected
- staging-evidence CLI (scripts/harness/staging-evidence.mjs:21-38) -> writeEvidenceOutput (scripts/harness/staging-evidence.mjs:93-99) -> release evidence artifact

### validated
- staging-evidence CLI (scripts/harness/staging-evidence.mjs:21-38) -> writeEvidenceOutput (scripts/harness/staging-evidence.mjs:93-99) -> release evidence artifact
  - validation: `node --test tests/stagingEvidence.test.js`

### discarded
- Scheduler installation.
  - reason: this batch only makes the evidence artifact durable; scheduling remains host-specific.

## Validation Plan
- RED/GREEN: `node --test tests/stagingEvidence.test.js`
- Full: `scripts/harness/test-target.sh`
- Syntax: `scripts/harness/lint-all.sh`, `scripts/harness/typecheck-all.sh`
- Smoke: `scripts/harness/smoke-web.sh`
- Whitespace: `git diff --check`

## Progress Notes
- Selected from production blocker: staging evidence needs to be captured and archived, not just run interactively.
- RED confirmed the output writer did not exist yet.
- Added `--output <file>` without changing the existing stdout or exit-code behavior.
- Updated release checklist from stale pre-deploy wording to current staging/production evidence gates.

## Closeout
- Added durable staging evidence JSON writing and documented it in commands,
  deployment runbook, release checklist, production readiness audit, and feature
  status.
- Validation passed:
  - `node --test tests/stagingEvidence.test.js`
  - `scripts/harness/lint-all.sh`
  - `scripts/harness/typecheck-all.sh`
  - `scripts/harness/test-target.sh` (314 tests)
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: the feature only enables
  artifact capture; real representative staging evidence still has to be
  collected and archived before release handoff.
- Commit `beb12c1` pushed to `origin/main`.
