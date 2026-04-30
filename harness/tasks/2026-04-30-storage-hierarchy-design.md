# Task: storage-hierarchy-design

## Goal

- Design a project/task/version file-storage hierarchy before implementing
  storage, API, UI, deletion, versioning, and migration changes.

## Scope

- Create `docs/STORAGE_HIERARCHY_DESIGN.md`.
- Define target file layout, metadata schemas, deletion/restore, version clone,
  export, API plan, frontend flow, migration, smoke data isolation, phases, and
  risks.

## Non-goals

- Implement storage helpers.
- Change API routes.
- Migrate existing `data/`.
- Delete or move local runtime data.

## Touched Areas

- `docs/STORAGE_HIERARCHY_DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/FEATURE_STATUS.md`
- `harness/tasks/2026-04-30-storage-hierarchy-design.md`
- `harness/run_log.md`

## Risks

- Over-designing before the current MVP needs it.
- Leaving the delete/restore policy ambiguous.
- Designing a layout that breaks archive-relative export paths.

## Impact Chains

### suspected

- None. Design-only task.

### validated

- `docs/ARCHITECTURE.md` -> `docs/STORAGE_HIERARCHY_DESIGN.md` -> future storage/API/UI implementation plans
  - validation: document references the current project-level layout and keeps
    legacy route/storage compatibility during migration.

### discarded

- Immediate implementation.
  - reason: user requested brainstorming/design first; implementation waits
    until the design is reviewed.

## Validation Plan

- `rg "project/task/version|trash|migration|archive-relative|legacy" docs/STORAGE_HIERARCHY_DESIGN.md`
- `git diff --check`
- `./scripts/harness/smoke-web.sh`

## Progress Notes

- Created `docs/STORAGE_HIERARCHY_DESIGN.md`.
- Linked the new design from `docs/ARCHITECTURE.md`.
- Marked storage hierarchy design complete and implementation future work in
  `docs/FEATURE_STATUS.md`.
- Self-review found no placeholder sections; the design keeps legacy storage
  compatibility during migration and preserves archive-relative export paths.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [ ] Commit and push completed.
