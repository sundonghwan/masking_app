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

Production completion is blocked by deployment, operational backup/restore,
security hardening, browser end-to-end validation, and storage/concurrency
decisions. These are not cosmetic gaps; they affect whether a team can safely
operate the tool with real labeling data over time.

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
| Backup and restore procedure for filesystem data root | No dedicated runbook found | Missing |
| Production deployment packaging | `src/server/deploymentProfile.js` exists, but no deployment runbook or service definition | Partial |
| Browser end-to-end smoke for login, upload, edit, submit, review, export | Current `scripts/harness/smoke-web.sh` checks files only | Missing |
| Performance/load limits for large datasets | Upload limits exist, but no benchmark or capacity profile | Missing |
| Security hardening beyond local bearer sessions | Local sessions and RBAC exist; no CSRF/CORS/session rotation policy documented | Partial |
| Observability dashboard or log ingestion | Structured logs exist; no dashboard or retention plan | Missing |

## Evidence From Current Validation

Recent completed feature batches ran the standard harness:

```bash
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
git diff --check
```

The latest full test run passed 242 Node tests. This is strong evidence for
module/API contracts, but it is not enough to claim production readiness because
the current smoke script does not exercise the browser workflow end to end.

## Production Blockers

### 1. Browser E2E Coverage

Current smoke only verifies required files and static references. Production
readiness needs an automated browser journey that logs in, opens or creates a
project, uploads an image, paints or imports a mask, saves, submits, reviews,
and exports.

Recommended next artifact:

- `scripts/harness/browser-e2e.sh`
- a lightweight Playwright or browser automation test if dependencies are
  accepted
- fixture image/mask data under a test-only location

### 2. Backup And Restore Runbook

The app uses filesystem storage by default. Production operation needs a clear
procedure for:

- what path is the data root
- what files must be backed up
- how to restore a project
- how to verify restored image/mask/export consistency
- how archive/purge operations interact with backups

Recommended next artifact:

- `docs/RUNBOOK_BACKUP_RESTORE.md`
- storage verification command or script

### 3. Deployment Runbook

`src/server/deploymentProfile.js` centralizes host, port, public root, data root,
log level, and AI flags. That is a good foundation, but production operation
still needs repeatable launch instructions and health checks.

Recommended next artifact:

- `docs/RUNBOOK_DEPLOYMENT.md`
- documented environment variables
- startup, health, rollback, and log inspection steps

### 4. Security Hardening

The current bearer-token sessions and role checks are enough for local MVP
operation. They are not a production identity system.

Open production decisions:

- external identity provider or local hardened account store
- password policy and reset flow
- token lifetime and rotation
- CSRF/CORS policy for non-local deployment
- audit retention for admin/review actions

### 5. Storage And Concurrency Boundary

Filesystem manifests plus revision guards cover current local operations. For
multi-user production, the team must decide whether filesystem JSON remains
acceptable or whether metadata should move to SQLite/PostgreSQL-style storage.

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
5. Re-evaluate database-backed storage after filesystem operations show real
   bottlenecks or concurrency limits.
6. Add real AI model adapter only after sample datasets prove the local magic
   tool is insufficient.

## Completion Rule

Do not mark the project as production-ready until:

- the browser E2E journey passes in automation,
- backup/restore can be executed from docs without guessing,
- deployment startup and health checks are documented,
- current MVP identity/storage constraints are explicitly accepted or replaced,
- and the final audit maps every success criterion above to evidence.
