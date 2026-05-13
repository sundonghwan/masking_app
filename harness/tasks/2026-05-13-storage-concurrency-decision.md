# Task: storage-concurrency-decision

## Goal
- Decide and document the safe operating boundary for filesystem JSON storage
  and the trigger for database-backed metadata.

## Scope
- Current filesystem storage guarantees.
- Single-process data-root operating rule.
- Revision guard limitations.
- Database migration triggers and migration shape.
- Production readiness audit update.

## Non-goals
- Implement SQLite or PostgreSQL storage.
- Change the current manifest write path.
- Add cross-process file locks.

## Touched areas
- `docs/STORAGE_CONCURRENCY_DECISION.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `harness/run_log.md`

## Risks
- Overclaiming filesystem JSON as production-grade.
- Moving to DB too early before product contracts stabilize.
- Leaving multi-process data-root writes ambiguous.

## Impact Chains

### suspected
- createFileStorage (src/server/storage.js:19-941) -> writeProjectManifest (src/server/storage.js:55-67) -> API revision-guarded mutations (src/server/api.js)
- createFileStorage.getHierarchyPaths (src/server/storage.js:135-160) -> writeVersionManifest (src/server/storage.js:293-304) -> task/version operations

### validated
- createFileStorage (src/server/storage.js:19-941) -> writeProjectManifest (src/server/storage.js:55-67) -> API revision-guarded mutations (src/server/api.js)
  - validation: direct storage code review, existing storage/API tests via `scripts/harness/test-target.sh`, and `scripts/harness/storage-verify.sh data`.

### discarded
- immediate DB implementation
  - reason: the current production blocker is an operating decision; DB work
    should wait until concurrency/query/transaction triggers are real.

## Validation Plan
- `scripts/harness/test-target.sh`
- `scripts/harness/storage-verify.sh data`
- `scripts/harness/smoke-web.sh`
- `git diff --check`

## Closeout
- validation passed:
  - `scripts/harness/storage-verify.sh data`
  - `scripts/harness/test-target.sh`
  - `scripts/harness/smoke-web.sh`
  - `git diff --check`
- code review found no blocking issue after checking that filesystem JSON is
  explicitly limited to one writable app process per data root and that DB work
  remains gated by real concurrency/query/transaction triggers.
