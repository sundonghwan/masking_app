# Production Readiness Audit

## Audience

Maintainers and coding agents deciding whether Masking App is ready to operate
as a production labeling tool, and what must be built next before that claim is
safe.

## Objective

Turn the broad objective, "production-level masking labeling tool", into
verifiable deliverables and map each deliverable to current repository evidence.
This document is intentionally stricter than `docs/FEATURE_STATUS.md`: a feature
can be implemented while the product still lacks production operation gates.

## Audit Date

2026-05-13

## Current Verdict

The app is a strong local-first MVP with many production-shaped workflows, but
it is **not yet fully production-ready**.

Production completion is still blocked by security hardening. Storage and
concurrency limits are now explicitly accepted for local/staging only. Baseline
browser E2E, backup/restore verification, and deployment health/runbook coverage
now exist, but role-specific browser coverage, visual regression, process
supervision, and scheduled/retained backup operations can still be expanded. These are not
cosmetic gaps; they affect whether a team can safely operate the tool with real
labeling data over time.

## Success Criteria

For this repository, "production-level" means the following are true:

1. Core annotation workflow works for real users.
2. Data outputs are trustworthy for downstream training.
3. Multi-class mask workflows are explicit and exportable.
4. User roles and review flows prevent accidental data corruption.
5. Storage, backup, restore, and deletion behavior are operationally safe.
6. Runtime configuration and deployment are repeatable.
7. Logs and validation gates make failures diagnosable without exposing image
   payloads.
8. Automated verification covers critical user journeys, not just unit-level
   contracts.
9. Remaining MVP defaults are either removed or explicitly accepted as
   non-production constraints.

## Prompt-To-Artifact Checklist

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Manual mask editing with brush/erase/magic/pan | `src/editor/maskEditor.js`, `src/app.js`, `tests/maskEditor.test.js`, `tests/appContracts.test.js` | Implemented |
| Project creation/opening before workbench | `src/app.js`, `src/server/api.js`, `tests/appContracts.test.js`, `tests/serverApi.test.js` | Implemented |
| Image upload with validation | `src/upload/policy.js`, `src/server/imageMetadata.js`, multipart tests in `tests/serverApi.test.js` | Implemented |
| Mask save validation before durable mutation | `src/server/maskValidation.js`, mask save tests in `tests/serverApi.test.js` | Implemented |
| Review approve/reject/rework | `src/review/policy.js`, `src/app.js`, `tests/reviewPolicy.test.js`, `tests/serverApi.test.js` | Implemented |
| Admin assignment and user management | `src/server/userDirectory.js`, `src/app.js`, account/admin tests | Implemented for local MVP |
| Project/task/version hierarchy | `src/server/storage.js`, task/version API tests | Implemented |
| Training-set export from selected sources | `src/export/trainingSet.js`, server training-set tests | Implemented |
| Multi-class label schema and class masks | `src/annotations/labels.js`, `src/annotations/records.js`, `src/app.js`, annotation tests | Implemented |
| Class-aware export metadata | `src/export/exporter.js`, `src/export/trainingSet.js`, server export tests | Implemented |
| Derived indexed mask export | `src/export/indexedMask.js`, `src/server/api.js`, `tests/indexedMask.test.js`, `tests/serverApi.test.js` | Implemented for server ZIP |
| AI prediction import contract | `src/annotations/aiPredictions.js`, `src/server/aiServing.js`, `src/app.js`, AI contract tests | Contract implemented; real adapter pending |
| Runtime logging policy | `docs/LOGGING.md`, `src/observability/logger.js`, structured server/frontend events | Implemented baseline |
| Standard validation commands | `harness/commands.md`, `package.json`, `scripts/harness/*` | Implemented |
| Git-backed task history | `harness/tasks/`, `harness/run_log.md` | Implemented |
| Production identity provider | `docs/FEATURE_STATUS.md` hardcoded debt table | Missing |
| Database-backed metadata storage | `docs/FEATURE_STATUS.md` hardcoded debt table | Missing / intentionally deferred |
| Backup and restore procedure for filesystem data root | `docs/RUNBOOK_BACKUP_RESTORE.md`, `scripts/harness/storage-verify.sh` | Implemented baseline |
| Production deployment packaging | `docs/RUNBOOK_DEPLOYMENT.md`, `scripts/harness/deployment-check.sh`, `src/server/deploymentProfile.js` | Implemented baseline |
| Browser end-to-end smoke for login, upload, edit, submit, review, export | `scripts/harness/browser-e2e.sh` drives the real UI with `playwright-cli` | Implemented baseline |
| Performance/load limits for large datasets | Upload limits exist, but no benchmark or capacity profile | Missing |
| Security hardening beyond local bearer sessions | `docs/SECURITY_HARDENING_PLAN.md`, `src/server/sessionToken.js`, `src/server/passwords.js`, `scripts/harness/security-check.sh` | Partial executable gates |
| Filesystem storage concurrency boundary | `docs/STORAGE_CONCURRENCY_DECISION.md` defines single-process limits and DB migration triggers | Accepted local/staging constraint |
| Observability dashboard or log ingestion | Structured logs exist and credential/token redaction is covered; no dashboard or retention plan | Partial |

