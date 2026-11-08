#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Campus Super App — Database Backup Script
# Generates timestamped, compressed PostgreSQL dumps with SHA-256 verification
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-./backups/database}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/campus_backup_${TIMESTAMP}.sql.gz"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-campus_admin}"
DB_NAME="${DB_NAME:-campus_app}"

echo "📦 Starting automated database backup for '${DB_NAME}'..."

# Dump database through pg_dump and compress with gzip
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -F p \
  --clean \
  --if-exists \
  "$DB_NAME" | gzip > "$BACKUP_FILE"

# Generate SHA-256 checksum
shasum -a 256 "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"

echo "✅ Backup successfully created at: ${BACKUP_FILE}"
echo "🔒 SHA-256: $(cat "${BACKUP_FILE}.sha256" | awk '{print $1}')"

# Retention policy: remove backups older than 30 days
find "$BACKUP_DIR" -type f -name "campus_backup_*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR" -type f -name "campus_backup_*.sql.gz.sha256" -mtime +30 -delete

echo "🧹 Old backups (>30 days) purged cleanly."
