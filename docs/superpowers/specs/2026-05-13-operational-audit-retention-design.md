# Operational Audit Retention Design

## Audience

Maintainers and coding agents hardening Masking App for controlled staging or a
first production boundary.

## Objective

Define the smallest durable audit layer that can answer who performed sensitive
operations, what resource changed, when it happened, and how long that evidence
is retained.

This design is intentionally narrower than a full observability platform. It
does not replace runtime logs, external identity, or a database. It creates a
production-shaped audit trail for the current filesystem MVP.

## Current Context

The repository already has several related mechanisms:

- Runtime operational logs in `src/observability/logger.js` and `docs/LOGGING.md`.
- Optional runtime JSONL sink through `MASKING_APP_LOG_FILE`.
- Review history in image manifest `review_events`.
- Assignment/review/export runtime events in `src/server/api.js`.
- Local bearer sessions in `src/server/sessionStore.js`.
- Production readiness tracking in `docs/PRODUCTION_READINESS_AUDIT.md`.

These mechanisms are useful but not enough for durable audit retention:

- Runtime logs are diagnostic and host-rotated.
- `review_events` only cover image review history and live inside project
  manifests.
- Admin/user/session/export activity cannot be queried from one durable audit
  stream.
- Retention policy is currently an open production decision.

## Requirement

For local/staging production-like operation, the app should persist an
append-only audit stream for these sensitive actions:

- session login success
- session login failure
- session logout
- user create/update/deactivate/reactivate
- project archive/restore/purge
- image soft delete/restore
- assignment update
- review approve/reject/rework
- project export
- saved training-set create/archive/restore/export

Each audit event must include:

- `event_id`
- `created_at`
- `action`
- `actor_id`
- `actor_role`
- `resource_type`
- `resource_id`
- `project_id`, when available
- `image_id`, when available
- `outcome`: `success` or `failure`
- `reason`, when available
- `request_id`, when available
- `metadata`, only for small sanitized scalar fields

Audit events must never include:

- passwords
- bearer/session tokens
- authorization headers
- raw request bodies
- image bytes or mask bytes
- image or mask data URLs
- absolute host filesystem paths unless explicitly needed for ops evidence

## Options Considered

### Option A: Treat Runtime JSONL As Audit

Use `MASKING_APP_LOG_FILE` as the audit source.

Pros:

- No new storage code.
- Already sanitized by the logger.
- Easy to tail and ship.

Cons:

- Host log rotation can delete evidence before audit retention expires.
- Runtime events are not consistently actor/resource oriented.
- Request diagnostics and audit events have different purposes.
- Harder to verify "who did what" without parsing unrelated logs.

Decision: reject as the primary audit store. Runtime logs may mirror audit
events for diagnosis, but they should not be the durable audit database.

### Option B: Store Audit Events Inside Project Manifests

Extend project manifests with broader audit arrays.

Pros:

- Keeps project-scoped events near project data.
- No separate listing/index format.

Cons:

- Login/user events are not project-scoped.
- Large audit arrays make project manifest reads/writes heavier.
- Retention across projects becomes awkward.
- Incident review needs to scan every project.

Decision: reject for global audit. Continue keeping domain-specific
`review_events` in image records where they support the reviewer workflow.

### Option C: Append-Only Filesystem Audit Store

Add an audit store under the data root:

```text
<data_root>/
  audit/
    events-YYYY-MM.jsonl
```

Each line is a sanitized JSON audit event. The app appends events after
sensitive actions. A verifier can scan the files and validate schema, forbidden
fields, retention age, and parseability.

Pros:

- Fits the current filesystem deployment model.
- Keeps audit evidence separate from runtime logs and project manifests.
- Easy to back up with the data root.
- Easy to verify with a harness script.
- Does not require adding a database before the team accepts that migration.

Cons:

- Append writes are still local filesystem writes and share the single-process
  boundary.
- Querying is file-scan based.
- Strong tamper resistance requires host-level permissions/backups, not just app
  code.

Decision: choose Option C for the next implementation slice.

## Recommended Design

### Module Ownership

Add a focused server module:

```text
src/server/auditStore.js
```

Responsibilities:

- normalize audit event shape
- reject unsafe or empty action/resource values
- redact forbidden fields recursively from metadata
- append one JSON object per line
- list or read audit events for tests and future admin tooling
- prune events older than a configured retention window when explicitly called

Do not put audit write logic directly into route handlers. Route handlers should
construct small domain facts and call an injected audit recorder.

