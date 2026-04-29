# Task: bootstrap-agent-harness

## Goal

- Build the initial AI coding harness for the Masking App repository.
- Adapt the provided generic webapp harness plan to this project's current
  planning/design stage.

## Scope

- Root agent instructions.
- Harness repository map, commands, logs, lessons, task template.
- Frontend/backend/database/testing/auth/billing playbooks.
- Review/release/incident checklists.
- Minimal validation wrapper scripts.

## Non-goals

- Selecting the app framework.
- Implementing the web application.
- Adding real lint/typecheck/test tools before a stack exists.
- Creating auth, billing, or database implementation.

## Touched Areas

- `AGENTS.md`
- `harness/`
- `scripts/harness/`

## Risks

- Harness could pretend validation exists before the app stack exists.
- Playbooks could become generic boilerplate instead of reflecting Masking App
  requirements.
- Scripts could fail unclearly in the current repo stage.

## Impact Chains

This task is documentation and harness scaffolding. Detailed code impact chains
are not required because no application runtime path exists yet.

### suspected

- Agent workflow reads `AGENTS.md` -> `harness/repo_index.md` -> relevant
  playbook -> `harness/commands.md`

### validated

- `scripts/harness/smoke-web.sh` -> verifies planning/design/harness references
  exist.
- `scripts/harness/lint-all.sh` -> detects no lint target and exits clearly.
- `scripts/harness/typecheck-all.sh` -> detects no typecheck target and exits
  clearly.
- `scripts/harness/test-target.sh` -> detects no test target and exits clearly.

### discarded

- App route smoke chain
  - reason: no runnable web app exists yet.

## Validation Plan

- `scripts/harness/smoke-web.sh` -> required planning/design/harness files and
  active v2 design screens exist.
- `scripts/harness/lint-all.sh` -> current no-stack state is handled clearly.
- `scripts/harness/typecheck-all.sh` -> current no-stack state is handled
  clearly.
- `scripts/harness/test-target.sh` -> current no-stack state is handled clearly.

## Progress Notes

- The repository currently contains planning, architecture, design, and generated
  screen references only.
- Harness commands are framework-detecting by design and should be updated once
  the first application stack is introduced.

## Findings

- `docs/design/screens-v2/` is the active implementation reference.
- The first real smoke upgrade should check project home, upload, editor, save,
  submit, and export routes after app scaffold.

## File-back Candidates

- Once the first stack is selected, update `harness/commands.md`,
  `harness/playbooks/frontend.md`, `harness/playbooks/backend.md`, and wrapper
  scripts with concrete commands.

## Closeout

- [x] Scope matched actual diff.
- [x] Review checklist completed.
- [x] Validated chains have validation evidence.
- [x] Relevant commands were run or explicitly skipped with reason.
- [x] Reusable findings were considered for `lessons.md` or playbooks.
