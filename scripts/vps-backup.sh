#!/usr/bin/env bash
set -euo pipefail
umask 077

STACK_DIR=/opt/cycleconnect-stack
APP_ENV=/opt/cycleconnect/.env.production
DB_CONTAINER=cc-stage-db
BACKUP_ROOT=/var/backups/cycleconnect
LOCK_FILE=/var/lock/cycleconnect-backup.lock

mkdir -p -m 700 "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
exec 9>"$LOCK_FILE"
flock 9

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$BACKUP_ROOT/$timestamp"
mkdir -m 700 "$backup_dir"

test -f "$APP_ENV"
test -f "$STACK_DIR/restore-baseline/graphql-wrapper.sql"
test -f "$STACK_DIR/restore-baseline/database-settings.sql"
git -C /opt/cycleconnect rev-parse HEAD > "$backup_dir/source-commit.txt"

docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc \
  > "$backup_dir/database.dump"
docker exec "$DB_CONTAINER" pg_dumpall -U supabase_admin --globals-only \
  > "$backup_dir/globals.sql"

tar --create --gzip --file="$backup_dir/storage.tar.gz" \
  --xattrs --xattrs-include='*' --acls --numeric-owner \
  -C "$STACK_DIR/supabase/volumes" storage

tar --create --gzip --file="$backup_dir/configs.tar.gz" \
  --xattrs --xattrs-include='*' --acls --numeric-owner \
  --exclude=opt/cycleconnect-stack/supabase/volumes/db/data \
  --exclude=opt/cycleconnect-stack/supabase/volumes/storage \
  -C / \
  opt/cycleconnect-stack/compose.json \
  opt/cycleconnect-stack/Caddyfile \
  opt/cycleconnect-stack/db-config \
  opt/cycleconnect-stack/supabase \
  opt/cycleconnect-stack/deno-cache \
  opt/cycleconnect-stack/restore-baseline \
  opt/cycleconnect-stack/caddy-data \
  opt/cycleconnect/.env.production \
  etc/systemd/system/cc-egress.service \
  etc/systemd/system/cc-backup.service \
  etc/systemd/system/cc-backup.timer \
  etc/systemd/system/cc-finish-events.service \
  etc/systemd/system/cc-finish-events.timer \
  usr/local/bin/cc-backup.sh \
  root/.ssh/authorized_keys \
  root/.ssh/cc_egress_ed25519 \
  root/.ssh/cc-egress-known_hosts

# Validate the database archive using the matching PostgreSQL tools in its
# container, and check that both tarballs can be read before marking complete.
docker exec -i "$DB_CONTAINER" pg_restore --list \
  < "$backup_dir/database.dump" > /dev/null
tar --list --gzip --file="$backup_dir/storage.tar.gz" > /dev/null
tar --list --gzip --file="$backup_dir/configs.tar.gz" > /dev/null

(cd "$backup_dir" && sha256sum database.dump globals.sql storage.tar.gz configs.tar.gz source-commit.txt > SHA256SUMS)
(cd "$backup_dir" && sha256sum --check SHA256SUMS > /dev/null)
printf 'completed_at_utc=%s\n' "$timestamp" > "$backup_dir/COMPLETE"

# Retain only by completion-marker age so interrupted/incomplete runs survive
# for inspection and are never mistaken for a usable backup.
find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type f -name COMPLETE \
  -mmin +20160 -print0 |
  while IFS= read -r -d '' marker; do
    completed_dir=${marker%/COMPLETE}
    rm -rf -- "$completed_dir"
  done

echo "Local backup completed: $backup_dir (offsite copy is not configured)"
