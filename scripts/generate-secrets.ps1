# Prints random values for the shared secrets of the cloud deployment (GitHub secrets) as NAME=value lines.
#
#   scripts\generate-secrets.ps1                          every secret below
#   scripts\generate-secrets.ps1 CLINIC_*    only the names/patterns given
#   scripts\generate-secrets.ps1 -List                    names and kinds, no values
#
# Values come from the operating system's cryptographic RNG and go to the output ONLY: copy each one into Settings ->
# Secrets and variables -> Actions, then clear your terminal. Nothing is written to disk. Key PAIRS (license keys, hub
# signing keys) are not generated here: use scripts\generate-license-keys.ps1 and scripts\generate-signing-key.ps1.
# Same names and formats as scripts/generate-secrets.sh. Works on Windows PowerShell 5.1 and PowerShell 7.
[CmdletBinding()]
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Name = @(),
  [switch]$List
)
$ErrorActionPreference = 'Stop'

# NAME, kind (alnum = random letters/digits, b64 = base64 of random bytes), size
$Specs = @(
  @('HANGFIRE_PASSWORD', 'alnum', 24),
  @('CLINIC_ENCRYPTION_MASTER_SECRET', 'alnum', 64),
  @('CLINIC_DOCUMENT_SIGNING_KEY', 'alnum', 64),
  @('LABORATORY_DOCUMENT_SIGNING_KEY', 'alnum', 64),
  @('PHARMACY_GAMOT_UPSC_SECRET_KEY', 'alnum', 64),
  @('PATIENT_SHARING_SIGNING_KEY', 'alnum', 64),
  @('INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY', 'b64', 32),
  @('INTEROP_HUB_PORTAL_CLIENT_SECRET', 'alnum', 40),
  @('CLINIC_HUB_CLIENT_SECRET', 'alnum', 40),
  @('LABORATORY_HUB_CLIENT_SECRET', 'alnum', 40),
  @('PHARMACY_HUB_CLIENT_SECRET', 'alnum', 40),
  @('ORGANIZATION_HUB_CLIENT_SECRET', 'alnum', 40),
  @('PATIENT_HUB_CLIENT_SECRET', 'alnum', 40),
  @('PORTAL_HUB_CLIENT_SECRET', 'alnum', 40),
  @('BILLING_HUB_CLIENT_SECRET', 'alnum', 40),

  @('CLINIC_JWT_SIGNING_KEY', 'b64', 64),
  @('LAB_JWT_SIGNING_KEY', 'b64', 64),
  @('PHARMACY_JWT_SIGNING_KEY', 'b64', 64),
  @('BILLING_JWT_SIGNING_KEY', 'b64', 64)
)

$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function New-RandomBytes([int]$Count) {
  $b = New-Object 'byte[]' $Count
  $rng.GetBytes($b)
  , $b
}

function New-RandomAlnum([int]$Length) {
  # Rejection sampling: 62 symbols out of 256 byte values, no modulo bias.
  $sb = New-Object System.Text.StringBuilder
  while ($sb.Length -lt $Length) {
    foreach ($byte in (New-RandomBytes ($Length * 2))) {
      if ($byte -lt 248 -and $sb.Length -lt $Length) { [void]$sb.Append($chars[$byte % 62]) }
    }
  }
  $sb.ToString()
}

$found = $false
foreach ($spec in $Specs) {
  $n = $spec[0]; $kind = $spec[1]; $size = $spec[2]
  if ($Name.Count -gt 0) {
    $hit = $false
    foreach ($f in $Name) { if ($n -like $f) { $hit = $true } }
    if (-not $hit) { continue }
  }
  $found = $true
  if ($kind -eq 'alnum') {
    if ($List) { "$n  ($size random letters/digits)" } else { "$n=$(New-RandomAlnum $size)" }
  } else {
    if ($List) { "$n  (base64 of $size random bytes)" } else { "$n=$([Convert]::ToBase64String((New-RandomBytes $size)))" }
  }
}

if (-not $found) {
  [Console]::Error.WriteLine("No secret matches: $($Name -join ' ') (run with -List to see the names).")
  exit 1
}
