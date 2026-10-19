<#
.SYNOPSIS
  Generates the facility-license key pair (ECDSA P-256). Windows PowerShell 5.1 and PowerShell 7 on Windows.

.DESCRIPTION
  Prints
    FACILITY_LICENSE_PRIVATE_KEY=<base64 of PEM>   -> ONLY the portal-api secret store
    FACILITY_LICENSE_PUBLIC_KEY=<base64 of PEM>    -> portal-api, clinic-api, laboratory-api, pharmacy-api, organization-api, and
                                                      the edge bundle (install.ps1 -LicensePublicKey)
  -Out <dir> writes the keys to files readable by the current user only instead of printing them; -Force overwrites.
  The pair is verified by a sign/verify round trip. Linux/macOS: scripts/generate-license-keys.sh.
  Rotation: generate a new pair, deploy the new public key as FACILITY_LICENSE_PUBLIC_KEY and keep the old public key as
  FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS until every issued license was renewed (docs/deployment-configuration.md).
#>
[CmdletBinding()]
param(
  [Alias('OutDir')] [string]$Out = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\ec-keypair.ps1')

Invoke-EcKeyPairTool -ScriptName 'generate-license-keys.ps1' `
  -Title 'Facility license signing keys' `
  -PrivateName 'FACILITY_LICENSE_PRIVATE_KEY' -PublicName 'FACILITY_LICENSE_PUBLIC_KEY' -Prefix 'license' `
  -Warning 'FACILITY_LICENSE_PRIVATE_KEY must live ONLY in the portal-api secret store (never on edge servers or other services).' `
  -Out $Out -Force:$Force