### API Router Integration

`createApiRouter` should accept an optional `auditStore` dependency:

```js
createApiRouter({ storage, logger, userDirectory, sessionStore, auditStore })
```

When `auditStore` is absent, the API should keep working. That preserves current
tests and local-only usage. Production-like server wiring should provide the
default filesystem audit store.

### Event Naming

Use stable action names:

```text
session.login
session.logout
user.create
user.update
user.deactivate
user.reactivate
project.archive
project.restore
project.purge
image.delete
image.restore
assignment.update
review.approve
review.reject
review.rework
project.export
training_set.create
training_set.archive
training_set.restore
training_set.export
```

Runtime logs may use `.completed` or `.failed`; audit actions should be stable
domain verbs and use `outcome` for success/failure.

### Retention

Initial retention should be configurable:

```text
MASKING_APP_AUDIT_RETENTION_DAYS=180
```

Default:

- `180` days for local/staging production-like operation.

Retention should not run silently on every request. Use an explicit cleanup
function and later a harness command:

```bash
scripts/harness/audit-verify.sh [data-root]
scripts/harness/audit-retention.sh [data-root]
```

The first implementation can add `audit-verify` before `audit-retention` if that
keeps the slice smaller.

### Backup And Restore

Audit files live under the data root, so existing backup and restore scripts
should include them automatically. The storage verifier should eventually check:

- audit directory is readable when present
- JSONL lines parse
- forbidden fields are absent
- timestamps are valid ISO strings
- required actor/action/resource fields exist

### Failure Policy

Audit write failure must not corrupt the domain mutation after the mutation has
already succeeded. The route should:

- log `audit.write.failed` through runtime logger
- include `request_id`, `action`, `resource_type`, and `resource_id`
- not include payloads, passwords, or tokens
- keep returning the domain response for non-critical local MVP operations

For a stricter production mode, a future setting may fail closed for selected
actions. That is not part of the first implementation slice.

## Implementation Slices

### Slice 1: Audit Store Foundation

Files:

- `src/server/auditStore.js`
- `tests/auditStore.test.js`
- `scripts/harness/check-syntax.mjs`

Acceptance criteria:

- appends JSONL events to `audit/events-YYYY-MM.jsonl`
- normalizes required fields
- redacts forbidden metadata keys
- rejects missing action/resource/outcome
- lists events in chronological file order

### Slice 2: Session And User Audit Events

Files:

- `src/server/api.js`
- `tests/serverApi.test.js`
- `server.js`

Acceptance criteria:

- login success writes `session.login` with `outcome=success`
- login failure writes `session.login` with `outcome=failure`
- logout writes `session.logout`
- user create/update/deactivate/reactivate write matching user audit actions
- audit write failure logs `audit.write.failed` and does not expose credentials

### Slice 3: Project, Review, Export Audit Events

Files:

- `src/server/api.js`
- `tests/serverApi.test.js`
- `src/server/storage.js`, only if storage helpers need normalized resource IDs

Acceptance criteria:

- project archive/restore/purge events are written
- image delete/restore events are written
- assignment update event is written
- review approve/reject/rework events are written
- project export and training-set export events are written

### Slice 4: Audit Verification Harness

Files:

- `scripts/harness/audit-verify.mjs`
- `scripts/harness/audit-verify.sh`
- `harness/commands.md`
- `docs/RUNBOOK_DEPLOYMENT.md`

Acceptance criteria:

- command validates JSONL parseability
- command validates required fields
- command fails if forbidden keys appear
- command reports event counts by action and outcome

## Verification Plan

Implementation should use test-first slices:

```bash
node --test tests/auditStore.test.js
node --test tests/serverApi.test.js
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
git diff --check
```

Before marking audit retention complete, run:

```bash
scripts/harness/staging-evidence.sh --json <data-root> <backup-dir>
```

after adding audit verification to the evidence bundle.

## Risks And Edge Cases

- File append can fail because of permissions or disk pressure.
- Host-level tampering is still possible unless file permissions, backups, and
  deployment controls are configured.
- Login failure audit events must not record the attempted password.
- Audit records can grow large if metadata is not kept scalar and small.
- Retention should be explicit and operator-visible; silent deletion can destroy
  evidence needed for incident review.

## Open Questions

- Should first production boundary fail closed when audit writes fail, or only
  warn and continue?
- Is 180 days acceptable for the first controlled staging/production-like
  deployment?
- Should audit export be an admin UI feature or only a harness/reporting command
  in the first release?
