#!/usr/bin/env bash
# Restores a JIREX backup made by deploy/backup.sh.
#
# Usage (on the web server, in the project folder):
#   bash deploy/restore.sh backups/jirex-2026-11-16_0300.tar.gz.enc
#
# It REPLACES the current database and receipts with the backup's contents.
set -euo pipefail

FILE="${1:?Usage: bash deploy/restore.sh backups/jirex-<date>.tar.gz.enc}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }
[ -f .env ] || { echo "Run this from the folder containing docker-compose.yml and .env"; exit 1; }
BACKUP_PASSWORD="$(grep -E '^BACKUP_PASSWORD=' .env | cut -d= -f2-)"
export BACKUP_PASSWORD
[ -n "$BACKUP_PASSWORD" ] || { echo "BACKUP_PASSWORD is missing from .env"; exit 1; }

read -r -p "This replaces ALL current data with $FILE. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Decrypting"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSWORD -in "$FILE" | tar -xz -C "$TMP"

echo "==> Stopping the API while restoring"
docker compose stop api

echo "==> Restoring the database"
docker compose exec -T db pg_restore -U jirex -d jirex --clean --if-exists --no-owner < "$TMP/database.dump"

echo "==> Restoring receipts"
docker compose run --rm --no-deps -v "$TMP:/restore:ro" --entrypoint sh backup \
  -c 'find /receipts -mindepth 1 -delete && tar -xf /restore/receipts.tar -C /receipts'

echo "==> Starting the API again"
docker compose start api
echo "Done. Restored from $FILE"
