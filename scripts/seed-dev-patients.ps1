<#
.SYNOPSIS
    Seeds 1,000+ realistic development patient records into ClinicEZ.
.DESCRIPTION
    Generates rich, randomized Philippine clinical records including demographics,
    medical histories, consultation encounters with SOAP notes, prescriptions, and official medical certificates.
    Designed for testing app/API performance, database indexing, and browser UI capacity & scalability.
.PARAMETER Count
    The number of patient records to generate (default: 1000).
.PARAMETER ClearExisting
    Whether to purge existing development-seeded patients before generating (default: false).
.PARAMETER ApiUrl
    Base URL of the Clinic API (default: http://localhost:5245).
.PARAMETER ConnectionString
    Optional direct PostgreSQL connection string when running CLI directly.
.EXAMPLE
    .\scripts\seed-dev-patients.ps1 -Count 1000
    .\scripts\seed-dev-patients.ps1 -Count 2000 -ClearExisting $true
#>
param(
    [int]$Count = 1000,
    [switch]$ClearExisting = $false,
    [string]$ApiUrl = "http://localhost:5245",
    [string]$ConnectionString = "",
    [string]$ClinicId = "",
    [string]$TenantId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  ClinicEZ Scalability & Browser Capacity Data Generator" -ForegroundColor Cyan
Write-Host "  Target: $Count patient records (with encounters, Rx, certs, histories)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Check if Clinic API is online and available
$apiOnline = $false
$endpointsToTry = @($ApiUrl, "http://localhost:5245", "http://localhost:8080")

foreach ($url in $endpointsToTry | Select-Object -Unique) {
    try {
        $response = Invoke-RestMethod -Uri "$url/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response -and $response.status -eq "healthy") {
            $ApiUrl = $url
            $apiOnline = $true
            break
        }
    } catch {
        # Endpoint not running at this address
    }
}

if ($apiOnline) {
    Write-Host "[API Mode] Found active Clinic API at $ApiUrl" -ForegroundColor Green
    Write-Host "[API Mode] Triggering DevSeeder endpoint (Count: $Count, ClearExisting: $ClearExisting)..." -ForegroundColor Yellow

    $seedUrl = "$ApiUrl/api/v1/dev/seed-patients?count=$Count&clearExisting=$($ClearExisting.IsPresent)"
    if ($ClinicId) { $seedUrl += "&clinicId=$ClinicId" }
    if ($TenantId) { $seedUrl += "&tenantId=$TenantId" }
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $apiResult = Invoke-RestMethod -Uri $seedUrl -Method Post -TimeoutSec 300
        $sw.Stop()

        if ($apiResult.success) {
            Write-Host ""
            Write-Host "======================================================================" -ForegroundColor Green
            Write-Host "  SEEDING COMPLETED SUCCESSFULLY VIA API" -ForegroundColor Green
            Write-Host "======================================================================" -ForegroundColor Green
            $data = $apiResult.data
            Write-Host "  Patients Created            : $($data.patientsCreated)"
            Write-Host "  Encounters (SOAP)           : $($data.encountersCreated)"
            Write-Host "  Prescriptions (Rx Items)    : $($data.prescriptionsCreated)"
            Write-Host "  Medical Certificates Issued : $($data.medicalCertificatesCreated)"
            Write-Host "  Past Medical Histories      : $($data.pastMedicalHistoriesCreated)"
            Write-Host "  Family Histories            : $($data.familyHistoriesCreated)"
            Write-Host "  Social Histories            : $($data.socialHistoriesCreated)"
            Write-Host "  Surgical Histories          : $($data.surgicalHistoriesCreated)"
            Write-Host "  Allergies Documented        : $($data.allergiesCreated)"
            Write-Host "  Problem Lists Documented    : $($data.problemsCreated)"
            Write-Host "  Immunizations Documented    : $($data.immunizationsCreated)"
            Write-Host "  Time Elapsed                : $($sw.Elapsed.TotalSeconds.ToString('F2')) seconds"
            Write-Host "  Attending Clinician         : $($data.doctorName)"
            if ($data.samplePatientCodes) {
                Write-Host "  Sample Codes Generated      : $($data.samplePatientCodes -join ', ')"
            }
            Write-Host "======================================================================" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "[Error] API returned failure: $($apiResult.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "[Warning] API call failed: $_. Falling back to direct CLI runner..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[Info] Clinic API not detected on localhost. Running standalone CLI seeder..." -ForegroundColor Yellow
}

# 2. Standalone CLI Runner fallback
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot "services\clinic-api\ClinicEz.Clinic.DataSeeder"

$cliArgs = @("run", "--project", $projectPath, "--", "--count", $Count)
if ($ClearExisting) {
    $cliArgs += "--clear"
}
if ($ConnectionString) {
    $cliArgs += @("--connection", $ConnectionString)
}
if ($ClinicId) {
    $cliArgs += @("--clinic", $ClinicId)
}
if ($TenantId) {
    $cliArgs += @("--tenant", $TenantId)
}

Write-Host "[CLI Mode] Executing dotnet $cliArgs..." -ForegroundColor Cyan
& dotnet $cliArgs
exit $LASTEXITCODE
