#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
    if pnpm run | grep -q '^  lint'; then
      exec pnpm run lint
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    if npm run 2>/dev/null | grep -q '^  lint'; then
      exec npm run lint
    fi
  fi
fi

if [ -f pyproject.toml ]; then
  if command -v uv >/dev/null 2>&1; then
    if uv run ruff --version >/dev/null 2>&1; then
      exec uv run ruff check .
    fi
  fi

  if command -v ruff >/dev/null 2>&1; then
    exec ruff check .
  fi
fi

echo "lint-all: no lint target detected yet."
echo "Add a package/script or tool config, then update harness/commands.md if needed."
