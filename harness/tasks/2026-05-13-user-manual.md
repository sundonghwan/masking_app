# Task: user-manual

## Goal
- Create a user-facing manual for operating Masking App during local/staging
  data work.

## Scope
- Document login, roles, project creation, task/version selection, image upload,
  label setup, mask editing, review, export, training set creation, and common
  troubleshooting.
- Keep production-readiness wording honest: local/staging data work is allowed,
  final production approval still requires boundary decisions.

## Non-goals
- Changing app behavior.
- Approving production release.
- Writing an administrator-only runbook.

## Touched areas
- `docs/USER_MANUAL.md`
- `docs/REMAINING_WORK_BOARD.md`
- `harness/run_log.md`

## Risks
- Manual could mention controls that do not exist or overstate production
  readiness.
- Default local accounts could be mistaken as production credentials.

## Impact Chains
### suspected
- user manual -> data work workflow -> local/staging operation

### validated
- user manual -> data work workflow -> local/staging operation
  - validation: compared manual controls against `index.html`, `src/app.js`,
    `docs/DEVELOPMENT_CHECKPOINTS.md`, and `docs/REMAINING_WORK_BOARD.md`

### discarded
- Production approval flow.
  - reason: production release remains gated by boundary decisions.

## Validation Plan
- Compare manual terms against `index.html`, `src/app.js`, and checkpoint docs.
- `git diff --check`

## Progress Notes
- Verified current server is running on `http://localhost:4173`.
- Confirmed default MVP accounts in `docs/DEVELOPMENT_CHECKPOINTS.md`.

## Closeout
- Created `docs/USER_MANUAL.md` covering login, roles, project/task/version,
  image upload, labels, mask tools, previous mask copy, AI draft, submit/review,
  export, training sets, account management, sync, and troubleshooting.
- Updated `docs/REMAINING_WORK_BOARD.md` with a user manual link.
- Validation:
  - `git diff --check` passed
- Code review: no blocking findings; manual is explicit that local/staging data
  work is allowed but final production approval still requires boundary
  decisions.
