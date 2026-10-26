#!/usr/bin/env bash
# Не даём агенту править файлы с секретами (.env*). Вход — JSON вызова инструмента на stdin.
f=$(python3 -c 'import sys,json; d=json.load(sys.stdin).get("tool_input",{}); print(d.get("file_path",""))' 2>/dev/null || true)
case "$(basename "$f")" in
  .env|.env.*) echo "Правка $f заблокирована: секреты меняются только вручную" >&2; exit 2 ;;
esac
exit 0
