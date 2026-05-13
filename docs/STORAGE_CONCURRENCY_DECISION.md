# Storage And Concurrency Decision

## Audience

Maintainers deciding whether the current filesystem storage model is acceptable
for the next deployment stage.

## Objective

Define the safe operating boundary for project/task/version JSON manifests and
the trigger for moving metadata to SQLite or PostgreSQL-style storage.

## Decision

Keep filesystem storage for the local/staging MVP, with explicit operational
limits:

- one Node server process owns a data root
- one shared data root is not mounted by multiple app processes
- browser clients rely on API revision guards for project/task/version
  mutations
- backup and restore are performed at the data-root level
- production multi-user metadata should move to a database before concurrent
  editing becomes normal

This decision keeps the current implementation aligned with the product stage:
the priority is trustworthy mask output and export workflow, not premature
database infrastructure.

## Current Storage Shape

Runtime data is stored under `MASKING_APP_DATA_DIR` or `data/` by default.

Current compatibility layout:

```text
data/
  {project_id}/
    manifest.json
    images/
    masks/
    exports/
```

Newer hierarchical layout:

```text
data/
  projects/
    {project_id}/
      project.json
      tasks/
        {task_id}/
          task.json
          versions/
            {version_id}/
              manifest.json
              images/
              masks/
              exports/
              trash/
```

The hierarchy is the preferred product model. The flat layout remains readable
for compatibility.

## What The Current Model Handles

The current model is acceptable for:

- local development
- single-server staging
- small team demos on one trusted host
- image batches where operators are not editing the same image at the same time
- backup/restore by copying the data root
- project/task/version workflows where manifest size stays modest

Existing safety mechanisms:

- path segments are sanitized before filesystem access
- image and mask files use archive-relative manifest paths
- project/task/version metadata carries numeric `revision` values
- API mutations can reject stale `if_match_revision` values
- deleted projects and versions are archived before purge
- `scripts/harness/storage-verify.sh` can verify restored storage references

## What The Current Model Does Not Guarantee

Filesystem JSON manifests do not provide database-grade concurrency:

- writes are not transactional across multiple files
- there is no cross-process lock manager
- two app processes must not share the same writable data root
- revision guards prevent many stale browser writes, but they do not replace a
  database transaction
- large manifests will eventually make full-read/full-write mutation expensive
- ad hoc reporting and audit queries require file scans

This is acceptable only while the deployment boundary is single-process and the
team accepts local/staging constraints.

## Operating Rules

For local or staging operation:

1. Run exactly one writable app process per data root.
2. Keep `MASKING_APP_DATA_DIR` outside the repository for real data.
3. Run `scripts/harness/storage-verify.sh <data-root>` after restore, purge, or
   manual filesystem movement.
4. Do not edit manifest JSON files by hand unless the app is stopped and a
   backup exists.
5. Use project/task/version revision guards for admin mutations.
6. Archive before purge so accidental deletion has a recovery window.
7. Treat server logs as diagnostic evidence, not as a durable audit database.

## Database Migration Triggers

Move metadata from filesystem JSON to SQLite or PostgreSQL when any of these are
true:

- more than one app process needs to serve the same dataset
- operators commonly edit or review the same project concurrently
- lost-update conflicts become frequent in normal work
- project or version manifests become large enough to slow mutation
- audit, reporting, assignment queues, or dashboard filters require reliable
  indexed queries
- backup/restore needs point-in-time consistency while the service remains live
- external identity, organization permissions, or production incident review
  become mandatory

## Migration Shape

The migration should keep binary files in filesystem or object storage and move
metadata into a repository layer:

```text
Database
  projects
  tasks
  versions
  images
  annotations
  review_events
  assignments
  training_sets
  export_records

File/Object Storage
  originals
  binary masks
  indexed export masks
  ZIP artifacts
```

Migration order:

1. Add a repository interface behind the current API routes.
2. Implement a filesystem-backed repository adapter for existing behavior.
3. Add a DB-backed adapter and fixture migration command.
4. Run both adapters against the same contract tests.
5. Switch staging to DB metadata while preserving file/object paths.
6. Keep export ZIP metadata archive-relative.

## Current Recommendation

Do not move to a database yet just to make the MVP feel more production-shaped.
The current product still benefits more from browser E2E coverage, security
hardening, and real dataset validation. Treat the filesystem model as accepted
for local/staging, but block production multi-user deployment until metadata is
backed by a transactional store or the team explicitly accepts the single-process
constraint.
