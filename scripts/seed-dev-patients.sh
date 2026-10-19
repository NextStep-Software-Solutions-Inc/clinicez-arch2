#!/usr/bin/env bash
# scripts/seed-dev-patients.sh
# Seeds 1,000+ realistic development patient records into ClinicEZ.

set -euo pipefail

COUNT="${1:-1000}"
CLEAR="${2:-false}"
API_URL="${3:-http://localhost:5245}"
CLINIC_ID="${4:-}"
TENANT_ID="${5:-}"

echo "======================================================================"
echo "  ClinicEZ Scalability & Browser Capacity Data Generator"
echo "  Target: $COUNT patient records (with encounters, Rx, certs, histories)"
echo "======================================================================"

# 1. Check if Clinic API is online
API_ONLINE=false
for URL in "$API_URL" "http://localhost:5245" "http://localhost:8080"; do
    if curl -s -f -m 2 "$URL/health" > /dev/null 2>&1; then
        API_URL="$URL"
        API_ONLINE=true
        break
    fi
done

if [ "$API_ONLINE" = true ]; then
    echo "[API Mode] Found active Clinic API at $API_URL"
    echo "[API Mode] Triggering DevSeeder endpoint (Count: $COUNT, ClearExisting: $CLEAR)..."
    SEED_URL="$API_URL/api/v1/dev/seed-patients?count=$COUNT&clearExisting=$CLEAR"
    if [ -n "$CLINIC_ID" ]; then SEED_URL="$SEED_URL&clinicId=$CLINIC_ID"; fi
    if [ -n "$TENANT_ID" ]; then SEED_URL="$SEED_URL&tenantId=$TENANT_ID"; fi
    RESPONSE=$(curl -s -X POST "$SEED_URL" -H "Accept: application/json")
    echo "$RESPONSE"
    echo "[Done] Seeding request completed."
    exit 0
fi

echo "[Info] Clinic API not detected on localhost. Running standalone CLI seeder..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$DIR/services/clinic-api/ClinicEz.Clinic.DataSeeder"

ARGS=("--count" "$COUNT")
if [ "$CLEAR" = "true" ]; then
    ARGS+=("--clear")
fi
if [ -n "$CLINIC_ID" ]; then
    ARGS+=("--clinic" "$CLINIC_ID")
fi
if [ -n "$TENANT_ID" ]; then
    ARGS+=("--tenant" "$TENANT_ID")
fi

dotnet run --project "$PROJECT_PATH" -- "${ARGS[@]}"
