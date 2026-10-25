#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Fails if any message broker (RabbitMQ / AMQP), MassTransit reference, Next.js BFF route,
  or direct Clinic API dependency creeps back into the repository.

.DESCRIPTION
  ClinicEZ moves ALL inter-service and inter-facility traffic through the Interop Hub
  (services/interop-hub, SDK: packages/shared-dotnet/Interop). There is no broker anywhere.
  All portal public workflows communicate with portal-api (or patient-api), never direct to clinic-api.
  Run from anywhere inside the repository. Exit code 1 on any hit.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location (git rev-parse --show-toplevel)

# 1. Assert exactly 0 files under apps/portal-web/src/app/api/ (BFF eliminated)
$portalApiDir = "apps/portal-web/src/app/api"
$portalApiFiles = @()
if (Test-Path $portalApiDir) {
    $portalApiFiles = @(Get-ChildItem -Path $portalApiDir -Recurse -File -ErrorAction SilentlyContinue)
}
$gitApiFiles = @(& git ls-files -- "apps/portal-web/src/app/api" 2>$null)

if ($portalApiFiles.Count -gt 0 -or $gitApiFiles.Count -gt 0) {
    Write-Host "Forbidden App Router API route files found under $portalApiDir (expected exactly 0):" -ForegroundColor Red
    $portalApiFiles | ForEach-Object { Write-Host "  $($_.FullName)" }
    $gitApiFiles | ForEach-Object { Write-Host "  git: $_" }
    exit 1
}

# 2. Assert exactly 0 occurrences of CLINIC_API_URL or ClinicApiUrl in apps/portal-web (excluding tests), services/portal-api, and services/patient-api
$clinicApiHits = & git grep --untracked -n -I -i -E 'CLINIC_API_URL|ClinicApiUrl' -- 'apps/portal-web' 'services/portal-api' 'services/patient-api' ':(exclude)apps/portal-web/tests/**' 2>$null
if ($LASTEXITCODE -eq 0 -and $clinicApiHits) {
    Write-Host 'Forbidden Clinic API URL references found in apps/portal-web, services/portal-api, or services/patient-api:' -ForegroundColor Red
    $clinicApiHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# 2b. Assert exactly 0 occurrences of SERVICES_CLINIC_API_URL across repo (outside tests)
$servicesClinicHits = & git grep --untracked -n -I -i 'SERVICES_CLINIC_API_URL' -- 'deploy' 'docs' '.github/workflows' 'services' 'apps' ':(exclude)apps/portal-web/tests/**' 2>$null
if ($LASTEXITCODE -eq 0 -and $servicesClinicHits) {
    Write-Host 'Stale SERVICES_CLINIC_API_URL references found (expected zero):' -ForegroundColor Red
    $servicesClinicHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# 2c. Assert zero CLINIC_API_URL references in patient-app and portal-web sections of docs/deployment-configuration.md
if (Test-Path "docs/deployment-configuration.md") {
    $docsLines = Get-Content "docs/deployment-configuration.md"
    $inPatientApp = $false
    $inPortalWeb = $false
    foreach ($line in $docsLines) {
        if ($line -match '^###\s*`?apps/patient-app`?') { $inPatientApp = $true; $inPortalWeb = $false; continue }
        if ($line -match '^###\s*`?apps/portal-web`?') { $inPortalWeb = $true; $inPatientApp = $false; continue }
        if ($line -match '^###\s*') { $inPatientApp = $false; $inPortalWeb = $false; continue }

        if (($inPatientApp -or $inPortalWeb) -and $line -match 'CLINIC_API_URL') {
            $sectionName = if ($inPatientApp) { 'patient-app' } else { 'portal-web' }
            Write-Host "Forbidden CLINIC_API_URL in docs/deployment-configuration.md ($sectionName section): $line" -ForegroundColor Red
            exit 1
        }
    }
}

# 3. Message broker (RabbitMQ / AMQP) and MassTransit checks across monorepo
# Files that are allowed to MENTION the removed technologies (history / rationale), never to use them.
$allowedPathspecs = @(
    ':(exclude)docs/architecture/**',
    ':(exclude).agents/**',
    ':(exclude)**/Migrations/**',
    ':(exclude)scripts/check-no-broker.ps1',
    ':(exclude)*.lock',
    ':(exclude)bun.lock',
    ':(exclude)**/lib_medicine*.json',
    ':(exclude)apps/portal-web/src/**/emoji*'
)

$pattern = 'rabbitmq|rabbit_mq|masstransit|amqp://|amqps://|\bRABBITMQ_'
$hits = & git grep -n -I -i -E $pattern -- . @allowedPathspecs 2>$null

if ($LASTEXITCODE -eq 0 -and $hits) {
    Write-Host 'Broker / MassTransit references found. Use the Interop Hub SDK (ClinicEz.Shared.Interop) instead:' -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# Defence in depth: package graph must not contain MassTransit either.
$packageHits = & git grep -n -I -i -E 'PackageReference\s+Include="(MassTransit|RabbitMQ)' -- '*.csproj' '*.props' 2>$null
if ($LASTEXITCODE -eq 0 -and $packageHits) {
    Write-Host 'Broker packages referenced:' -ForegroundColor Red
    $packageHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host 'No broker references, BFF routes, or direct Clinic API dependencies found.' -ForegroundColor Green
exit 0
