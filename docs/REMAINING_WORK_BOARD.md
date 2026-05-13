# Remaining Work Board

## Audience

Maintainers, reviewers, and coding agents tracking whether Masking App can be
claimed as a production-level masking labeling tool.

## Objective

Show the current progress without forcing readers to scan the full feature list
or production audit. This board separates:

- product features that users can already operate
- production gates that still need real environment evidence or decisions
- optional hardening that should not block the current MVP unless real usage
  proves it is needed

## Current Position

| Area | Status | Evidence |
| --- | --- | --- |
| Core masking workflow | Done | Brush, erase, magic, pan, submit, review, export covered by unit/API/browser tests |
| Role workflow | Done | Login, admin, worker, reviewer, assignment, review, logout implemented |
| Project operations | Done | Create, edit, archive, restore, purge, image remove/restore implemented |
| File hierarchy | Done | Project/task/version storage and version clone/delete/restore implemented |
| Multi-class masks | Done for MVP | Label schema, selected label color, per-class masks, class-aware export/training metadata implemented |
| Training-set output | Done | Selected sources, saved training sets, deterministic split, re-export/archive/restore implemented |
| AI serving | Contract done | Generic detection/segmentation/classification API contract exists; real model adapter is deferred |
| Validation harness | Strong baseline | lint, typecheck, 325 Node tests, smoke, browser E2E entrypoint, production gate, staging evidence bundle, release artifact revision checks |
| Code health | Active cleanup | Project settings and assignment route helpers extracted; larger route blocks remain |
| Production readiness | Not complete | Identity/storage/host evidence decisions remain |

Decision checklist: `docs/PRODUCTION_BOUNDARY_DECISIONS.md`.
Decision proposal: `docs/PRODUCTION_BOUNDARY_DECISION_PROPOSAL.md`.
Release candidate gate: `scripts/harness/release-candidate-gate.sh`.

## Remaining Production Gates

| Priority | Item | Why it matters | Current state | Done when |
| --- | --- | --- | --- | --- |
| P0 | Real staging evidence artifact | We need proof against representative data, not only synthetic tests | Captured against a copied staging data root after identity password migration | Evidence artifact is archived at `release-artifacts/staging-evidence-20260513-after-identity-migration.json`; repeat on the final target data root before release |
| P0 | Identity boundary decision | Local accounts are acceptable for local/controlled internal use, not internet-facing production by default | Local account hardening and production acceptance gate exist; decision checklist exists | Team either adopts external IDP or explicitly accepts local identity for controlled internal deployment |
| P0 | Production data-root gate | Prevents unsafe repo-local data roots, default seed passwords, and weak identity state | Passed against the copied staging data root after password migration | Gate passes against the final target data root after backup and password migration |
| P1 | Storage/concurrency decision | Filesystem JSON is safe only within known single-process/local-staging limits | Decision docs accept filesystem for local/staging and require explicit release acceptance | Team accepts filesystem for first shared deployment or schedules SQLite/Postgres migration |
| P1 | Host deployment evidence | Docker/runbook exists, but the actual host setup still needs proof | Local production-mode health evidence captured at `release-artifacts/deployment-check-20260513-production-local.json` | Final target host has recorded health/deployment evidence |
| P1 | TLS/reverse proxy policy | Required for shared network or internet-facing use | `docs/RUNBOOK_NETWORK_EDGE.md` provides Caddy/Nginx templates; not host-installed | TLS/reverse proxy owner and config are recorded |
| P1 | Backup/audit/log retention scheduler | Scripts exist, but recurring host operation needs installation | Backup, restore, audit verify, audit retention dry-run exist; `docs/RUNBOOK_OPERATIONS_SCHEDULING.md` provides cron/launchd/systemd templates | Host scheduler and retention policy are installed or explicitly deferred with owner/date |
| P2 | Capacity target evidence | We need to know first real dataset size and file-store limits | Local data-root profile archived at `release-artifacts/capacity-profile-20260513-local.json` | Repeat capacity profile on the final target data root before release |
| P2 | Browser trace/screenshots | Useful when E2E flakes or UI regressions are suspected | Browser E2E exists | Trace/screenshot artifacts are added if flakiness appears |

## Optional Product Hardening

These are useful but should not block the current MVP unless real data shows a
need.

| Item | Trigger |
| --- | --- |
| Real AI segmentation adapter | Local edge-aware magic tool is too slow or inaccurate on actual datasets |
| Database-backed metadata | Concurrent edits, large manifests, reporting, or transactional backup requirements exceed filesystem JSON |
| Stronger organization password policy | Controlled internal deployment requires stricter local account rules |
| Visual regression suite | UI changes become frequent enough that manual/browser smoke misses layout issues |

## Latest Verified State

- Last full test count: 319 Node tests passing.
- Latest staging evidence artifact:
  `release-artifacts/staging-evidence-20260513-after-identity-migration.json`
  passed after applying identity password migration to a copied staging data
  root.
- Latest local production health artifact:
  `release-artifacts/deployment-check-20260513-production-local.json` passed
  against `127.0.0.1:4183` in production mode using the migrated copied data
  root and source revision metadata.
- Latest local capacity profile artifact:
  `release-artifacts/capacity-profile-20260513-local.json` passed on the
  current local `data/` root with 202 images and no threshold warnings.
- Release candidate gate currently fails only because required boundary
  decisions remain `Undecided`.
- Controlled internal MVP decision proposal exists at
  `docs/PRODUCTION_BOUNDARY_DECISION_PROPOSAL.md`; it still requires owner
  approval before copying into the decision checklist.
- Last pushed commits:
  - `9cf5459` - remaining work board
  - `3be9ba0` - assignment route helper refactor
  - `296867b` - project settings route helper refactor
- Current production verdict: not yet production-ready.
- Current practical verdict: strong local/staging MVP; production claim requires
  the gates above.

## Next Recommended Action

Repeat staging evidence on the final target data root before release:

```bash
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json \
  --output release-artifacts/staging-evidence-YYYYMMDD.json \
  --base-url http://127.0.0.1:4173 \
  "${MASKING_APP_DATA_DIR:-data}" \
  "${MASKING_APP_BACKUP_DIR:-backups}"
```

This should be run against a representative staging data root, not the empty
developer fixture data. If it fails, the failed JSON artifact is still valuable
because it tells us exactly which production gate is blocking release.
