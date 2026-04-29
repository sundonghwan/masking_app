# Review Checklist

## Audience

Agents and maintainers reviewing a local change before closeout.

## Scope

- Did the change stay inside the declared task scope?
- Are unrelated formatting, generated files, or renames absent?
- Are public API, schema, environment, storage, or design-contract changes
  explicitly called out?
- Are generated assets saved inside the repo when the project depends on them?

## Impact Mapping

- Does this task require impact chains because it touches a risky area?
- If yes, are chains organized as `suspected`, `validated`, and `discarded`?
- Are chains written as `Symbol (path:start-end) -> Symbol (path:start-end)`?
- Does every `validated` chain map to a validation step or direct code evidence?
- Were important line ranges refreshed close to closeout when practical?

## Validation

- Did the task run the cheapest relevant sensor first?
- Were lint, typecheck, targeted tests, or smoke checks run when available?
- Are skipped checks explained with concrete reasons?
- Did failures produce a clear next step instead of being ignored?

## Implementation Code Review

- Did a reviewer-style pass inspect the final diff for bugs and regressions?
- Are state transitions, async ordering, and persistence side effects explicit?
- Are frontend/backend contracts still aligned on field names, statuses, and
  error shapes?
- Did tests cover at least one relevant failure path for risky changes?
- Are any findings either fixed before closeout or recorded as remaining risk?

## Web App Specific

- Do route or navigation changes preserve expected user journeys?
- Do canvas changes preserve image-to-mask coordinate correctness?
- Do save/export changes preserve the binary mask contract?
- Do upload changes preserve original image immutability?
- Do validation changes catch dimension mismatch and invalid mask values?
- Do future auth/session/db/cache/background-job changes read the relevant
  playbook before editing?

## Design Specific

- Does UI work follow `DESIGN.md`?
- Does UI work use `docs/design/screens-v2/` as the active reference?
- Are controls compact, consistent, and workbench-oriented?
- Is red reserved for mask/error/rejected semantics?
- Are landing-page patterns, decorative gradients, and oversized hero text
  avoided?

## File-back

- Is there a reusable lesson worth promoting to `harness/lessons.md`?
- Is there a repeated subsystem pattern worth adding to a playbook?
- Did any command behavior require updating `harness/commands.md`?
- Is `docs/DEVELOPMENT_CHECKPOINTS.md` updated with completed and remaining
  features for the batch?

## Git Backup

- Did the completed feature batch get committed after validation passed?
- Was the commit pushed to the configured remote branch?
- If commit or push was skipped, is the reason recorded in the task closeout?
