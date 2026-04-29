# Database Playbook

## Audience

Agents changing schema, migrations, seed/reset logic, repositories, or write
paths.

## Current State

No database stack exists yet. The architecture reserves these records:

- Project
- ImageItem
- MaskVersion
- Review
- ExportRecord

## Initial Data Model Direction

Core MVP tables should support:

- stable project IDs
- stable image IDs
- image width and height
- current mask pointer
- status transitions
- mask version history
- export records and exclusion summaries

## Migration Rules

Once migrations exist:

- Keep schema changes small and reversible when practical.
- Do not combine unrelated schema changes.
- Add seed/reset updates with schema changes when local development depends on
  the data.
- Record migration commands in `harness/commands.md`.

## Required Impact Chains

Use impact chains for:

- any write path
- status transitions
- schema migrations
- export record generation
- seed/reset changes

Example pattern:

```text
submitImage (src/domain/images.ts:1-1) -> updateImageStatus (src/repositories/images.ts:1-1) -> insertMaskVersion (src/repositories/maskVersions.ts:1-1)
```

## Validation

Minimum database checks once DB exists:

- migration applies on empty database
- migration applies on seeded database
- seed creates a usable project and image
- reset returns database to known state
- write-heavy paths are covered by integration tests

## Risk Notes

- Image/mask metadata must not diverge from files on disk.
- Export records should keep enough detail to debug exclusions later.
- Review records should be append-style when implemented; avoid overwriting
  important decision history.
