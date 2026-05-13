# Production Boundary Decision Proposal

## Audience

Project owner, operator, and reviewer deciding whether the current Masking App
build can be used as a controlled internal production MVP.

## Objective

Reduce the remaining release ambiguity to five explicit choices. This document
is a proposal only. It does not approve production release by itself; approval
still needs to be copied into `docs/PRODUCTION_BOUNDARY_DECISIONS.md`.

## Current Evidence

| Evidence | Status |
| --- | --- |
| Full test suite | 328 Node tests passing |
| Staging evidence | `release-artifacts/staging-evidence-20260513-after-identity-migration.json` passed on copied staging data root |
| Local production health | `release-artifacts/deployment-check-20260513-production-local.json` passed on `127.0.0.1:4183` |
| Release candidate gate | Fails only on five undecided boundaries |
| Internet-facing hardening | Not approved; external IDP and host TLS evidence are not implemented |

## Recommended Decision Set

This is the smallest production boundary that matches the current architecture
without pretending the app is internet-ready.

| Boundary | Proposed decision | Why this is the smallest safe choice | Required operating condition |
| --- | --- | --- | --- |
| Identity | Accept controlled internal local identity for first MVP deployment | Local users, hashed passwords, session auth, password policy, and strict production gate exist; external IDP is not implemented | Not internet-facing; known operators only; default seed passwords migrated |
| Metadata storage | Accept filesystem JSON for one writable app process | Current app and tests are built around project/task/version files; DB migration is useful later but not required for single-process MVP | One server process owns one data root; no shared multi-writer mount |
| Network boundary | Internal trusted network or localhost only | Current security posture is suitable for controlled internal use, not public internet exposure | Do not expose publicly; if shared internally, run behind approved reverse proxy/TLS |
| Backup/restore | Use scheduled host backup before shared use; manual backup is acceptable only for staging | Backup, restore verify, and staging evidence scripts exist; production needs a recurring owner/schedule | Assign owner, schedule, backup directory, and restore drill date |
| Audit/log retention | Use JSONL audit/runtime logs with host-managed retention for first MVP | Audit write, audit verify, retention dry-run/apply, and redaction exist | Assign owner, retention days, and rotation/archival path |

## Copy-Ready Decision Text

If the owner accepts this controlled internal MVP boundary, copy the following
values into the `Decision` column of `docs/PRODUCTION_BOUNDARY_DECISIONS.md`.

```text
Identity: Controlled internal local identity accepted for non-internet-facing MVP; external IDP required before internet-facing deployment.
Metadata storage: Filesystem JSON accepted for one writable app process per data root; DB migration required before multi-process/shared-writer deployment.
Network boundary: Localhost or trusted internal network only; internet-facing deployment blocked until external IDP and TLS/reverse proxy evidence are approved.
Backup/restore: Scheduled host backup required before shared production use; staging may use manual operator-run backup/restore.
Audit/log retention: JSONL audit/runtime files accepted with host-managed retention schedule and owner.
```

## Verification After Approval

Run these commands after updating `docs/PRODUCTION_BOUNDARY_DECISIONS.md`:

```bash
scripts/harness/release-candidate-gate.sh --json
scripts/harness/lint-all.sh
scripts/harness/typecheck-all.sh
scripts/harness/test-target.sh
scripts/harness/smoke-web.sh
git diff --check
```

Owner-approved apply helper:

```bash
scripts/harness/apply-boundary-decisions.sh \
  --preset controlled-internal-mvp \
  --owner <decision-owner> \
  --date YYYY-MM-DD \
  --apply
```

Expected result:

- `release-candidate-gate` should pass if the decision text no longer contains
  `Undecided` and the release artifacts still match the current release-relevant
  source revision.
- Other checks should remain green.

## What This Does Not Approve

- Public internet deployment.
- External customer access.
- Multiple Node server processes writing to the same data root.
- Organization SSO, MFA, centralized deactivation, or password reset.
- Database-backed metadata.
- A real AI model adapter.

## When To Choose The Larger Architecture Instead

Choose external IDP, DB-backed metadata, and full network edge deployment before
release if any of these are true:

- users are outside a trusted internal operator group
- the app is reachable from the public internet
- multiple app processes need to write to the same data root
- audit retention must be centralized in an organization logging platform
- password reset, MFA, or SSO is required
- concurrent editing becomes normal

## Open Questions For Owner

| Question | Needed before |
| --- | --- |
| Who owns local user creation/deactivation? | Shared internal use |
| What host will run the app? | Final deployment evidence |
| What URL or internal hostname will users open? | Network boundary approval |
| What backup schedule and retention are acceptable? | Production boundary approval |
| Who reviews audit/log retention monthly? | Production boundary approval |
