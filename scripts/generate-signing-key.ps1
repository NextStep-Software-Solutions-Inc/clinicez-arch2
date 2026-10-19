<#
.SYNOPSIS
  Generates an interop-hub client signing key pair (ECDSA P-256). Windows PowerShell 5.1 and PowerShell 7 on Windows.

.DESCRIPTION
  Prints
    SIGNING_KEY=<base64 of PEM>          -> the client's Messaging__SigningKey (cloud: <SVC>_HUB_SIGNING_KEY secret, edge:
                                            <SVC>_HUB_SIGNING_KEY / EDGE_HUB_SIGNING_KEY); stays with that one client
    SIGNING_PUBLIC_KEY=<base64 of PEM>   -> registered at the hub for that client (cloud bootstrap: PORTAL_HUB_PUBLIC_KEY, other
                                            clients: hub admin API; edge: <SVC>_HUB_PUBLIC_KEY)
  One pair per hub client; never share a key pair between clients. -Out <dir> writes files readable by the current user only
  instead of printing; -Force overwrites. Linux/macOS: scripts/generate-signing-key.sh.
#>
[CmdletBinding()]
param(
  [Alias('OutDir')] [string]$Out = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\ec-keypair.ps1')

Invoke-EcKeyPairTool -ScriptName 'generate-signing-key.ps1' `
  -Title 'Hub client envelope signing keys' `
  -PrivateName 'SIGNING_KEY' -PublicName 'SIGNING_PUBLIC_KEY' -Prefix 'signing' `
  -Warning 'SIGNING_KEY must live ONLY with the one hub client it belongs to; only SIGNING_PUBLIC_KEY is handed to the hub.' `
  -Out $Out -Force:$Force
