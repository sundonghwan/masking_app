# AGENTS.md

## Purpose

This repository uses a persistent coding harness. Agents must use the harness
before changing code, docs, scripts, or generated assets.

The current project is an image masking annotation web app. The harness exists
so each task starts from the same repository map, commands, risks, design
contract, and validation loop instead of rediscovering them from scratch.

## Always Read First

1. `harness/repo_index.md`
2. `harness/commands.md`
3. Relevant files in `harness/playbooks/`
4. For UI work, also read `DESIGN.md` and `docs/design/README.md`
5. For architecture-sensitive work, also read `docs/ARCHITECTURE.md`

## Required Workflow

1. Create or update a task file in `harness/tasks/`.
2. Record goal, scope, non-goals, risks, and validation plan before editing.
3. If the task touches risky areas, add impact chains before editing.
4. Treat impact chains as working hypotheses, not proof.
5. Track impact chains with `suspected`, `validated`, and `discarded` states.
6. Keep detailed impact chains in the task file.
7. Summarize only the important task events in `harness/run_log.md`.
8. Run the smallest relevant validation after meaningful edits.
9. Before closeout, run `harness/checklists/review.md`.
10. Perform an implementation code review before declaring the task complete.
11. For routine cleanup or refactoring, use `harness/checklists/code_health.md`
    and keep behavior-preserving cleanup in its own validated batch.
12. Update the feature status list with completed and remaining work.
13. Commit and push completed feature batches after validation passes, unless the
    user explicitly asks to hold local changes.
14. Promote only repeated or reusable patterns into playbooks or `lessons.md`.

## Risky Areas

Impact chains are required for changes that touch:

- mask save/load/export contracts
- image upload or file storage
- canvas mask editing internals
- undo/redo history
- autosave or retry behavior
- validation logic
- auth/session/permission, once implemented
- database writes, migrations, or transactions, once implemented
- shared hooks, shared UI components, or shared API clients
- route guards, redirects, cache invalidation, webhooks, or background jobs

Impact chains are optional for:

- wording-only document edits
- isolated style changes
- local refactors that do not cross a module boundary

## Impact Chain Format

Use this format:

```text
Symbol (path/to/file.ts:start-end) -> Symbol (path/to/file.ts:start-end)
```

Rules:

- Prefer stable symbols over fragile line numbers.
- Use repo-root relative paths.
- Use `start-end` line ranges when practical.
- Every `validated` chain must map to at least one validation step.
- Refresh important validated line ranges before closeout when practical.

## Guardrails

- Do not make unrelated formatting changes.
- Do not rename broadly without explicit need.
- Do not edit risky areas without reading the relevant playbook.
- Do not leave generated project assets only under external temporary paths.
- Do not treat validation as optional cleanup.
- Do not promote one-off task details into long-term playbooks.

## Closeout Expectations

Final task notes should include:

- what changed
- why it changed
- how it was validated
- what code review found or explicitly found no blocking issue
- completed features and remaining work
- remaining risks or follow-ups
- whether any harness file should be updated later
- commit hash and push status for completed feature batches
