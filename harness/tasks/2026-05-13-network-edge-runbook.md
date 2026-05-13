# Task: network-edge-runbook

## Goal
- Add a concrete TLS/reverse-proxy runbook for shared or internet-facing
  deployment planning.

## Scope
- Document Caddy and Nginx reverse-proxy examples.
- Document app env variables that must align with the proxy.
- Link the runbook from production boundary and progress docs.

## Non-goals
- Installing TLS certificates or a reverse proxy.
- Changing Node server networking behavior.
- Claiming internet-facing readiness.

## Touched areas
- `docs/RUNBOOK_NETWORK_EDGE.md`
- `docs/PRODUCTION_BOUNDARY_DECISIONS.md`
- `docs/REMAINING_WORK_BOARD.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Example configs may be copied without replacing hostnames or ports.
- A reverse-proxy runbook could be mistaken for installed TLS.

## Impact Chains
### suspected
- production boundary checklist -> network edge runbook -> release decision

### validated
- production boundary checklist -> network edge runbook -> release decision
  - validation: `scripts/harness/smoke-web.sh`, `git diff --check`

### discarded
- Runtime server code.
  - reason: the current task documents host edge setup only.

## Validation Plan
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Progress Notes
- Selected from remaining P1: TLS/reverse proxy policy is not selected, but the
  repo can provide concrete host-edge templates and verification commands.
- Added Caddy and Nginx examples plus environment, CORS, upload-size, and
  deployment-check guidance.

## Closeout
- Added `docs/RUNBOOK_NETWORK_EDGE.md`.
- Linked it from production boundary decisions, remaining work board,
  production readiness audit, and deployment runbook.
- Validation passed:
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- Code review found no blocking issue. Remaining risk: TLS/reverse proxy is not
  installed on a final host yet; this is a template and verification runbook.
