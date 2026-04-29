# Task: architecture-checkpoint-docs

## Goal

- Clarify whether the current implementation matches product intent.
- Separate current MVP architecture from target architecture.
- Capture checkpoints and recommended development order before more feature work.

## Scope

- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_CHECKPOINTS.md`
- `README.md`
- `harness/repo_index.md`
- `harness/playbooks/frontend.md`
- `harness/playbooks/backend.md`
- `harness/commands.md`
- `scripts/harness/smoke-web.sh`

## Non-goals

- No feature implementation.
- No API behavior changes.
- No database/auth/review additions.

## Touched Areas

- architecture docs
- development checkpoint docs
- harness docs and smoke file checks

## Risks

- Documentation can drift if it describes target architecture as current.
- Next work can overbuild DB/auth/review before the mask/export contract is safe.

## Impact Chains

### suspected

- docs/ARCHITECTURE.md -> docs/DEVELOPMENT_CHECKPOINTS.md -> harness/playbooks/backend.md
- docs/ARCHITECTURE.md -> harness/repo_index.md -> AGENTS.md workflow

### validated

- docs/ARCHITECTURE.md -> docs/DEVELOPMENT_CHECKPOINTS.md -> harness/playbooks/backend.md
- docs/ARCHITECTURE.md -> harness/repo_index.md -> scripts/harness/smoke-web.sh

### discarded

- app runtime behavior
  - reason: this task only changes documentation and smoke required-file coverage.

## Validation Plan

- `scripts/harness/smoke-web.sh`
- `npm run lint`
- `npm test`

## Progress Notes

- Rewrote architecture around product intent, current MVP, target architecture,
  checkpoint, recommended development order, and migration triggers.
- Added a dedicated development checkpoint document.
- Updated README and harness docs to point at the checkpoint before new product
  features.

## Findings

- Current implementation is still aligned with product intent, but must close
  mask save and export contract risks before review/admin/DB/auth work.

## Closeout

- [x] Scope matched actual diff.
- [x] Relevant docs reference concrete current files.
- [x] Current MVP and target architecture are no longer mixed.
