#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Campus Super App — Database Restore Script
# Restores a compressed PostgreSQL dump with SHA-256 integrity verification
# ==============================================================================

if [ "$#" -lt 1 ]; then
  echo "❌ Error: Backup file path required."
  echo "Usage: $0 <path_to_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file '${BACKUP_FILE}' does not exist."
  exit 1
fi

# Verify SHA-256 checksum if exists
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "🔍 Verifying SHA-256 checksum..."
  shasum -a 256 -c "${BACKUP_FILE}.sha256"
  echo "✅ Checksum verification succeeded."
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-campus_admin}"
DB_NAME="${DB_NAME:-campus_app}"

echo "⚠️  WARNING: Restoring will overwrite data in database '${DB_NAME}'!"
read -r -p "Are you sure you want to proceed? [y/N]: " confirmation

if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
  echo "🛑 Restore aborted by user."
  exit 0
fi

echo "🔄 Restoring database from '${BACKUP_FILE}'..."

gunzip -c "$BACKUP_FILE" | PGPASSWORD="${DB_PASSWORD:-}" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME"

echo "✅ Database restore completed successfully."
