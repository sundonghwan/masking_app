#!/bin/sh
set -eu
node scripts/harness/db-migrate.mjs "$@"
