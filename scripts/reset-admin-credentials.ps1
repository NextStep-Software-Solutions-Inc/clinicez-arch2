<#
.SYNOPSIS
    ClinicEZ Administrator Account Recovery Tool.
    Safely clears administrator lockouts or generates cryptographically secure
    one-time invitation links without writing manual SQL.

.DESCRIPTION
    Symmetric operational recovery tool for Windows and cross-platform PowerShell.
    Connects to PostgreSQL directly via host psql or through a Docker container.

.PARAMETER Email
    Target administrator email address. Required if multiple administrators exist.

.PARAMETER Action
    Action to perform: 'generate-invite' (default), 'clear-lockout', or 'list'.

.PARAMETER ClearLockout
    Shortcut switch for -Action 'clear-lockout'.

.PARAMETER GenerateInvite
    Shortcut switch for -Action 'generate-invite'.

.PARAMETER List
    Shortcut switch for -Action 'list'.

.PARAMETER AppUrl
    ClinicEZ workstation base URL for invitation links (default: http://localhost:8081).

.PARAMETER DbName
    Target database name (auto-detects CLINICEZ-CLINIC_DB or CLINICEZ_CLINIC_DB).

.PARAMETER DbUser
    PostgreSQL user (default: db_admin_node or $env:POSTGRES_USER).

.PARAMETER DbHost
    PostgreSQL host (default: localhost or $env:POSTGRES_HOST).

.PARAMETER DbPort
    PostgreSQL port (default: 5432 or $env:POSTGRES_PORT).

.PARAMETER UseDocker
    Force Docker container execution. Auto-detected if container is running.

.PARAMETER Container
    Docker container name (default: postgres or $env:DOCKER_CONTAINER).

.EXAMPLE
    .\scripts\reset-admin-credentials.ps1 -List

.EXAMPLE
    .\scripts\reset-admin-credentials.ps1

.EXAMPLE
    .\scripts\reset-admin-credentials.ps1 -Email admin@clinic.ph

.EXAMPLE
    .\scripts\reset-admin-credentials.ps1 -ClearLockout -Email admin@clinic.ph

.EXAMPLE
    .\scripts\reset-admin-credentials.ps1 -Email admin@clinic.ph -AppUrl https://clinic.example.com
#>

[CmdletBinding()]
param (
    [string]$Email,

    [ValidateSet("generate-invite", "clear-lockout", "list", IgnoreCase = $true)]
    [string]$Action = "generate-invite",

    [switch]$ClearLockout,
    [switch]$GenerateInvite,
    [switch]$List,

    [string]$AppUrl = $(if ($env:APP_URL) { $env:APP_URL } else { "http://localhost:8081" }),

    [string]$DbName,

    [string]$DbUser = $(
        if ($env:POSTGRES_USER) { $env:POSTGRES_USER }
        elseif ($env:DB_USER) { $env:DB_USER }
        else { "db_admin_node" }
    ),

    [string]$DbHost = $(
        if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST }
        elseif ($env:DB_HOST) { $env:DB_HOST }
        else { "localhost" }
    ),

    [int]$DbPort = $(
        if ($env:POSTGRES_PORT) { [int]$env:POSTGRES_PORT }
        elseif ($env:DB_PORT) { [int]$env:DB_PORT }
        else { 5432 }
    ),

    [switch]$UseDocker,

    [string]$Container = $(if ($env:DOCKER_CONTAINER) { $env:DOCKER_CONTAINER } else { "postgres" })
)

$ErrorActionPreference = "Stop"

# Handle shortcut switches
if ($ClearLockout) {
    $Action = "clear-lockout"
} elseif ($GenerateInvite) {
    $Action = "generate-invite"
} elseif ($List) {
    $Action = "list"
}
$Action = $Action.ToLowerInvariant()

