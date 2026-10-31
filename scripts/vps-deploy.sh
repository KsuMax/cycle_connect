#!/usr/bin/env bash
set -euo pipefail

REPO_DIR=/opt/cycleconnect
STACK_DIR=/opt/cycleconnect-stack
COMPOSE_FILE="$STACK_DIR/compose.json"
ENV_FILE="$REPO_DIR/.env.production"
LOCK_FILE=/var/lock/cycleconnect-deploy.lock
APP_IMAGE=cycleconnect:latest
PREVIOUS_IMAGE=cycleconnect:previous

exec 9>"$LOCK_FILE"
flock 9

cd "$REPO_DIR"

if docker image inspect "$APP_IMAGE" >/dev/null 2>&1; then
  docker tag "$APP_IMAGE" "$PREVIOUS_IMAGE"
fi

docker build --secret "id=app_env,src=$ENV_FILE" -t "$APP_IMAGE" .

# Keep the private compose project and container names; only align its app
# image with the image built from this repository.
python3 - "$COMPOSE_FILE" <<'PY'
import json
import os
import pathlib
import stat
import sys
import tempfile

path = pathlib.Path(sys.argv[1])
with path.open(encoding="utf-8") as f:
    config = json.load(f)
app = config.get("services", {}).get("app")
if not isinstance(app, dict):
    raise SystemExit("compose.json must define services.app")
if app.get("image") != "cycleconnect:latest":
    app["image"] = "cycleconnect:latest"
    mode = stat.S_IMODE(path.stat().st_mode)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
            f.write("\n")
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
PY

compose=(docker compose -p cc-stage -f "$COMPOSE_FILE")
"${compose[@]}" up -d --no-deps app

gateway_id=$("${compose[@]}" ps -q gateway)
if [ -z "$gateway_id" ]; then
  echo "Gateway container was not found"
  exit 1
fi
gateway_ips=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$gateway_id")
if [ -z "$gateway_ips" ]; then
  echo "Gateway container has no internal IP"
  exit 1
fi

ready=false
for attempt in $(seq 1 30); do
  while IFS= read -r gateway_ip; do
    [ -n "$gateway_ip" ] || continue
    if curl --fail --silent --output /dev/null --max-time 5 \
      -H 'Host: localhost' "http://$gateway_ip/"; then
      ready=true
      break
    fi
  done <<< "$gateway_ips"
  [ "$ready" = true ] && break
  sleep 2
done

if [ "$ready" != true ]; then
  echo "Application did not become ready; restoring the previous image"
  if docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then
    docker tag "$PREVIOUS_IMAGE" "$APP_IMAGE"
    "${compose[@]}" up -d --no-deps app
  else
    echo "No previous image is available for rollback"
  fi
  exit 1
fi

functions_src="$REPO_DIR/supabase/functions"
functions_dst="$STACK_DIR/supabase/volumes/functions"
for function in tg-notify tg-webhook email-notify; do
  if [ -d "$functions_src/$function" ]; then
    mkdir -p "$functions_dst/$function"
    cp -a "$functions_src/$function/." "$functions_dst/$function/"
  fi
done
"${compose[@]}" restart functions

echo "Deployment completed successfully"
