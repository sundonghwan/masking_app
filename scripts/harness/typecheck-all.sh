#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT"

if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
    if pnpm run | grep -q '^  typecheck'; then
      exec pnpm run typecheck
    fi
    if pnpm run | grep -q '^  type-check'; then
      exec pnpm run type-check
    fi
    if pnpm run | grep -q '^  tsc'; then
      exec pnpm run tsc
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    if npm run 2>/dev/null | grep -q '^  typecheck'; then
      exec npm run typecheck
    fi
    if npm run 2>/dev/null | grep -q '^  type-check'; then
      exec npm run type-check
    fi
    if npm run 2>/dev/null | grep -q '^  tsc'; then
      exec npm run tsc
    fi
  fi
fi

if [ -f pyproject.toml ]; then
  if command -v uv >/dev/null 2>&1; then
    if uv run mypy --version >/dev/null 2>&1; then
      exec uv run mypy .
    fi
    if uv run pyright --version >/dev/null 2>&1; then
      exec uv run pyright
    fi
  fi

  if command -v mypy >/dev/null 2>&1; then
    exec mypy .
  fi
  if command -v pyright >/dev/null 2>&1; then
    exec pyright
  fi
fi

echo "typecheck-all: no typecheck target detected yet."
echo "Add a package/script or type checker config, then update harness/commands.md if needed."
