# Task: code-health-cadence

## Goal
- Make routine code-smell cleanup part of the repository harness.

## Scope
- Add a code health checklist for behavior-preserving cleanup.
- Reference it from `AGENTS.md` and the review checklist.
- Add the checklist to smoke file existence checks.
- Record the cadence in the run log.

## Non-goals
- Define a large refactor roadmap.
- Force refactoring on urgent fixes.
- Replace feature-specific task files or validation.

## Touched areas
- `AGENTS.md`
- `harness/checklists/code_health.md`
- `harness/checklists/review.md`
- `scripts/harness/smoke-web.sh`
- `harness/run_log.md`

## Risks
- Making routine cleanup feel like mandatory broad rewrites.
- Adding process without a concrete validation hook.

## Impact Chains

### suspected
- routine refactor task -> code_health checklist -> review checklist

### validated
- routine refactor task -> code_health checklist -> review checklist
  - validation: `scripts/harness/smoke-web.sh`

### discarded
- feature implementation order
  - reason: checklist changes process only; it does not reorder product work.

## Validation Plan
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- Added `harness/checklists/code_health.md` for behavior-preserving routine
  refactor batches.
- Linked the checklist from `AGENTS.md` and the main review checklist.
- Added the code health checklist to smoke file existence checks.
- Validation passed:
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Review finding: no blocking issue. Checked that the checklist encourages
  small tested cleanup and explicitly avoids broad rewrites or behavior changes.