## Evidence From Current Validation

Recent completed feature batches ran the standard harness:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
scripts/harness/browser-e2e.sh
git diff --check
```

The latest full test run passed 243 Node tests, and the baseline browser E2E
journey passed against an isolated data root. This is strong evidence for
module/API contracts and the critical browser labeling workflow, but it is not
enough to claim production readiness while security and storage/concurrency
decisions remain unresolved.

## Production Blockers

### 1. Browser E2E Coverage

The baseline browser journey now logs in, creates a project, uploads an image,
selects a project label, verifies label-driven brush color, paints a mask,
submits, approves, and exports.

Remaining follow-up:

- add screenshots or trace artifacts if the smoke becomes flaky
- add role-specific worker/reviewer journeys once production identity is chosen

### 2. Backup And Restore Runbook

The app uses filesystem storage by default. A baseline runbook and read-only
verification command now cover:

- what path is the data root
- what files must be backed up
- how to restore a project
- how to verify restored image/mask/export consistency
- how archive/purge operations interact with backups

Remaining follow-up:

- scheduled backup automation
- retention policy
- restore rehearsal evidence for a real staging data root

### 3. Deployment Runbook

`src/server/deploymentProfile.js` centralizes host, port, public root, data root,
log level, and AI flags. A baseline deployment runbook and health check now
cover startup, `/api/health`, rollback, and release validation.

Remaining follow-up:

- process manager packaging such as launchd, systemd, Docker, or platform
  service configuration
- TLS/reverse proxy policy
- deployment evidence from a real staging host

### 4. Security Hardening

The current bearer-token sessions and role checks are enough for local MVP
operation. They are not a production identity system. The hardening plan now
documents the current hard stops and minimum sequence before shared network
deployment. The first executable gates are implemented: session tokens use
cryptographic randomness, new local user passwords are stored as PBKDF2 hashes,
and `scripts/harness/security-check.sh --strict` can fail deployment checks when
default seed or legacy plaintext passwords remain. A dry-run-first identity
password migration script exists for converting legacy plaintext local user
files after backup.

Open production decisions:

- external identity provider or local hardened account store
- password policy and reset flow
- operator-run migration for existing plaintext `identity/users.json`
- token lifetime and rotation
- CSRF/CORS policy for non-local deployment
- audit retention for admin/review actions

### 5. Storage And Concurrency Boundary

Filesystem manifests plus revision guards cover current local operations. For
multi-user production, the team must decide whether filesystem JSON remains
acceptable or whether metadata should move to SQLite/PostgreSQL-style storage.

Decision: filesystem JSON is accepted only for local/staging and single-process
operation. Production multi-user deployment remains blocked unless the team
accepts that constraint explicitly or moves metadata to a transactional store.

Trigger to migrate:

- concurrent edits become common
- project manifests grow large enough to slow reads/writes
- audit/query/reporting needs exceed file scans
- backup/restore requires transactional guarantees

## Recommended Next Development Order

1. Add browser E2E smoke for the critical labeling journey.
2. Add backup/restore runbook and a storage verification script.
3. Add deployment runbook for local/staging production-like operation.
4. Add security hardening plan for identity/session/CORS/CSRF.
5. Use the storage/concurrency decision as the DB migration gate.
6. Add real AI model adapter only after sample datasets prove the local magic
   tool is insufficient.

## Completion Rule

Do not mark the project as production-ready until:

- the browser E2E journey passes in automation,
- backup/restore can be executed from docs without guessing,
- deployment startup and health checks are documented,
- current MVP identity/storage constraints are explicitly accepted or replaced,
- and the final audit maps every success criterion above to evidence.
