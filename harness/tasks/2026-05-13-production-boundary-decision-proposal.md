# Task: production-boundary-decision-proposal

## Goal
- Create a concrete proposal for the five remaining production boundary
  decisions so the owner can approve or change them.

## Scope
- Draft a repository-specific decision proposal for controlled internal MVP
  deployment.
- Keep `docs/PRODUCTION_BOUNDARY_DECISIONS.md` unchanged until owner approval.
- Update remaining work/status references if useful.

## Non-goals
- Marking production boundaries as decided without owner approval.
- Making the release candidate gate pass.
- Implementing external IDP or database storage.

## Touched areas
- `docs/PRODUCTION_BOUNDARY_DECISION_PROPOSAL.md`
- `docs/REMAINING_WORK_BOARD.md`
- `harness/run_log.md`

## Risks
- Proposal could be mistaken for an approved production decision.
- Over-scoping into internet-facing deployment planning.

## Impact Chains
### suspected
- production boundary proposal -> owner decision -> PRODUCTION_BOUNDARY_DECISIONS.md -> release-candidate-gate

### validated
- production boundary proposal -> owner decision -> PRODUCTION_BOUNDARY_DECISIONS.md -> release-candidate-gate
  - validation: proposal reviewed against current decision checklist and gate failure reasons

### discarded
- Automatic release approval.
  - reason: this task drafts decisions but does not approve them.

## Validation Plan
- Review proposal against `docs/PRODUCTION_BOUNDARY_DECISIONS.md`.
- `git diff --check`

## Progress Notes
- Release candidate gate currently fails only on five `Undecided` production
  boundaries.

## Closeout
- Created `docs/PRODUCTION_BOUNDARY_DECISION_PROPOSAL.md` with a controlled
  internal MVP recommendation for identity, storage, network, backup/restore,
  and audit/log retention.
- Updated remaining work board to link the proposal while keeping the decision
  checklist unchanged.
- Validation:
  - `git diff --check` passed
- Code review: no blocking findings; proposal explicitly states it is not
  approval and does not make release candidate gate pass.
