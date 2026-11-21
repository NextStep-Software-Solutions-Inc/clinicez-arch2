#!/usr/bin/env bash
# scripts/migrate-clinic-storage-to-r2.sh
# One-time migration of local CMK-encrypted (.cez) records to S3-compatible storage (Cloudflare R2 or on-prem MinIO/Ceph).
# Preserves strict tenant/clinic folder hierarchy: tenants/{tenantId}/clinics/{clinicId}/...
set -euo pipefail

STORAGE_DIR="${STORAGE_DIR:-/opt/docker-stack/clinic-api/storage/records}"
BUCKET_NAME="${S3_BUCKET_NAME:-${CLINIC_R2_BUCKET_NAME:-${R2_BUCKET_NAME:-clinicez-clinic-records}}}"
ACCOUNT_ID="${CLINIC_R2_ACCOUNT_ID:-${R2_ACCOUNT_ID:-}}"
AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-${CLINIC_R2_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}}"
AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-${CLINIC_R2_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}}"
SERVICE_URL="${S3_SERVICE_URL:-${ENDPOINT_URL:-}}"
DRY_RUN="${DRY_RUN:-false}"

if [ -n "$SERVICE_URL" ]; then
    ENDPOINT_URL="$SERVICE_URL"
elif [ -n "$ACCOUNT_ID" ]; then
    ENDPOINT_URL="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
else
    echo "ERROR: Either S3_SERVICE_URL (for on-prem MinIO/Ceph) or CLINIC_R2_ACCOUNT_ID (for Cloudflare R2) must be supplied."
    exit 1
fi

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "ERROR: S3 credentials missing. Ensure AccessKeyId and SecretAccessKey are set."
    exit 1
fi

export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

echo "================================================================="
echo " ClinicEZ Clinic Storage -> S3 / R2 One-Time Migration"
echo "================================================================="
echo " Source Path:   ${STORAGE_DIR}"
echo " Target Bucket: ${BUCKET_NAME}"
echo " Endpoint:      ${ENDPOINT_URL}"
echo " Dry Run Mode:  ${DRY_RUN}"
echo "-----------------------------------------------------------------"

if [ ! -d "$STORAGE_DIR" ]; then
    echo "ERROR: Storage directory '$STORAGE_DIR' does not exist."
    exit 1
fi

TOTAL=0
MIGRATED=0
SKIPPED=0
FAILED=0

# Process all .cez ciphertext files
while IFS= read -r -d '' file; do
    TOTAL=$((TOTAL + 1))
    
    # Calculate storage key relative to STORAGE_DIR root
    # Result format: tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez
    rel_key="${file#$STORAGE_DIR/}"
    rel_key="$(echo "$rel_key" | tr '\\' '/' | sed 's|^/||')"

    # Check existence on S3 (skip already migrated)
    if aws --endpoint-url "$ENDPOINT_URL" s3api head-object \
        --bucket "$BUCKET_NAME" --key "$rel_key" >/dev/null 2>&1; then
        echo "[EXISTS] Skipping $rel_key"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo "[MIGRATING] $rel_key..."
    if [ "$DRY_RUN" = "true" ]; then
        echo "  [DRY RUN] Would upload: $file -> s3://$BUCKET_NAME/$rel_key"
        MIGRATED=$((MIGRATED + 1))
    else
        if aws --endpoint-url "$ENDPOINT_URL" s3 cp "$file" "s3://${BUCKET_NAME}/${rel_key}" \
            --content-type "application/octet-stream" \
            --metadata "encryption=AES-256-GCM,key-scheme=cmk-v1"; then
            echo "  [OK] Uploaded $rel_key"
            MIGRATED=$((MIGRATED + 1))
        else
            echo "  [FAIL] Failed uploading $rel_key"
            FAILED=$((FAILED + 1))
        fi
    fi
done < <(find "$STORAGE_DIR" -type f -name "*.cez" -print0)

echo "-----------------------------------------------------------------"
echo " Migration Summary:"
echo " Total files found:     $TOTAL"
echo " Successfully uploaded: $MIGRATED"
echo " Already present:       $SKIPPED"
echo " Failed:                $FAILED"
echo "================================================================="

if [ "$FAILED" -gt 0 ]; then
    echo "ERROR: One or more files failed to migrate. Review errors above."
    exit 1
fi

echo "Migration finished successfully. Verify integrity before deprecating local volume."
