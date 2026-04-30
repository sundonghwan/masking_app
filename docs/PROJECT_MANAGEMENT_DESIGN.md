# Project Management Design

## Audience

Maintainers and agents extending project-level operations in the Masking App.

## Objective

Project management must let an admin correct project metadata and remove bad or
obsolete projects without making accidental data loss easy.

## Product Intent

The project list is the operational entry point for dataset work. A project can
be created by mistake, named poorly, or become obsolete after images are moved
to a better task/version. Operators therefore need project edit and deletion
controls before the app is used with real image batches.

The deletion model is intentionally staged:

1. **Edit** updates project name, description, upload policy, and tool presets.
2. **Archive** marks the project as deleted and hides it from normal lists.
3. **Restore** brings an archived project back.
4. **Purge** physically removes archived project files.

Immediate physical deletion is not the default because the current MVP stores
work directly on the filesystem.

## Roles

| Action | Admin | Worker | Reviewer |
| --- | --- | --- | --- |
| List active projects | yes | yes | yes |
| Include archived projects | yes | no | no |
| Open active project | yes | yes | yes |
| Edit project metadata | yes | no | no |
| Archive project | yes | no | no |
| Restore project | yes | no | no |
| Purge archived project | yes | no | no |

Archived projects are hidden from normal project lists. Non-admin users cannot
request the archived list. Admins can include archived projects, restore them,
or purge them.

## Data Contract

Project lifecycle metadata lives in the flat project manifest for compatibility
with the current local-first storage shape:

```json
{
  "project_id": "rail-mask-001",
  "name": "Rail Mask Batch",
  "description": "night batch",
  "revision": 3,
  "deleted_at": "",
  "deleted_by": "",
  "delete_reason": ""
}
```

`deleted_at` being non-empty means the project is archived. `revision` is used
for optimistic mutation guards on settings/archive/restore requests.

## API Contract

```http
GET    /api/projects
GET    /api/projects?include_deleted=1
GET    /api/projects/{project_id}
PATCH  /api/projects/{project_id}/settings
DELETE /api/projects/{project_id}
POST   /api/projects/{project_id}/restore
POST   /api/projects/{project_id}/purge
```

Archive and restore accept `if_match_revision`. Purge is only allowed after
archive and returns `409 project_not_archived` for active projects.

## UI Contract

The project screen now includes:

- admin-only toggle for archived projects
- row action: edit
- row action: archive
- row action: restore for archived projects
- row action: purge for archived projects

The workbench project settings panel also edits project name and description so
an admin can correct metadata without leaving the current project.

## Validation

Required checks for project lifecycle changes:

- API contract tests for admin-only lifecycle routes
- storage tests for manifest edit/archive/restore/purge
- app contract tests for UI wiring
- full harness validation before closeout
