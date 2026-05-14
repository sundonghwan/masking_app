#!/usr/bin/env sh
set -eu

node scripts/harness/migrate-file-storage-to-object-db.mjs "$@"
