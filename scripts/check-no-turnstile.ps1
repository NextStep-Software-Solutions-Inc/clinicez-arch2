#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Fails if any Cloudflare Turnstile bot-challenge references, endpoints, or bypass tokens creep back into the codebase.

.DESCRIPTION
  ClinicEZ has completely eliminated Cloudflare Turnstile across all services, packages, and apps (Issue #75).
  Public entry points use direct unauthenticated transport with rate limiting.
  Run from anywhere inside the repository. Exit code 1 on any hit.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location (git rev-parse --show-toplevel)

# Files that are allowed to MENTION the removed technologies (historical migrations, docs, agent metadata)
$allowedPathspecs = @(
    ':(exclude)docs/**',
    ':(exclude).agents/**',
    ':(exclude).github/**',
    ':(exclude)**/Migrations/**',
    ':(exclude)scripts/check-no-turnstile.ps1',
    ':(exclude)apps/portal-web/tests/noTurnstile.test.ts',
    ':(exclude)*.lock',
    ':(exclude)bun.lock'
)

# 1. Critical endpoints and offline bypass token
$pattern = 'challenges\.cloudflare\.com|LOCAL-OFFLINE-BYPASS'
$criticalHits = & git grep -n -I -i -E $pattern -- . @allowedPathspecs 2>$null
if ($LASTEXITCODE -eq 0 -and $criticalHits) {
    Write-Host 'Forbidden Cloudflare Turnstile endpoints or bypass tokens found:' -ForegroundColor Red
    $criticalHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# 2. General turnstile keyword residue
$turnstileHits = & git grep -n -I -i "turnstile" -- . @allowedPathspecs 2>$null
if ($LASTEXITCODE -eq 0 -and $turnstileHits) {
    Write-Host 'Turnstile residue found in codebase:' -ForegroundColor Red
    $turnstileHits | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host 'Zero Turnstile residue found across codebase.' -ForegroundColor Green
exit 0
