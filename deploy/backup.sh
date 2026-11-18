#!/bin/sh
# Encrypted daily backup of the JIREX database and payment receipts.
# Runs inside the "backup" service in docker-compose.yml (once at start, then every 24 hours).
#
# Output: backups/jirex-YYYY-MM-DD_HHMM.tar.gz.enc  (AES-256, password = BACKUP_PASSWORD)
# Restore with: deploy/restore.sh backups/<file>
set -eu
: "${BACKUP_PASSWORD:?Set BACKUP_PASSWORD in the .env file next to docker-compose.yml}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP=$(date +%Y-%m-%d_%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 1. Database (custom format: compact, restores cleanly with pg_restore)
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U jirex -d jirex --format=custom --file="$WORK/database.dump"

# 2. Receipts (already encrypted individually; included so a restore is complete)
tar -C /receipts -cf "$WORK/receipts.tar" .

# 3. Pack and encrypt. Without BACKUP_PASSWORD the file is unreadable.
tar -C "$WORK" -czf - database.dump receipts.tar |
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSWORD \
    -out "/backups/jirex-$STAMP.tar.gz.enc"

# 4. Keep only the last KEEP_DAYS days
find /backups -name 'jirex-*.tar.gz.enc' -mtime +"$KEEP_DAYS" -delete
echo "[backup] saved jirex-$STAMP.tar.gz.enc ($(du -h "/backups/jirex-$STAMP.tar.gz.enc" | cut -f1))"
