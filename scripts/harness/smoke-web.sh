#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT"

missing=0

require_file() {
  if [ ! -f "$1" ]; then
    echo "smoke-web: missing required file: $1"
    missing=1
  fi
}

require_file PROJECT.md
require_file docs/ARCHITECTURE.md
require_file docs/DEVELOPMENT_CHECKPOINTS.md
require_file docs/LOGGING.md
require_file DESIGN.md
require_file docs/design/README.md
require_file harness/repo_index.md
require_file harness/commands.md
require_file harness/checklists/review.md
require_file harness/checklists/code_health.md
require_file index.html
require_file package.json
require_file Dockerfile
require_file docker-compose.yml
require_file .dockerignore
require_file server.js
require_file src/app.js
require_file src/api/client.js
require_file src/editor/maskEditor.js
require_file src/export/exporter.js
require_file src/export/zip.js
require_file src/storage/projectStore.js
require_file src/observability/logger.js
require_file src/server/api.js
require_file src/server/httpSecurity.js
require_file src/server/httpUtils.js
require_file src/server/maskValidation.js
require_file src/server/passwords.js
require_file src/server/sessionToken.js
require_file src/server/storage.js
require_file src/styles.css
require_file scripts/harness/browser-e2e.sh
require_file scripts/harness/browser-e2e.mjs
require_file scripts/harness/check-syntax.mjs
require_file scripts/harness/storage-verify.sh
require_file scripts/harness/storage-verify.mjs
require_file scripts/harness/deployment-check.sh
require_file scripts/harness/deployment-check.mjs
require_file scripts/harness/security-check.sh
require_file scripts/harness/security-check.mjs
require_file scripts/harness/identity-migrate-passwords.sh
require_file scripts/harness/identity-migrate-passwords.mjs
require_file scripts/harness/capacity-profile.sh
require_file scripts/harness/capacity-profile.mjs
require_file scripts/harness/backup-data-root.sh
require_file scripts/harness/backup-data-root.mjs
require_file scripts/harness/restore-verify.sh
require_file scripts/harness/restore-verify.mjs
require_file scripts/harness/production-gate.sh
require_file scripts/harness/production-gate.mjs
require_file scripts/harness/staging-evidence.sh
require_file scripts/harness/staging-evidence.mjs

require_file docs/design/screens-v2/01-main-mask-editor.png
require_file docs/design/screens-v2/02-dataset-upload.png
require_file docs/design/screens-v2/03-export-setup-result.png
require_file docs/design/screens-v2/04-project-home.png
require_file docs/design/screens-v2/05-review-validation.png
require_file docs/design/screens-v2/06-operations-dashboard.png
require_file docs/design/screens-v2/07-keyboard-settings.png

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "smoke-web: planning/design/harness references are present."
echo "smoke-web: backend/static MVP app files are present."
echo "smoke-web: Docker deployment packaging files are present."
echo "smoke-web: browser E2E harness entrypoint is present."
echo "smoke-web: syntax check harness entrypoint is present."
echo "smoke-web: storage verification entrypoint is present."
echo "smoke-web: deployment check entrypoint is present."
echo "smoke-web: security check entrypoint is present."
echo "smoke-web: capacity profile entrypoint is present."
echo "smoke-web: data-root backup entrypoint is present."
echo "smoke-web: restore rehearsal entrypoint is present."
echo "smoke-web: production gate entrypoint is present."
echo "smoke-web: staging evidence entrypoint is present."
