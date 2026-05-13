# Task: production-boundary-decision-doc

## Goal
- Add a concrete production boundary decision document for identity, storage,
  host network, and retention acceptance.

## Scope
- Create a repo-specific decision checklist.
- Link it from the remaining work board and production readiness audit.
- Keep decisions explicit instead of implying production readiness from tests.

## Non-goals
- Making the actual business decision on behalf of the operator.
- Installing TLS, scheduler, or an external identity provider.
- Changing application runtime behavior.

## Touched areas
- `docs/PRODUCTION_BOUNDARY_DECISIONS.md`
- `docs/REMAINING_WORK_BOARD.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- The document could overstate readiness if acceptance is not distinguished
  from implementation.

## Impact Chains
### suspected
- Production readiness audit -> production boundary decision checklist -> release decision

### validated
- Production readiness audit -> production boundary decision checklist -> release decision
  - validation: `scripts/harness/smoke-web.sh`, `git diff --check`

### discarded
- Runtime production gate behavior.
  - reason: this task is documentation and release governance only.

## Validation Plan
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Selected from remaining P0: identity/storage acceptance must be explicit and
  cannot be inferred from passing tests.
- Created `docs/PRODUCTION_BOUNDARY_DECISIONS.md` with decision tables and a
  release-note template.

## Closeout
- Added explicit decision checklist for identity, storage, network, backup,
  audit/log retention, and AI adapter boundaries.
- Linked the decision checklist from `docs/REMAINING_WORK_BOARD.md` and
  `docs/PRODUCTION_READINESS_AUDIT.md`.
- Validation passed:
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: the document does not
  make the operational decision; it gives the owner a concrete place to record
  it before production release.