# Auto-detect execution mode if -UseDocker was not explicitly passed
if (-not $PSBoundParameters.ContainsKey("UseDocker")) {
    $dockerFound = $false
    try {
        $runningContainers = docker ps --format '{{.Names}}' 2>$null
        if ($runningContainers -and ($runningContainers -split "`r?`n" -contains $Container)) {
            $dockerFound = $true
        }
    } catch {
        $dockerFound = $false
    }

    if ($env:USE_DOCKER -eq "false") {
        $UseDocker = $false
    } elseif ($env:USE_DOCKER -eq "true" -or $dockerFound) {
        $UseDocker = $true
    } else {
        $UseDocker = $false
    }
}

# Verify prerequisites
if ($UseDocker) {
    try {
        $runningContainers = docker ps --format '{{.Names}}' 2>$null
        if (-not ($runningContainers -split "`r?`n" -contains $Container)) {
            Write-Error "Docker container '$Container' is not running."
            exit 1
        }
    } catch {
        Write-Error "Docker command failed. Please verify that Docker is installed and running."
        exit 1
    }
} else {
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlCmd) {
        Write-Error "'psql' client not found in PATH and Docker container '$Container' is not running. Please install PostgreSQL client tools or start the Docker container."
        exit 1
    }
}

# SQL execution helper
function Invoke-PsqlQuery {
    param (
        [string]$Database,
        [string]$Sql,
        [switch]$AsTable
    )

    $extraArgs = if ($AsTable) {
        @("-v", "ON_ERROR_STOP=1")
    } else {
        @("-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-F", "|")
    }

    if ($UseDocker) {
        $cmdArgs = @("exec", "-i", $Container, "psql", "-U", $DbUser, "-d", $Database) + $extraArgs + @("-c", $Sql)
        $output = & docker $cmdArgs
        return ($output -join "`n")
    } else {
        if (-not $env:PGPASSWORD -and $env:POSTGRES_PASSWORD) {
            $env:PGPASSWORD = $env:POSTGRES_PASSWORD
        }
        $cmdArgs = @("-h", $DbHost, "-p", $DbPort.ToString(), "-U", $DbUser, "-d", $Database) + $extraArgs + @("-c", $Sql)
        $output = & psql $cmdArgs
        return ($output -join "`n")
    }
}

# Auto-resolve target database name
if (-not $DbName) {
    foreach ($candidate in @("CLINICEZ-CLINIC_DB", "CLINICEZ_CLINIC_DB")) {
        try {
            $testOutput = Invoke-PsqlQuery -Database $candidate -Sql "SELECT 1" 2>$null
            if ($testOutput -match "1") {
                $DbName = $candidate
                break
            }
        } catch {
            # continue checking candidates
        }
    }
    if (-not $DbName) {
        $DbName = "CLINICEZ-CLINIC_DB"
    }
}

