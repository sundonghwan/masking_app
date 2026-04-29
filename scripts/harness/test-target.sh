#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT"

FILTER="${1:-}"

if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
    if pnpm run | grep -q '^  test'; then
      if [ -n "$FILTER" ]; then
        exec pnpm run test -- "$FILTER"
      fi
      exec pnpm run test
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    if npm run 2>/dev/null | grep -q '^  test'; then
      if [ -n "$FILTER" ]; then
        exec npm run test -- "$FILTER"
      fi
      exec npm run test
    fi
  fi
fi

if [ -f pyproject.toml ]; then
  if command -v uv >/dev/null 2>&1; then
    if uv run pytest --version >/dev/null 2>&1; then
      if [ -n "$FILTER" ]; then
        exec uv run pytest "$FILTER"
      fi
      exec uv run pytest
    fi
  fi

  if command -v pytest >/dev/null 2>&1; then
    if [ -n "$FILTER" ]; then
      exec pytest "$FILTER"
    fi
    exec pytest
  fi
fi

echo "test-target: no test target detected yet."
echo "Add tests or a package/script, then update harness/commands.md if needed."
