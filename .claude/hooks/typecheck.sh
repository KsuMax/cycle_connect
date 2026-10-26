#!/usr/bin/env bash
# После правки .ts/.tsx показываем ошибки tsc (не блокирует).
f=$(python3 -c 'import sys,json; d=json.load(sys.stdin).get("tool_input",{}); print(d.get("file_path",""))' 2>/dev/null || true)
case "$f" in *.ts|*.tsx) ;; *) exit 0 ;; esac
cd "$CLAUDE_PROJECT_DIR"
[ -d node_modules ] || exit 0
npx tsc --noEmit 2>&1 | tail -20
exit 0
