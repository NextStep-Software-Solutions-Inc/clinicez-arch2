#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Fails if any message broker (RabbitMQ / AMQP) or MassTransit reference creeps back into the repo.

.DESCRIPTION
  ClinicEZ moves ALL inter-service and inter-facility traffic through the Interop Hub
  (services/interop-hub, SDK: packages/shared-dotnet/Interop). There is no broker anywhere.
  Run from anywhere inside the repository. Exit code 1 on any hit.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location (git rev-parse --show-toplevel)

# Files that are allowed to MENTION the removed technologies (history / rationale), never to use them.
$allowedPathspecs = @(
    ':(exclude)docs/architecture/**',
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

Write-Host 'No broker references found.' -ForegroundColor Green
exit 0
