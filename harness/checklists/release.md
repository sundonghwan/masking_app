# Release Checklist

Use this checklist before tagging or handing off a staging or production release
candidate. The app is deployable as a local/staging web app, but production
acceptance still depends on the chosen identity, storage, TLS, reverse-proxy,
backup scheduler, and log-retention boundaries.

## Scope

- Confirm the release target: local demo, staging, controlled internal
  production, or internet-facing production.
- Confirm the data root and backup directory are outside the repository for
  staging or production targets.
- Record changed features, migrations or storage-contract changes, and skipped
  checks.
- Do not claim production-ready unless identity, storage, network, scheduler,
  backup, and observability responsibilities have named owners.

## Required Checks

- Run `scripts/harness/lint-all.sh`.
- Run `scripts/harness/typecheck-all.sh`.
- Run `scripts/harness/test-target.sh`.
- Run `scripts/harness/smoke-web.sh`.
- Run `scripts/harness/browser-e2e.sh` for the admin-worker-reviewer-export
  journey.
- Run `scripts/harness/release-candidate-gate.sh` after attaching release
  evidence and recording boundary decisions.
- Run targeted tests for changed risky areas such as mask contracts, export,
  sessions, assignment lifecycle, audit logs, or storage utilities.
- Run `git diff --check`.

## Data-Root Evidence

- Run `scripts/harness/storage-verify.sh "${MASKING_APP_DATA_DIR:-data}"`.
- Run `scripts/harness/audit-verify.sh "${MASKING_APP_DATA_DIR:-data}"`.
- Run `scripts/harness/audit-retention.sh --dry-run "${MASKING_APP_DATA_DIR:-data}"`.
- Run `scripts/harness/capacity-profile.sh "${MASKING_APP_DATA_DIR:-data}"`.
- Run a backup and restore rehearsal for the release data root.
- Run the staging evidence bundle and archive its JSON artifact:

```bash
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json \
  --output release-artifacts/staging-evidence-YYYYMMDD.json \
  --base-url http://127.0.0.1:4173 \
  "${MASKING_APP_DATA_DIR:-data}" \
  "${MASKING_APP_BACKUP_DIR:-backups}"
```

## Production Gate

- Run `scripts/harness/production-gate.sh` against the real target data root.
- Confirm default seed passwords are removed or rotated.
- Confirm local user passwords are hashed and strict identity checks pass.
- Set `MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1` only after accepting the
  filesystem JSON metadata boundary.
- Set `MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1` only for a controlled
  first production boundary, or replace local identity with an external
  provider before internet-facing deployment.

## Release Notes

- Link the archived staging evidence JSON.
- Link browser E2E output or record its project id.
- Record backup archive path and restore rehearsal status.
- Record remaining risks, skipped checks, and owner/date for each follow-up.
- Record commit hash and push status.
