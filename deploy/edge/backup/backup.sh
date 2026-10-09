#!/bin/bash
# Backup loop for the edge cell (runs in the `backup` service, postgres:16 image).
#
#   backup.sh          loop forever: back up now, then every BACKUP_INTERVAL_HOURS
#   backup.sh once     one backup, then exit (./install.sh backup)
#
# Output in /backups (the host's BACKUP_DIR):
#   <DB>.<UTC timestamp>.dump         pg_dump custom format, one per database (restore: see README / ./install.sh restore)
#   files.<UTC timestamp>.tar.gz      encrypted clinical records + JWT signing keys (the volumes mounted under /data)
# Files older than BACKUP_RETENTION_DAYS are deleted after each successful run.
#
# NOT included: .env and hub-bootstrap.env (they hold the secrets; keep a copy somewhere safe, separate from the dumps).
set -u

: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_RETENTION_DAYS:=14}"
: "${BACKUP_DATABASES:=}"
OUT=/backups

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

wait_for_db() {
  local i
  for i in $(seq 1 60); do
    pg_isready -q -d postgres && return 0
    sleep 5
  done
  return 1
}

run_once() {
  local ts db failed=0
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$OUT"

  wait_for_db || { log "postgres is not reachable"; return 1; }

  for db in $BACKUP_DATABASES; do
    if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
      log "skip $db (database does not exist)"
      continue
    fi
    if pg_dump -Fc -d "$db" -f "$OUT/$db.$ts.dump.part"; then
      mv "$OUT/$db.$ts.dump.part" "$OUT/$db.$ts.dump"
      log "dumped $db"
    else
      rm -f "$OUT/$db.$ts.dump.part"
      log "FAILED to dump $db"
      failed=1
    fi
  done

  if [ -d /data ]; then
    if tar -czf "$OUT/files.$ts.tar.gz.part" -C /data . 2>/dev/null; then
      mv "$OUT/files.$ts.tar.gz.part" "$OUT/files.$ts.tar.gz"
      log "archived files (records, keys)"
    else
      rm -f "$OUT/files.$ts.tar.gz.part"
      log "FAILED to archive files"
      failed=1
    fi
  fi

  if [ "$failed" -eq 0 ]; then
    find "$OUT" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.tar.gz' \) -mtime "+$BACKUP_RETENTION_DAYS" -print -delete |
      while read -r f; do log "pruned $f"; done
  else
    log "retention pruning skipped because this run had failures"
  fi
  return "$failed"
}

if [ "${1:-}" = "once" ]; then
  run_once
  exit $?
fi

while true; do
  run_once || true
  sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
done
