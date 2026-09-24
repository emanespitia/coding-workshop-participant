#!/usr/bin/env bash
# Starts the API for the end-to-end tests on its own database (helpdesk_e2e) and port (8100).
# The database is wiped and reloaded with demo data on every run, so tests always start from the
# same known state. Your local helpdesk_dev database is never touched.
set -euo pipefail

cd "$(dirname "$0")/../../backend/helpdesk"

export IS_LOCAL=true
export POSTGRES_HOST="${E2E_POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${E2E_POSTGRES_PORT:-5432}"
export POSTGRES_USER="${E2E_POSTGRES_USER:-postgres}"
export POSTGRES_PASS="${E2E_POSTGRES_PASS:-postgres123}"
export POSTGRES_NAME=helpdesk_e2e
export JWT_SECRET=e2e-only-secret-0123456789abcdef0123456789
export SEED_DEMO_DATA=false   # seeded explicitly below

PGPASSWORD="$POSTGRES_PASS" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'helpdesk_e2e'" | grep -q 1 \
  || PGPASSWORD="$POSTGRES_PASS" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -c "CREATE DATABASE helpdesk_e2e"

.venv/bin/python -m app.seed --reset
exec .venv/bin/uvicorn app.main:app --port 8100
