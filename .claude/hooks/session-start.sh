#!/usr/bin/env bash
# Облачная сессия Claude Code стартует с чистого клона: ставим зависимости,
# чтобы работали tsc/vitest и документация Next в node_modules/next/dist/docs.
# Локально (на Mac) ничего не делаем.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
[ -d node_modules ] || npm ci --no-audit --no-fund