# Cryptographically secure 64-char hexadecimal token generator (32 bytes)
function New-RandomHexToken {
    $bytes = [byte[]]::new(32)
    try {
        $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    } catch {
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

# --- Action: List ---
if ($Action -eq "list") {
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  ClinicEZ Administrator Accounts (Database: $DbName)" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan

    $ListSql = @"
SELECT 
    s."Id" AS "ID",
    TRIM(COALESCE(s."FirstName", '') || ' ' || COALESCE(s."LastName", '')) AS "Name",
    s."Email" AS "Email",
    s."Status" AS "Status",
    s."IsActive" AS "Active",
    COALESCE(to_char(s."LockoutEnd", 'YYYY-MM-DD HH24:MI:SS UTC'), 'None') AS "Lockout End",
    s."FailedLoginCount" AS "Failed Logins"
FROM public."StaffMembers" s
WHERE s."IsDeleted" = false
  AND (
      s."Role" = 'Admin'
      OR EXISTS (
          SELECT 1 FROM public."Roles" r
          WHERE r."Id" = s."ClinicRoleId"
            AND (LOWER(r."Name") = 'clinic administrator' OR (r."IsSystem" = true AND LOWER(r."Name") = 'clinic administrator'))
      )
  )
ORDER BY s."CreatedAt" ASC;
"@

    $tableResult = Invoke-PsqlQuery -Database $DbName -Sql $ListSql -AsTable
    Write-Host $tableResult
    exit 0
}

# --- Target Administrator Resolution for clear-lockout / generate-invite ---
$AdminId = $null
$AdminEmail = $null
$AdminName = $null

if ($Email) {
    $emailEscaped = $Email.Replace("'", "''")
    $AdminQuery = @"
SELECT 
    s."Id",
    s."Email",
    TRIM(COALESCE(s."FirstName", '') || ' ' || COALESCE(s."LastName", ''))
FROM public."StaffMembers" s
WHERE s."IsDeleted" = false
  AND LOWER(s."Email") = LOWER('$emailEscaped')
  AND (
      s."Role" = 'Admin'
      OR EXISTS (
          SELECT 1 FROM public."Roles" r
          WHERE r."Id" = s."ClinicRoleId"
            AND (LOWER(r."Name") = 'clinic administrator' OR (r."IsSystem" = true AND LOWER(r."Name") = 'clinic administrator'))
      )
  )
LIMIT 1;
"@

    $rawRow = (Invoke-PsqlQuery -Database $DbName -Sql $AdminQuery).Trim()
    if (-not $rawRow) {
        $CheckQuery = "SELECT COUNT(*) FROM public.`"StaffMembers`" WHERE `"IsDeleted`" = false AND LOWER(`"Email`") = LOWER('$emailEscaped');"
        $staffCountStr = (Invoke-PsqlQuery -Database $DbName -Sql $CheckQuery).Trim()
        $staffCount = 0
        [int]::TryParse($staffCountStr, [ref]$staffCount) | Out-Null
        if ($staffCount -gt 0) {
            Write-Error "Staff member with email '$Email' exists, but does not have the Administrator role.`nOnly administrator accounts can be recovered using this operational tool."
        } else {
            Write-Error "No staff member found with email '$Email' in database '$DbName'."
        }
        exit 1
    }

    $parts = $rawRow -split '\|'
    $AdminId = $parts[0]
    $AdminEmail = $parts[1]
    $AdminName = $parts[2]
} else {
    $AllAdminsQuery = @"
SELECT 
    s."Id",
    s."Email",
    TRIM(COALESCE(s."FirstName", '') || ' ' || COALESCE(s."LastName", ''))
FROM public."StaffMembers" s
WHERE s."IsDeleted" = false
  AND (
      s."Role" = 'Admin'
      OR EXISTS (
          SELECT 1 FROM public."Roles" r
          WHERE r."Id" = s."ClinicRoleId"
            AND (LOWER(r."Name") = 'clinic administrator' OR (r."IsSystem" = true AND LOWER(r."Name") = 'clinic administrator'))
      )
  )
ORDER BY s."CreatedAt" ASC;
"@

    $rawRows = (Invoke-PsqlQuery -Database $DbName -Sql $AllAdminsQuery).Trim()
    $lines = if ($rawRows) { $rawRows -split "`r?`n" | Where-Object { $_ -match '\S' } } else { @() }

    if ($lines.Count -eq 0) {
        Write-Error "No administrator accounts found in database '$DbName'."
        exit 1
    } elseif ($lines.Count -gt 1) {
        Write-Host "Multiple administrator accounts found in database '$DbName':" -ForegroundColor Yellow
        foreach ($line in $lines) {
            $parts = $line -split '\|'
            Write-Host "  - $($parts[1]) ($($parts[2]), ID: $($parts[0]))"
        }
        Write-Host ""
        Write-Error "Please specify which administrator to recover using: -Email <email>"
        exit 1
    } else {
        $parts = $lines[0] -split '\|'
        $AdminId = $parts[0]
        $AdminEmail = $parts[1]
        $AdminName = $parts[2]
        Write-Host "[Info] Auto-selected administrator: $AdminEmail ($AdminName)" -ForegroundColor Cyan
    }
}

# --- Action: Clear Lockout ---
if ($Action -eq "clear-lockout") {
    $ClearSql = @"
BEGIN;
UPDATE public."StaffMembers"
SET "LockoutEnd" = NULL,
    "FailedLoginCount" = 0,
    "TokenVersion" = "TokenVersion" + 1,
    "UpdatedAt" = NOW(),
    "UpdatedBy" = 'CLI:AdminRecovery'
WHERE "Id" = '$AdminId';

UPDATE public."RefreshTokens"
SET "RevokedAt" = NOW()
WHERE "StaffMemberId" = '$AdminId'
  AND "RevokedAt" IS NULL;
COMMIT;
"@

    Invoke-PsqlQuery -Database $DbName -Sql $ClearSql | Out-Null

    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  ClinicEZ Administrator Account Recovery - Lockout Cleared" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  Target Database: $DbName"
    Write-Host "  Target Host:     $DbHost:$DbPort (Docker: $UseDocker)"
    Write-Host "----------------------------------------------------------------------"
    Write-Host "  Administrator:   $AdminName"
    Write-Host "  Email:           $AdminEmail"
    Write-Host "  Staff ID:        $AdminId"
    Write-Host "  Lockout:         Cleared (LockoutEnd = NULL, FailedLoginCount = 0)"
    Write-Host "  Token Version:   Incremented (all prior sessions invalidated)"
    Write-Host "----------------------------------------------------------------------"
    Write-Host "  ✓ Account is unlocked. The administrator can now sign in with" -ForegroundColor Green
    Write-Host "    their current password." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Cyan
    exit 0
}

# --- Action: Generate One-Time Invitation Link ---
if ($Action -eq "generate-invite") {
    $Token = New-RandomHexToken
    $InviteSql = @"
BEGIN;
UPDATE public."StaffMembers"
SET "InvitationToken" = '$Token',
    "InvitationExpiresAt" = NOW() + INTERVAL '7 days',
    "Status" = 'Invited',
    "LockoutEnd" = NULL,
    "FailedLoginCount" = 0,
    "TokenVersion" = "TokenVersion" + 1,
    "UpdatedAt" = NOW(),
    "UpdatedBy" = 'CLI:AdminRecovery'
WHERE "Id" = '$AdminId';

UPDATE public."RefreshTokens"
SET "RevokedAt" = NOW()
WHERE "StaffMemberId" = '$AdminId'
  AND "RevokedAt" IS NULL;
COMMIT;
"@

    Invoke-PsqlQuery -Database $DbName -Sql $InviteSql | Out-Null

    $cleanAppUrl = $AppUrl.TrimEnd('/')
    $InviteUrl = "$cleanAppUrl/invitations/$Token"

    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  ClinicEZ Administrator Account Recovery - Invitation Link" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "  Target Database: $DbName"
    Write-Host "  Target Host:     $DbHost:$DbPort (Docker: $UseDocker)"
    Write-Host "----------------------------------------------------------------------"
    Write-Host "  Administrator:   $AdminName"
    Write-Host "  Email:           $AdminEmail"
    Write-Host "  Staff ID:        $AdminId"
    Write-Host "  Status:          Invited (Valid for 7 days)"
    Write-Host "  Lockout:         Cleared (LockoutEnd = NULL, FailedLoginCount = 0)"
    Write-Host "  Token Version:   Incremented (all prior sessions invalidated)"
    Write-Host "----------------------------------------------------------------------"
    Write-Host "  One-Time Invitation URL:" -ForegroundColor Green
    Write-Host "  $InviteUrl" -ForegroundColor Yellow
    Write-Host "----------------------------------------------------------------------"
    Write-Host "Instructions for Administrator:"
    Write-Host "  1. Open the URL above in your web browser."
    Write-Host "  2. Set a new strong password for your account."
    Write-Host "  3. Sign in to access the clinic administration workstation."
    Write-Host "======================================================================" -ForegroundColor Cyan
    exit 0
}
