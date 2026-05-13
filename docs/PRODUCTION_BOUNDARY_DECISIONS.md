# Production Boundary Decisions

## Audience

Project owner, operator, reviewer, and coding agents deciding whether the
current Masking App build can be deployed beyond local development.

## Objective

Make the remaining production decisions explicit. Passing tests and staging
evidence prove that the current build behaves correctly under the checked
conditions; they do not decide whether the chosen identity, storage, and host
operations are acceptable for a real deployment.

## Current Evidence

| Evidence | Status |
| --- | --- |
| Full Node test suite | 319 tests passing |
| Browser E2E baseline | Implemented for admin, worker, reviewer, submit, approve, export |
| Staging evidence artifact | `release-artifacts/staging-evidence-20260513-after-identity-migration.json` passed on a copied data root after identity password migration |
| Production gate | Passed on copied staging data root after password migration and explicit local identity/filesystem acceptance |
| Local production health | `release-artifacts/deployment-check-20260513-production-local.json` passed on `127.0.0.1:4183` in production mode |
| Storage model | Filesystem JSON accepted for local/staging/single-process only |
| External identity provider | Not implemented |
| Host scheduler templates | `docs/RUNBOOK_OPERATIONS_SCHEDULING.md` provides cron, launchd, and systemd examples; not installed |
| Host TLS/reverse proxy | `docs/RUNBOOK_NETWORK_EDGE.md` provides Caddy and Nginx examples; not installed |

## Decision Summary

Fill this table before claiming a production release.

| Boundary | Option A | Option B | Current recommendation | Decision |
| --- | --- | --- | --- | --- |
| Identity | Controlled internal local identity with explicit acceptance | External identity provider before shared/internet deployment | Use local identity only for controlled internal deployment; use external IDP for internet-facing deployment | Undecided |
| Metadata storage | Filesystem JSON, one writable app process per data root | SQLite/PostgreSQL metadata with filesystem/object binary files | Keep filesystem for local/staging; require explicit acceptance or DB migration for shared production | Undecided |
| Network boundary | Localhost or trusted internal network | Internet-facing deployment | Do not expose to internet until external IDP and TLS/reverse proxy are selected | Undecided |
| Backup/restore | Manual operator-run backup/restore | Scheduled host backup and retention | Manual is acceptable for staging; production needs owner and schedule | Undecided |
| Audit/log retention | JSONL runtime/audit files with manual retention | Host-managed retention/log ingestion | Use current files for staging; production needs retention owner and schedule | Undecided |
| AI adapter | Local edge-aware magic + generic API contract | Real model adapter | Defer real adapter until dataset proves the local tool is insufficient | Deferred |

## Identity Boundary

### Controlled Internal Local Identity

This is acceptable only when all are true:

- deployment is not internet-facing
- users are known operators on a trusted internal network
- `identity/users.json` has no plaintext passwords
- default seed passwords are no longer valid
- `scripts/harness/production-gate.sh` passes on the target data root
- `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` is set intentionally
- the operator accepts that password reset, MFA, centralized deactivation, and
  organization SSO are out of scope

Evidence to attach:

```bash
scripts/harness/identity-migrate-passwords.sh --apply <target-data-root>
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/production-gate.sh <target-data-root>
```

### External Identity Provider

Choose this before internet-facing deployment or when any of these are required:

- SSO
- MFA
- centralized user lifecycle
- organization-wide audit and deactivation
- password reset
- multiple apps sharing user identity

Required follow-up if chosen:

- define external token/session contract
- map external roles to `admin`, `worker`, `reviewer`
- replace or disable local password login for production
- update browser E2E credentials and deployment runbook
- extend production gate so local identity acceptance is no longer required

## Storage Boundary

### Filesystem JSON

Acceptable only when all are true:

- one Node server process owns the writable data root
- one shared data root is not mounted by multiple app processes
- operators do not commonly edit the same image at the same time
- target data root passes storage verification, capacity profile, backup, and
  restore rehearsal
- backup/restore is data-root level and the app can be stopped for recovery

Evidence to attach:

```bash
scripts/harness/storage-verify.sh <target-data-root>
scripts/harness/capacity-profile.sh <target-data-root>
scripts/harness/backup-data-root.sh <target-data-root> <backup-dir>
scripts/harness/restore-verify.sh <backup-archive>
```

### Database Metadata

Choose this when any of these become true:

- multiple app processes must serve the same data root
- concurrent editing/review conflicts become normal
- project/version manifests grow enough to slow mutation
- dashboard/reporting/audit queries need indexes
- backup/restore needs transactional point-in-time guarantees

Recommended migration shape:

- keep original images, binary masks, indexed masks, and ZIP artifacts in
  filesystem/object storage
- move projects, tasks, versions, images, annotations, review events,
  assignments, training sets, and export records into SQLite/PostgreSQL
- add repository adapters and run filesystem and DB adapters against the same
  contract tests

## Host Operations Boundary

Before controlled production, record:

- deployment target: Docker Compose, launchd, systemd, or managed platform
- public URL and `MASKING_APP_PUBLIC_URL`
- TLS/reverse proxy owner
  - use `docs/RUNBOOK_NETWORK_EDGE.md` for Caddy/Nginx examples and verification
- backup schedule and restore drill owner
- audit retention schedule
- runtime log path and rotation policy
- scheduler implementation path or explicit deferral, using
  `docs/RUNBOOK_OPERATIONS_SCHEDULING.md` as the template source
- staging evidence artifact path
- rollback command and last tested date

Minimum release command set:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/browser-e2e.sh
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json \
  --output release-artifacts/staging-evidence-YYYYMMDD.json \
  <target-data-root> <backup-dir>
```

## Release Decision Template

Copy this block into release notes:

```text
Release candidate:
Commit:
Target data root:
Staging evidence artifact:
Identity decision: local accepted / external IDP
Storage decision: filesystem accepted / DB required
Network decision: local / internal / internet-facing
Backup owner and schedule:
Audit/log retention owner and schedule:
Production gate status:
Known unresolved risks:
Decision owner:
Decision date:
```

## Current Verdict

The current build can be treated as a strong local/staging MVP with a passing
staging evidence artifact on a copied data root after identity password
migration. It should not be called fully production-ready until this document
has explicit decisions for the target deployment.
