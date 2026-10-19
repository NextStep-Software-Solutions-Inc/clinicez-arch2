#!/usr/bin/env bash
# scripts/reset-dev-databases.sh
# Resets all ClinicEZ development databases by wiping their public schema.
# Prepares the databases for clean application of squashed InitialCreate migrations.

set -euo pipefail

DB_USER="${POSTGRES_USER:-db_admin_node}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
USE_DOCKER="${USE_DOCKER:-false}"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-postgres}"

# Support both hyphenated and underscored database naming conventions
DATABASES=(
    "CLINICEZ-PORTAL_DB"
    "CLINICEZ_PORTAL_DB"
    "CLINICEZ-CLINIC_DB"
    "CLINICEZ_CLINIC_DB"
    "CLINICEZ-LAB_DB"
    "CLINICEZ_LAB_DB"
    "CLINICEZ_LABORATORY_DB"
    "CLINICEZ-PHARMACY_DB"
    "CLINICEZ_PHARMACY_DB"
    "CLINICEZ-BILLING_DB"
    "CLINICEZ_BILLING_DB"
    "CLINICEZ-ORG_DB"
    "CLINICEZ_ORG_DB"
    "CLINICEZ_ORGANIZATION_DB"
    "CLINICEZ-PATIENT_DB"
    "CLINICEZ_PATIENT_DB"
    "CLINICEZ-INTEROP_DB"
    "CLINICEZ_INTEROP_DB"
    "CLINICEZ_INTEROP_HUB_DB"
)

run_sql() {
    local db="$1"
    local sql="$2"
    if [ "$USE_DOCKER" = "true" ]; then
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$db" -c "$sql"
    else
        PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -c "$sql"
    fi
}

db_exists() {
    local db="$1"
    if [ "$USE_DOCKER" = "true" ]; then
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1
    else
        PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1
    fi
}

echo "======================================================================"
echo "  ClinicEZ Development Database Reset Tool (Post-Migration Squash)   "
echo "======================================================================"

FOUND_ANY=false
for db in "${DATABASES[@]}"; do
    if db_exists "$db"; then
        FOUND_ANY=true
        echo "==> [Resetting] Database '$db'..."
        run_sql "$db" "
            DROP SCHEMA IF EXISTS public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO \"$DB_USER\";
            ALTER SCHEMA public OWNER TO \"$DB_USER\";
            CREATE EXTENSION IF NOT EXISTS vector;
        "
        echo "    ✓ Schema 'public' recreated cleanly for '$db'."
    fi
done

if [ "$FOUND_ANY" = false ]; then
    echo "::warning:: No matching databases found on target host. Check connection settings."
else
    echo "======================================================================"
    echo "  All found development databases reset to pristine public schema!    "
    echo "  Restart your services to auto-apply InitialCreate and seed data.    "
    echo "======================================================================"
fi
