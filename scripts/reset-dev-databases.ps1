<#
.SYNOPSIS
    Resets all ClinicEZ development databases by wiping their public schema.
    Prepares the databases for clean application of squashed InitialCreate migrations.
#>

param (
    [string]$DbUser = $env:POSTGRES_USER,
    [string]$DbHost = $env:POSTGRES_HOST,
    [int]$DbPort = 5432,
    [switch]$UseDocker,
    [string]$DockerContainer = "postgres"
)

if (-not $DbUser) { $DbUser = "db_admin_node" }
if (-not $DbHost) { $DbHost = "localhost" }

$Databases = @(
    "CLINICEZ-PORTAL_DB",
    "CLINICEZ_PORTAL_DB",
    "CLINICEZ-CLINIC_DB",
    "CLINICEZ_CLINIC_DB",
    "CLINICEZ-LAB_DB",
    "CLINICEZ_LAB_DB",
    "CLINICEZ_LABORATORY_DB",
    "CLINICEZ-PHARMACY_DB",
    "CLINICEZ_PHARMACY_DB",
    "CLINICEZ-BILLING_DB",
    "CLINICEZ_BILLING_DB",
    "CLINICEZ-ORG_DB",
    "CLINICEZ_ORG_DB",
    "CLINICEZ_ORGANIZATION_DB",
    "CLINICEZ-PATIENT_DB",
    "CLINICEZ_PATIENT_DB",
    "CLINICEZ-INTEROP_DB",
    "CLINICEZ_INTEROP_DB",
    "CLINICEZ_INTEROP_HUB_DB"
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  ClinicEZ Development Database Reset Tool (Post-Migration Squash)   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$ResetSql = @"
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO "$DbUser";
ALTER SCHEMA public OWNER TO "$DbUser";
CREATE EXTENSION IF NOT EXISTS vector;
"@

foreach ($db in $Databases) {
    try {
        if ($UseDocker) {
            $exists = docker exec -i $DockerContainer psql -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>$null
            if ($exists -match "1") {
                Write-Host "==> [Resetting] Database '$db'..." -ForegroundColor Yellow
                docker exec -i $DockerContainer psql -U $DbUser -d $db -c "$ResetSql"
                Write-Host "    ✓ Schema 'public' recreated cleanly for '$db'." -ForegroundColor Green
            }
        } else {
            $exists = psql -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>$null
            if ($exists -match "1") {
                Write-Host "==> [Resetting] Database '$db'..." -ForegroundColor Yellow
                psql -h $DbHost -p $DbPort -U $DbUser -d $db -c "$ResetSql"
                Write-Host "    ✓ Schema 'public' recreated cleanly for '$db'." -ForegroundColor Green
            }
        }
    } catch {
        Write-Warning "Failed to reset database $db : $_"
    }
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Development databases reset complete! Restart services to migrate. " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
