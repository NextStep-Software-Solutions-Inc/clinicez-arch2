<#
.SYNOPSIS
    One-time migration of local CMK-encrypted (.cez) records to S3-compatible storage (Cloudflare R2 or on-prem MinIO/Ceph).
    Preserves strict tenant/clinic folder hierarchy: tenants/{tenantId}/clinics/{clinicId}/...
.PARAMETER StorageDir
    Local directory containing the .cez records. Defaults to ./Storage/Records or $env:STORAGE_DIR.
.PARAMETER BucketName
    Target S3 bucket name.
.PARAMETER ServiceUrl
    Custom S3 endpoint URL (for on-premise servers like MinIO: http://minio.local:9000).
.PARAMETER AccountId
    Cloudflare R2 Account ID (used if ServiceUrl is not specified).
.PARAMETER DryRun
    Simulate migration without uploading.
#>
[CmdletBinding()]
param(
    [string]$StorageDir = $(if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { "Storage/Records" }),
    [string]$BucketName = $(if ($env:S3_BUCKET_NAME) { $env:S3_BUCKET_NAME } elseif ($env:CLINIC_R2_BUCKET_NAME) { $env:CLINIC_R2_BUCKET_NAME } elseif ($env:R2_BUCKET_NAME) { $env:R2_BUCKET_NAME } else { "clinicez-clinic-records" }),
    [string]$ServiceUrl = $(if ($env:S3_SERVICE_URL) { $env:S3_SERVICE_URL } else { $env:ENDPOINT_URL }),
    [string]$AccountId = $(if ($env:CLINIC_R2_ACCOUNT_ID) { $env:CLINIC_R2_ACCOUNT_ID } else { $env:R2_ACCOUNT_ID }),
    [string]$AccessKeyId = $(if ($env:S3_ACCESS_KEY_ID) { $env:S3_ACCESS_KEY_ID } elseif ($env:CLINIC_R2_ACCESS_KEY_ID) { $env:CLINIC_R2_ACCESS_KEY_ID } else { $env:R2_ACCESS_KEY_ID }),
    [string]$SecretAccessKey = $(if ($env:S3_SECRET_ACCESS_KEY) { $env:S3_SECRET_ACCESS_KEY } elseif ($env:CLINIC_R2_SECRET_ACCESS_KEY) { $env:CLINIC_R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $AccessKeyId -or -not $SecretAccessKey) {
    Write-Error "S3 credentials missing. Ensure AccessKeyId and SecretAccessKey are supplied."
    exit 1
}

if ($ServiceUrl) {
    $endpointUrl = $ServiceUrl.TrimEnd('/')
}
elseif ($AccountId) {
    $endpointUrl = "https://$AccountId.r2.cloudflarestorage.com"
}
else {
    Write-Error "Either ServiceUrl (for MinIO/Ceph) or AccountId (for Cloudflare R2) must be supplied."
    exit 1
}

$env:AWS_ACCESS_KEY_ID = $AccessKeyId
$env:AWS_SECRET_ACCESS_KEY = $SecretAccessKey

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " ClinicEZ Clinic Storage -> S3 / R2 One-Time Migration" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Source Path:   $StorageDir"
Write-Host " Target Bucket: $BucketName"
Write-Host " Endpoint:      $endpointUrl"
Write-Host " Dry Run Mode:  $($DryRun.IsPresent)"
Write-Host "-----------------------------------------------------------------"

if (-not (Test-Path $StorageDir)) {
    Write-Error "Storage directory '$StorageDir' does not exist."
    exit 1
}

$resolvedStorageDir = (Resolve-Path $StorageDir).Path.TrimEnd('\', '/')
$files = Get-ChildItem -Path $resolvedStorageDir -Recurse -Filter "*.cez"

$total = 0
$migrated = 0
$skipped = 0
$failed = 0

foreach ($file in $files) {
    $total++
    $relPath = $file.FullName.Substring($resolvedStorageDir.Length).TrimStart('\', '/')
    $relKey = $relPath.Replace('\', '/')

    # Check existence via AWS CLI
    $headExit = $null
    try {
        & aws --endpoint-url $endpointUrl s3api head-object --bucket $BucketName --key $relKey *>$null
        $headExit = $LASTEXITCODE
    }
    catch {
        $headExit = 1
    }

    if ($headExit -eq 0) {
        Write-Host "[EXISTS] Skipping $relKey" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    Write-Host "[MIGRATING] $relKey..." -ForegroundColor Yellow
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would upload: $($file.FullName) -> s3://$BucketName/$relKey" -ForegroundColor Magenta
        $migrated++
    }
    else {
        & aws --endpoint-url $endpointUrl s3 cp $file.FullName "s3://$BucketName/$relKey" --content-type "application/octet-stream" --metadata "encryption=AES-256-GCM,key-scheme=cmk-v1"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] Uploaded $relKey" -ForegroundColor Green
            $migrated++
        }
        else {
            Write-Host "  [FAIL] Failed uploading $relKey" -ForegroundColor Red
            $failed++
        }
    }
}

Write-Host "-----------------------------------------------------------------"
Write-Host " Migration Summary:"
Write-Host " Total files found:     $total"
Write-Host " Successfully uploaded: $migrated"
Write-Host " Already present:       $skipped"
Write-Host " Failed:                $failed"
Write-Host "================================================================="

if ($failed -gt 0) {
    Write-Error "One or more files failed to migrate. Review errors above."
    exit 1
}

Write-Host "Migration finished successfully." -ForegroundColor Green
