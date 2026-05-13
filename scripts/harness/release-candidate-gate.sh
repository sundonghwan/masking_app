#!/usr/bin/env sh
set -eu

node scripts/harness/release-candidate-gate.mjs "$@"
