# Operations Scheduling Runbook

## Audience

Operators preparing a staging or controlled internal production deployment of
Masking App.

## Objective

Provide host scheduler templates for recurring backup, audit retention dry-run,
audit retention apply, and runtime log rotation handoff. This repository does
not install host schedulers automatically because cron, launchd, systemd, Docker
log drivers, and managed platform schedulers are deployment-specific.

## Prerequisites

- Choose the deployment host and process runner.
- Set `MASKING_APP_DATA_DIR` to a data root outside the repository.
- Set `MASKING_APP_BACKUP_DIR` to a backup directory outside the active data
  root.
- Run `docs/PRODUCTION_BOUNDARY_DECISIONS.md` before production release.
- Confirm `scripts/harness/staging-evidence.sh --json --output ...` passes on
  the target data root.

Example environment used below:

```bash
APP_DIR="/opt/masking_app"
DATA_DIR="/srv/masking-app/data"
BACKUP_DIR="/srv/masking-app/backups"
LOG_DIR="/var/log/masking-app"
```

Replace these paths with the real host paths before installing anything.

## Supported Recurring Jobs

| Job | Suggested cadence | Command | Notes |
| --- | --- | --- | --- |
| Data-root backup | Daily | `scripts/harness/backup-data-root.sh "$DATA_DIR" "$BACKUP_DIR"` | Creates `.tgz` archive and JSON sidecar |
| Storage verification | After restore and weekly | `scripts/harness/storage-verify.sh "$DATA_DIR"` | Read-only |
| Audit verification | Daily before retention | `scripts/harness/audit-verify.sh "$DATA_DIR"` | Read-only |
| Audit retention dry-run | Daily | `scripts/harness/audit-retention.sh --json "$DATA_DIR"` | Read-only; records candidates |
| Audit retention apply | Weekly or monthly | `scripts/harness/audit-retention.sh --apply "$DATA_DIR"` | Deletes only fully expired monthly audit files |
| Staging evidence | Before release | `scripts/harness/staging-evidence.sh --json --output <artifact> "$DATA_DIR" "$BACKUP_DIR"` | Includes backup/restore and production gate |
| Runtime log rotation | Host policy | Docker driver, logrotate, launchd/systemd log policy, or managed logging | App writes JSONL when `MASKING_APP_LOG_FILE` is set |

## Cron Example

Create a wrapper script owned by the deployment operator:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/masking_app"
DATA_DIR="/srv/masking-app/data"
BACKUP_DIR="/srv/masking-app/backups"
LOG_DIR="/var/log/masking-app"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

scripts/harness/audit-verify.sh "$DATA_DIR" >> "$LOG_DIR/audit-verify.log" 2>&1
scripts/harness/audit-retention.sh --json "$DATA_DIR" >> "$LOG_DIR/audit-retention-dry-run.log" 2>&1
scripts/harness/backup-data-root.sh "$DATA_DIR" "$BACKUP_DIR" >> "$LOG_DIR/backup.log" 2>&1
scripts/harness/storage-verify.sh "$DATA_DIR" >> "$LOG_DIR/storage-verify.log" 2>&1
```

Example crontab:

```cron
# Daily data-root evidence and backup at 02:15.
15 2 * * * /opt/masking_app/ops/daily-maintenance.sh

# Weekly audit retention apply at 03:30 on Sunday.
30 3 * * 0 cd /opt/masking_app && scripts/harness/audit-retention.sh --apply /srv/masking-app/data >> /var/log/masking-app/audit-retention-apply.log 2>&1
```

## launchd Example

`/Library/LaunchDaemons/com.masking-app.daily-maintenance.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.masking-app.daily-maintenance</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/masking_app/ops/daily-maintenance.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/var/log/masking-app/daily-maintenance.out.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/masking-app/daily-maintenance.err.log</string>
</dict>
</plist>
```

Install only after replacing paths and reviewing ownership:

```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/com.masking-app.daily-maintenance.plist
sudo launchctl print system/com.masking-app.daily-maintenance
```

## systemd Example

`/etc/systemd/system/masking-app-maintenance.service`:

```ini
[Unit]
Description=Masking App daily maintenance

[Service]
Type=oneshot
WorkingDirectory=/opt/masking_app
ExecStart=/opt/masking_app/ops/daily-maintenance.sh
User=masking-app
Group=masking-app
```

`/etc/systemd/system/masking-app-maintenance.timer`:

```ini
[Unit]
Description=Run Masking App daily maintenance

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

Install only after replacing paths and reviewing ownership:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now masking-app-maintenance.timer
systemctl list-timers masking-app-maintenance.timer
```

## Runtime Log Rotation

When the app is started with `MASKING_APP_LOG_FILE`, it writes sanitized JSONL
runtime logs. Rotation is host-managed.

Example logrotate-style policy:

```text
/var/log/masking-app/runtime.jsonl {
  daily
  rotate 30
  compress
  missingok
  notifempty
  copytruncate
}
```

For Docker, prefer the Docker logging driver or platform log retention policy
instead of writing app logs into the container filesystem.

## Verification

After installing a scheduler:

```bash
scripts/harness/storage-verify.sh "$DATA_DIR"
scripts/harness/audit-verify.sh "$DATA_DIR"
scripts/harness/audit-retention.sh --json "$DATA_DIR"
scripts/harness/backup-data-root.sh "$DATA_DIR" "$BACKUP_DIR"
```

Then run a release evidence bundle:

```bash
MASKING_APP_MODE=production \
MASKING_APP_ACCEPT_FILESYSTEM_PRODUCTION=1 \
MASKING_APP_ACCEPT_LOCAL_IDENTITY_PRODUCTION=1 \
scripts/harness/staging-evidence.sh --json \
  --output release-artifacts/staging-evidence-YYYYMMDD.json \
  "$DATA_DIR" "$BACKUP_DIR"
```

The release notes should include:

- scheduler type and installed unit/crontab path
- backup directory
- latest backup archive path
- latest restore rehearsal status
- audit retention dry-run or apply result
- runtime log retention policy

## Failure Handling

| Symptom | First check | Likely action |
| --- | --- | --- |
| Backup fails | backup directory path and permissions | Move backup dir outside data root; fix owner |
| Restore verify fails | backup archive integrity and storage verify output | Do not purge old backups; rerun backup after fixing storage |
| Audit verify fails | malformed JSONL or forbidden metadata | Preserve failing audit file; inspect redaction and writer path |
| Retention apply deletes nothing | retention window and monthly file dates | Confirm dry-run candidates before applying |
| Log file grows too large | host rotation policy | Install logrotate/Docker/managed retention |
| Scheduler never runs | system clock, service user, env paths | Use absolute paths and inspect scheduler logs |

## Open Questions

- Final deployment host is not selected.
- Final scheduler type is not selected.
- Final backup and retention owner are not assigned.
- Final runtime log retention window is not assigned.
