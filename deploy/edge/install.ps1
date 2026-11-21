<#
.SYNOPSIS
  Clinic EZ Edge Cell installer for Windows (PowerShell 5.1+ / 7). Same behaviour as install.sh.

.DESCRIPTION
  .\install.ps1 [install]             first install, or re-run (keeps .env and every generated secret)
  .\install.ps1 apply                 re-render hub-bootstrap.env, pull and `up -d` after editing .env (e.g. COMPOSE_PROFILES)
  .\install.ps1 upgrade -Tag X        (= -Upgrade) back up, pull the new images, up -d
  .\install.ps1 activate -LicenseFile license.txt     first-run activation / air-gapped license import
  .\install.ps1 backup                one backup now
  .\install.ps1 restore <file>        restore a <DB>.<ts>.dump or files.<ts>.tar.gz from BACKUP_DIR
  .\install.ps1 status                containers, license status, queued outbound messages
  .\install.ps1 render                only (re)generate hub-bootstrap.env from .env

  Values not given as parameters are asked for, or taken from an existing .env. Needs Docker Desktop / Engine with
  Docker Compose v2. Private images: set $env:GHCR_USER and $env:GHCR_TOKEN (a read:packages token) first.
  Client model. With the local hub (default): the services use LOCAL clients site-<service> (generated here, fed to the hub
  and to the services); only the hub holds ONE portal-issued upstream client: -CloudHubUrl / -EdgeClientId / -EdgeClientSecret
  (portal HubEdgeCredentials). -NoLocalHub (single facility, no hub): clinic and billing use the PORTAL-issued per-service
  clients against the cloud hub: -CloudHubUrl (= MESSAGING_HUB_URL), -ClinicHubClientId/-ClinicHubClientSecret and
  -BillingHubClientId/-BillingHubClientSecret. -AirGapped: UPSTREAM_ENABLED=false, same-cell traffic only (cross-cell messages
  are rejected, not queued); not combinable with -NoLocalHub. -With laboratory,pharmacy,organization,cashier,comms switches optional
  profiles on. -Force rewrites .env (old one saved as .env.bak.<time>, generated secrets kept).
  -Yes never prompts. -NoPull skips the pull (images loaded with `docker load`). -NoStart only writes the configuration.
  Keys (ECDSA P-256, one-line base64 of a PEM). -LicensePublicKey <key> | -LicensePublicKeyFile <pem file>: the portal's license PUBLIC key
  (required, also air-gapped; a PEM file is encoded for you). -EdgeSigningKey | -EdgeSigningKeyFile: the signing PRIVATE key the portal issued
  with the edge client (local hub, not with -AirGapped). With the local hub the installer GENERATES one key pair per service client (CNG, no
  openssl needed); with -NoLocalHub the portal-issued -ClinicHubSigningKey[File] / -BillingHubSigningKey[File] are used instead.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('install', 'apply', 'upgrade', 'activate', 'backup', 'restore', 'status', 'render')]
  [string]$Command = 'install',
  [Parameter(Position = 1)] [string]$BackupFile = '',

  [string]$GhcrOwnerRepo = '', [string]$Tag = '',
  [string]$TenantId = '', [string]$CellId = '', [string]$CellName = '',
  [string]$FacilityId = '', [string]$FacilityName = '',
  [string]$LabFacilityId = '', [string]$PharmacyFacilityId = '', [string]$OrgFacilityId = '',
  [string]$With = '',
  [string]$CloudHubUrl = '', [string]$EdgeClientId = '', [string]$EdgeClientSecret = '', [string]$PublicUploadUrl = '',
  [string]$BaseDomain = '',
  [string]$ClinicHubClientId = '', [string]$ClinicHubClientSecret = '',
  [string]$BillingHubClientId = '', [string]$BillingHubClientSecret = '',
  [string]$LicenseToken = '', [string]$LicenseFile = '',
  [string]$LabLicenseToken = '', [string]$LabLicenseFile = '',
  [string]$PharmacyLicenseToken = '', [string]$PharmacyLicenseFile = '',
  [string]$LicensePublicKey = '', [string]$LicensePublicKeyFile = '',
  [string]$EdgeSigningKey = '', [string]$EdgeSigningKeyFile = '',
  [string]$ClinicHubSigningKey = '', [string]$ClinicHubSigningKeyFile = '',
  [string]$BillingHubSigningKey = '', [string]$BillingHubSigningKeyFile = '',
  [string]$BackupDir = '',
  [string]$StorageProvider = '',
  [string]$S3ServiceUrl = '', [string]$S3Bucket = '', [string]$S3AccessKey = '', [string]$S3SecretKey = '',
  [string]$S3Region = '', [string]$S3ForcePathStyle = '',
  [string]$StorageFallback = '',
  [string]$R2AccountId = '', [string]$R2Bucket = '', [string]$R2AccessKey = '', [string]$R2SecretKey = '', [string]$R2PublicUrl = '',

  [switch]$AirGapped, [switch]$NoLocalHub, [switch]$Force, [switch]$Yes,
  [switch]$NoPull, [switch]$NoStart, [switch]$NoBackup, [switch]$Upgrade
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Upgrade) { $Command = 'upgrade' }

$EnvFile = '.env'
$HubEnvFile = 'hub-bootstrap.env'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Every variable the installer manages. Order = order in the generated .env.
$Keys = @(
  'GHCR_OWNER_REPO', 'IMAGE_TAG', 'COMPOSE_PROFILES', 'TENANT_ID', 'EDGE_CELL_ID', 'EDGE_CELL_NAME',
  'CLINIC_FACILITY_ID', 'CLINIC_FACILITY_NAME', 'LABORATORY_FACILITY_ID', 'LABORATORY_FACILITY_NAME',
  'PHARMACY_FACILITY_ID', 'PHARMACY_FACILITY_NAME', 'ORGANIZATION_FACILITY_ID', 'ORGANIZATION_FACILITY_NAME', 'BASE_DOMAIN', 'CORS_ALLOWED_ORIGINS',
  'UPSTREAM_ENABLED', 'UPSTREAM_HUB_URL', 'UPSTREAM_CLIENT_ID', 'UPSTREAM_CLIENT_SECRET', 'PORTAL_BASE_URL', 'MESSAGING_HUB_URL',
  'CLINIC_HUB_CLIENT_ID', 'CLINIC_HUB_CLIENT_SECRET', 'BILLING_HUB_CLIENT_ID', 'BILLING_HUB_CLIENT_SECRET',
  'LABORATORY_HUB_CLIENT_ID', 'LABORATORY_HUB_CLIENT_SECRET', 'PHARMACY_HUB_CLIENT_ID', 'PHARMACY_HUB_CLIENT_SECRET',
  'ORGANIZATION_HUB_CLIENT_ID', 'ORGANIZATION_HUB_CLIENT_SECRET', 'COMMS_HUB_CLIENT_ID', 'COMMS_HUB_CLIENT_SECRET', 'HUB_PAYLOAD_ENCRYPTION_KEY', 'HUB_BIND', 'HUB_LAN_PORT',
  'POSTGRES_USER', 'POSTGRES_PASSWORD', 'HANGFIRE_DASHBOARD_PASSWORD',
  'CLINIC_JWT_SIGNING_KEY', 'BILLING_JWT_SIGNING_KEY', 'LABORATORY_JWT_SIGNING_KEY', 'PHARMACY_JWT_SIGNING_KEY', 'ORGANIZATION_JWT_SIGNING_KEY', 'COMMS_JWT_SIGNING_KEY', 'CLINIC_ENCRYPTION_MASTER_SECRET',
  'CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0', 'CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_1', 'CLINIC_DOCUMENT_SIGNING_KEY', 'LABORATORY_DOCUMENT_SIGNING_KEY', 'GAMOT_UPSC_SECRET_KEY',
  'FACILITY_LICENSE_PUBLIC_KEY', 'FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS', 'HUB_SIGNING_REQUIRED', 'EDGE_HUB_SIGNING_KEY',
  'CLINIC_HUB_SIGNING_KEY', 'CLINIC_HUB_PUBLIC_KEY', 'BILLING_HUB_SIGNING_KEY', 'BILLING_HUB_PUBLIC_KEY',
  'LABORATORY_HUB_SIGNING_KEY', 'LABORATORY_HUB_PUBLIC_KEY', 'PHARMACY_HUB_SIGNING_KEY', 'PHARMACY_HUB_PUBLIC_KEY',
  'ORGANIZATION_HUB_SIGNING_KEY', 'ORGANIZATION_HUB_PUBLIC_KEY', 'COMMS_HUB_SIGNING_KEY', 'COMMS_HUB_PUBLIC_KEY',
  'CLINIC_WEB_PORT', 'LABORATORY_WEB_PORT', 'PHARMACY_WEB_PORT', 'CASHIER_WEB_PORT',
  'BACKUP_DIR', 'BACKUP_INTERVAL_HOURS', 'BACKUP_RETENTION_DAYS',
  'STORAGE_PROVIDER', 'STORAGE_ENABLE_LOCAL_FALLBACK',
  'S3_SERVICE_URL', 'S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION', 'S3_FORCE_PATH_STYLE',
  'R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'
)

# Keys that must be a P-256 PEM (checked, normalized to one-line base64): public / private.
$PubKeyVars = @('FACILITY_LICENSE_PUBLIC_KEY', 'FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS', 'CLINIC_HUB_PUBLIC_KEY', 'BILLING_HUB_PUBLIC_KEY', 'LABORATORY_HUB_PUBLIC_KEY', 'PHARMACY_HUB_PUBLIC_KEY', 'ORGANIZATION_HUB_PUBLIC_KEY', 'COMMS_HUB_PUBLIC_KEY')
$PrivKeyVars = @('EDGE_HUB_SIGNING_KEY', 'CLINIC_HUB_SIGNING_KEY', 'BILLING_HUB_SIGNING_KEY', 'LABORATORY_HUB_SIGNING_KEY', 'PHARMACY_HUB_SIGNING_KEY', 'ORGANIZATION_HUB_SIGNING_KEY', 'COMMS_HUB_SIGNING_KEY')

# service, env prefix, compose profile ('' = always), hub facility type ('-' = no facility)
$Services = @(
  @{ Svc = 'clinic'; Prefix = 'CLINIC'; Profile = ''; FType = 'Clinic' },
  @{ Svc = 'billing'; Prefix = 'BILLING'; Profile = ''; FType = '-' },
  @{ Svc = 'laboratory'; Prefix = 'LABORATORY'; Profile = 'laboratory'; FType = 'Laboratory' },
  @{ Svc = 'pharmacy'; Prefix = 'PHARMACY'; Profile = 'pharmacy'; FType = 'Pharmacy' },
  @{ Svc = 'organization'; Prefix = 'ORGANIZATION'; Profile = 'organization'; FType = 'Organization' },
  @{ Svc = 'comms'; Prefix = 'COMMS'; Profile = 'comms'; FType = '-' }
)

$Cfg = @{}
foreach ($k in $Keys) { $Cfg[$k] = '' }

# ---------------------------------------------------------------- helpers
function Write-Log([string]$m) { Write-Host "==> $m" }
function Write-Warn([string]$m) { Write-Host "WARN: $m" -ForegroundColor Yellow }
function Stop-Install([string]$m) { throw "ERROR: $m" }

function Test-Cmd([scriptblock]$Sb) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Sb *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } finally { $ErrorActionPreference = $old }
}

function Invoke-Dc {
  # Runs `docker compose --env-file .env <args>`; throws on a non-zero exit unless -AllowFail.
  param([string[]]$DcArgs, [switch]$AllowFail)
  & docker compose --env-file $EnvFile @DcArgs | Out-Host
  if ($LASTEXITCODE -ne 0 -and -not $AllowFail) { Stop-Install "docker compose $($DcArgs -join ' ') failed (exit $LASTEXITCODE)." }
  return ($LASTEXITCODE -eq 0)
}

function Get-DcOutput([string[]]$DcArgs) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $o = & docker compose --env-file $EnvFile @DcArgs 2>$null; if ($LASTEXITCODE -ne 0) { return '' }; return (($o | Out-String).Trim()) } finally { $ErrorActionPreference = $old }
}

function Write-LfFile([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $Path), ($Text -replace "`r`n", "`n"), $Utf8NoBom)
}

function Read-EnvFile([string]$Path) {
  $h = @{}
  if (Test-Path -LiteralPath $Path) {
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $PSScriptRoot $Path))) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $h[$Matches[1]] = $Matches[2].TrimEnd("`r") }
    }
  }
  return $h
}

function Require-EnvFile { if (-not (Test-Path -LiteralPath $EnvFile)) { Stop-Install "$EnvFile not found: run .\install.ps1 first." } }

function New-Alnum([int]$Length) {
  $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray()
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $sb = New-Object System.Text.StringBuilder
  $buf = New-Object byte[] 1
  while ($sb.Length -lt $Length) {
    $rng.GetBytes($buf)
    if ($buf[0] -lt 248) { [void]$sb.Append($chars[$buf[0] % 62]) }   # 248 = 4 * 62: no modulo bias
  }
  $rng.Dispose()
  return $sb.ToString()
}

function New-Base64Key32 {
  $b = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($b); $rng.Dispose()
  return [Convert]::ToBase64String($b)
}

function Test-HasProfile([string]$Name) { return (",$($Cfg['COMPOSE_PROFILES'])," -like "*,$Name,*") }

function Set-Default([string]$Key, [string]$Value) { if ([string]::IsNullOrEmpty($Cfg[$Key])) { $Cfg[$Key] = $Value } }

function Set-GeneratedSecret([string]$Key, [int]$Length) { if ([string]::IsNullOrEmpty($Cfg[$Key])) { $Cfg[$Key] = New-Alnum $Length } }

$Interactive = ((-not $Yes) -and [Environment]::UserInteractive -and (-not [Console]::IsInputRedirected))

function Read-Value([string]$Key, [string]$Prompt, [switch]$Secret) {
  if (-not [string]::IsNullOrEmpty($Cfg[$Key])) { return }
  if ($Interactive) {
    if ($Secret) {
      $s = Read-Host -Prompt $Prompt -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
      try { $Cfg[$Key] = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    } else {
      $Cfg[$Key] = Read-Host -Prompt $Prompt
    }
  }
  if ([string]::IsNullOrEmpty($Cfg[$Key])) { Stop-Install "$Key is required: $Prompt (pass the matching parameter, or run interactively)." }
}

function Read-YesNo([string]$Prompt, [bool]$DefaultYes) {
  if (-not $Interactive) { return $DefaultYes }
  $d = 'n'; if ($DefaultYes) { $d = 'y' }
  $a = Read-Host -Prompt "$Prompt [$d]"
  if ([string]::IsNullOrWhiteSpace($a)) { $a = $d }
  return ($a -match '^(y|yes)$')
}

function Test-SafeValue([string]$Key, [switch]$AllowSpaces) {
  $v = $Cfg[$Key]
  if ($v -match '[$''"\\`#]') { Stop-Install ($Key + ' must not contain any of: dollar sign, single or double quote, backslash, backtick, #.') }
  if (-not $AllowSpaces -and $v -match '\s') { Stop-Install "$Key must not contain spaces." }
}

# ---- ECDSA P-256 keys. Windows PowerShell 5.1 (.NET Framework) has no ExportPkcs8PrivateKey, so CNG creates the key (ephemeral,
# plaintext-exportable), X / Y / D are read from the ECCPrivateBlob and the DER is written by hand:
#   private = SEC1 "EC PRIVATE KEY" (like openssl ecparam -genkey), public = SubjectPublicKeyInfo "PUBLIC KEY" (like openssl ec -pubout).
# Same code as scripts/lib/ec-keypair.ps1 (this bundle cannot reach scripts/). Values live in .env as one-line base64 of the PEM text.
function ConvertTo-EcPemText([byte[]]$Der, [string]$Label) {
  $b64 = [Convert]::ToBase64String($Der)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("-----BEGIN $Label-----`n")
  for ($i = 0; $i -lt $b64.Length; $i += 64) {
    [void]$sb.Append($b64.Substring($i, [Math]::Min(64, $b64.Length - $i)))
    [void]$sb.Append("`n")
  }
  [void]$sb.Append("-----END $Label-----`n")
  return $sb.ToString()
}

function New-EcP256Raw {
  $cp = New-Object System.Security.Cryptography.CngKeyCreationParameters
  $cp.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::AllowPlaintextExport
  $cp.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Signing
  # [NullString]::Value, not $null: PowerShell would turn $null into "" and CNG would then PERSIST a key named "" in the key store.
  $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, [NullString]::Value, $cp)
  try { $blob = $key.Export([System.Security.Cryptography.CngKeyBlobFormat]::EccPrivateBlob) } finally { $key.Dispose() }
  if ([BitConverter]::ToInt32($blob, 4) -ne 32 -or $blob.Length -ne 104) { Stop-Install 'Unexpected ECC private blob layout.' }
  $x = New-Object byte[] 32; $y = New-Object byte[] 32; $d = New-Object byte[] 32
  [Array]::Copy($blob, 8, $x, 0, 32); [Array]::Copy($blob, 40, $y, 0, 32); [Array]::Copy($blob, 72, $d, 0, 32)
  return @{ X = $x; Y = $y; D = $d }
}

function ConvertTo-EcPrivatePem($Raw) {
  $der = New-Object System.Collections.Generic.List[byte]
  $der.AddRange([byte[]](0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20))
  $der.AddRange([byte[]]$Raw.D)
  $der.AddRange([byte[]](0xA0, 0x0A, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0xA1, 0x44, 0x03, 0x42, 0x00, 0x04))
  $der.AddRange([byte[]]$Raw.X)
  $der.AddRange([byte[]]$Raw.Y)
  return (ConvertTo-EcPemText $der.ToArray() 'EC PRIVATE KEY')
}

function ConvertTo-EcPublicPem($Raw) {
  $der = New-Object System.Collections.Generic.List[byte]
  $der.AddRange([byte[]](0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04))
  $der.AddRange([byte[]]$Raw.X)
  $der.AddRange([byte[]]$Raw.Y)
  return (ConvertTo-EcPemText $der.ToArray() 'PUBLIC KEY')
}

function Test-ByteRun([byte[]]$Data, [int]$Offset, [byte[]]$Expected) {
  if ($Offset + $Expected.Length -gt $Data.Length) { return $false }
  for ($i = 0; $i -lt $Expected.Length; $i++) { if ($Data[$Offset + $i] -ne $Expected[$i]) { return $false } }
  return $true
}

function ConvertFrom-EcPem([string]$Pem, [string]$Kind) {
  # Parses the two PEM shapes above (what openssl and the key scripts produce) into @{ X; Y; D }. Throws on anything else.
  if ($Pem -notmatch '-----BEGIN ([A-Z ]+)-----([^-]+)-----END \1-----') { throw 'Not a PEM block.' }
  $label = $Matches[1]
  $der = [Convert]::FromBase64String(($Matches[2] -replace '\s', ''))
  $x = New-Object byte[] 32; $y = New-Object byte[] 32
  if ($Kind -eq 'public') {
    $hdr = [byte[]](0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04)
    if ($label -ne 'PUBLIC KEY' -or $der.Length -ne 91 -or -not (Test-ByteRun $der 0 $hdr)) { throw 'Not an uncompressed P-256 public key.' }
    [Array]::Copy($der, 27, $x, 0, 32); [Array]::Copy($der, 59, $y, 0, 32)
    return @{ X = $x; Y = $y }
  }
  $pre = [byte[]](0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20)
  $mid = [byte[]](0xA0, 0x0A, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0xA1, 0x44, 0x03, 0x42, 0x00, 0x04)
  if ($label -ne 'EC PRIVATE KEY' -or $der.Length -ne 121 -or -not (Test-ByteRun $der 0 $pre) -or -not (Test-ByteRun $der 39 $mid)) { throw 'Not a P-256 SEC1 private key.' }
  $d = New-Object byte[] 32
  [Array]::Copy($der, 7, $d, 0, 32); [Array]::Copy($der, 57, $x, 0, 32); [Array]::Copy($der, 89, $y, 0, 32)
  return @{ X = $x; Y = $y; D = $d }
}

function ConvertTo-CngEcKey($Raw, [bool]$Private) {
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  if ($Private) { $bw.Write([int]0x32534345) } else { $bw.Write([int]0x31534345) }   # 'ECS2' / 'ECS1' = ECDSA P-256 blobs
  $bw.Write([int]32)
  $bw.Write([byte[]]$Raw.X); $bw.Write([byte[]]$Raw.Y)
  if ($Private) { $bw.Write([byte[]]$Raw.D) }
  $bw.Flush()
  $fmt = [System.Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob
  if ($Private) { $fmt = [System.Security.Cryptography.CngKeyBlobFormat]::EccPrivateBlob }
  return [System.Security.Cryptography.CngKey]::Import($ms.ToArray(), $fmt)
}

function Format-KeyValue([string]$Value) {
  # A PEM (text) becomes one-line base64 of the PEM; base64 just loses whitespace.
  if ([string]::IsNullOrEmpty($Value)) { return '' }
  if ($Value -match '-----BEGIN') {
    $text = (($Value -replace "`r", '').Trim()) + "`n"
    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))
  }
  return ($Value -replace '\s', '')
}

function Read-KeyFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { Stop-Install "Key file not found: $Path" }
  return (Format-KeyValue ([System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path)))
}

function Test-KeyValue([string]$Key, [string]$Kind) {
  # Empty is fine here (required-ness is checked elsewhere); otherwise it must be a P-256 PEM key.
  $v = $Cfg[$Key]
  if ([string]::IsNullOrEmpty($v)) { return }
  try {
    $pem = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($v))
    if ($Kind -eq 'public') {
      $k = ConvertTo-CngEcKey (ConvertFrom-EcPem $pem 'public') $false
    } elseif ($pem -match '-----BEGIN PRIVATE KEY-----([^-]+)-----END PRIVATE KEY-----') {
      $k = [System.Security.Cryptography.CngKey]::Import([Convert]::FromBase64String(($Matches[1] -replace '\s', '')), [System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
      # A PKCS#8 EC key carries no usage, so CNG imports it as ECDH_P256; both names mean the P-256 curve.
      if ($k.Algorithm.Algorithm -ne 'ECDSA_P256' -and $k.Algorithm.Algorithm -ne 'ECDH_P256') { throw 'Not P-256.' }
    } else {
      $k = ConvertTo-CngEcKey (ConvertFrom-EcPem $pem 'private') $true
    }
    $k.Dispose()
  } catch {
    Stop-Install "$Key is not a valid ECDSA P-256 $Kind key (expected base64 of a PEM; a PEM file can be given with the matching -...File parameter)."
  }
}

function Set-EnsuredKeyPair([string]$PrivKey, [string]$PubKey) {
  # Generates the pair when the private key is missing; derives a lost public half from it.
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  if ([string]::IsNullOrEmpty($Cfg[$PrivKey])) {
    $raw = New-EcP256Raw
    $Cfg[$PrivKey] = [Convert]::ToBase64String($utf8.GetBytes((ConvertTo-EcPrivatePem $raw)))
    $Cfg[$PubKey] = [Convert]::ToBase64String($utf8.GetBytes((ConvertTo-EcPublicPem $raw)))
  } elseif ([string]::IsNullOrEmpty($Cfg[$PubKey])) {
    try {
      $raw = ConvertFrom-EcPem ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Cfg[$PrivKey]))) 'private'
    } catch {
      Stop-Install "$PrivKey is not a SEC1 EC private key: cannot derive $PubKey. Set both, or remove both to generate a new pair."
    }
    $Cfg[$PubKey] = [Convert]::ToBase64String($utf8.GetBytes((ConvertTo-EcPublicPem $raw)))
  }
}

function Read-LicenseToken([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { Stop-Install "License file not found: $Path" }
  $raw = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path).Trim()
  if ($raw.StartsWith('{')) {
    $obj = $raw | ConvertFrom-Json
    $tok = $obj.licenseToken
    if (-not $tok) { $tok = $obj.LicenseToken }
  } else {
    $tok = ($raw -replace '\s', '')
  }
  if (-not $tok) { Stop-Install "No license token found in $Path" }
  return [string]$tok
}

$LicenseClinic = $LicenseToken
$LicenseLaboratory = $LabLicenseToken
$LicensePharmacy = $PharmacyLicenseToken
if ($LicenseFile) { $LicenseClinic = Read-LicenseToken $LicenseFile }
if ($LabLicenseFile) { $LicenseLaboratory = Read-LicenseToken $LabLicenseFile }
if ($PharmacyLicenseFile) { $LicensePharmacy = Read-LicenseToken $PharmacyLicenseFile }

# Command line values win over the existing .env.
$FromArgs = @{
  GHCR_OWNER_REPO = $GhcrOwnerRepo; IMAGE_TAG = $Tag; TENANT_ID = $TenantId; EDGE_CELL_ID = $CellId; EDGE_CELL_NAME = $CellName
  CLINIC_FACILITY_ID = $FacilityId; CLINIC_FACILITY_NAME = $FacilityName
  LABORATORY_FACILITY_ID = $LabFacilityId; PHARMACY_FACILITY_ID = $PharmacyFacilityId; ORGANIZATION_FACILITY_ID = $OrgFacilityId
  UPSTREAM_HUB_URL = $CloudHubUrl; UPSTREAM_CLIENT_ID = $EdgeClientId; UPSTREAM_CLIENT_SECRET = $EdgeClientSecret
  BASE_DOMAIN = $BaseDomain; PORTAL_BASE_URL = $PortalBaseUrl
  CLINIC_HUB_CLIENT_ID = $ClinicHubClientId; CLINIC_HUB_CLIENT_SECRET = $ClinicHubClientSecret
  BILLING_HUB_CLIENT_ID = $BillingHubClientId; BILLING_HUB_CLIENT_SECRET = $BillingHubClientSecret
  UPSTREAM_ENABLED = ''
  BACKUP_DIR = $BackupDir
  STORAGE_PROVIDER = $StorageProvider; STORAGE_ENABLE_LOCAL_FALLBACK = $StorageFallback
  S3_SERVICE_URL = $S3ServiceUrl; S3_BUCKET_NAME = $S3Bucket; S3_ACCESS_KEY_ID = $S3AccessKey; S3_SECRET_ACCESS_KEY = $S3SecretKey
  S3_REGION = $S3Region; S3_FORCE_PATH_STYLE = $S3ForcePathStyle
  R2_ACCOUNT_ID = $R2AccountId; R2_BUCKET_NAME = $R2Bucket; R2_ACCESS_KEY_ID = $R2AccessKey; R2_SECRET_ACCESS_KEY = $R2SecretKey
  R2_PUBLIC_URL = $R2PublicUrl
  FACILITY_LICENSE_PUBLIC_KEY = (Format-KeyValue $LicensePublicKey); EDGE_HUB_SIGNING_KEY = (Format-KeyValue $EdgeSigningKey)
  CLINIC_HUB_SIGNING_KEY = (Format-KeyValue $ClinicHubSigningKey); BILLING_HUB_SIGNING_KEY = (Format-KeyValue $BillingHubSigningKey)
}
if ($LicensePublicKeyFile) { $FromArgs['FACILITY_LICENSE_PUBLIC_KEY'] = Read-KeyFile $LicensePublicKeyFile }
if ($EdgeSigningKeyFile) { $FromArgs['EDGE_HUB_SIGNING_KEY'] = Read-KeyFile $EdgeSigningKeyFile }
if ($ClinicHubSigningKeyFile) { $FromArgs['CLINIC_HUB_SIGNING_KEY'] = Read-KeyFile $ClinicHubSigningKeyFile }
if ($BillingHubSigningKeyFile) { $FromArgs['BILLING_HUB_SIGNING_KEY'] = Read-KeyFile $BillingHubSigningKeyFile }
if ($AirGapped) { $FromArgs['UPSTREAM_ENABLED'] = 'false' }
if ($AirGapped -and $NoLocalHub) {
  Stop-Install '-AirGapped cannot be combined with -NoLocalHub: without a local hub the services talk to the cloud hub directly, so nothing could run offline.'
}

function Get-EnabledServices {
  $s = @('postgres', 'billing-api', 'clinic-api', 'clinic-web')
  if (Test-HasProfile 'local-hub') { $s += 'interop-hub' }
  if (Test-HasProfile 'laboratory') { $s += 'laboratory-api'; $s += 'laboratory-web' }
  if (Test-HasProfile 'pharmacy') { $s += 'pharmacy-api'; $s += 'pharmacy-web' }
  if (Test-HasProfile 'organization') { $s += 'organization-api' }
  if (Test-HasProfile 'cashier') { $s += 'cashier-web' }
  if (Test-HasProfile 'comms') { $s += 'comms-api' }
  return $s
}

# ---------------------------------------------------------------- preflight
function Test-DockerReady {
  Write-Log 'Preflight checks'
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Stop-Install 'docker is not installed (install Docker Desktop: https://docs.docker.com/desktop/).' }
  if (-not (Test-Cmd { docker info })) { Stop-Install 'The docker daemon is not running (start Docker Desktop) or this user may not use it.' }
  if (-not (Test-Cmd { docker compose version })) { Stop-Install "Docker Compose v2 is required (the 'docker compose' command)." }
  $here = (Get-Location).Path
  if ($here -match '^([A-Za-z]):') {
    $drive = $Matches[1]
    $freeGb = 100
    try { $freeGb = [math]::Round((Get-PSDrive -Name $drive).Free / 1GB, 1) } catch { }
    if ($freeGb -lt 3) { Stop-Install "Only $freeGb GB free on drive ${drive}:; the images, database and backups need more." }
    if ($freeGb -lt 10) { Write-Warn "Only $freeGb GB free on drive ${drive}:." }
  }
}

function Test-PortInUse([int]$Port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(500) -and $c.Connected) { return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

function Test-PortsFree {
  if (Get-DcOutput @('ps', '-q')) { return }   # our own stack is already up: the ports are ours
  $ports = @($Cfg['CLINIC_WEB_PORT'])
  if (Test-HasProfile 'laboratory') { $ports += $Cfg['LABORATORY_WEB_PORT'] }
  if (Test-HasProfile 'pharmacy') { $ports += $Cfg['PHARMACY_WEB_PORT'] }
  if (Test-HasProfile 'cashier') { $ports += $Cfg['CASHIER_WEB_PORT'] }
  if (Test-HasProfile 'local-hub') { $ports += $Cfg['HUB_LAN_PORT'] }
  foreach ($p in $ports) {
    if (Test-PortInUse ([int]$p)) { Stop-Install "Port $p is already in use on this host. Change it in .env (CLINIC_WEB_PORT, ..., HUB_LAN_PORT) or stop the other program." }
  }
}

# ---------------------------------------------------------------- configuration
function Select-Profiles {
  $extra = ''
  if ($With) { $extra = $With }
  elseif ($Cfg['COMPOSE_PROFILES']) { $extra = $Cfg['COMPOSE_PROFILES'] }
  elseif ($Interactive) {
    foreach ($p in @('laboratory', 'pharmacy', 'organization', 'cashier', 'comms')) {
      if (Read-YesNo "Enable the $p profile?" $false) { $extra = "$extra,$p" }
    }
  }
  $list = @($extra -replace '\s', '' -split ',' | Where-Object { $_ -and $_ -ne 'local-hub' })
  foreach ($p in $list) {
    if (@('laboratory', 'pharmacy', 'organization', 'cashier', 'comms') -notcontains $p) { Stop-Install "Unknown profile '$p' (laboratory, pharmacy, organization, cashier, comms)." }
  }
  if ($NoLocalHub) {
    if ($list.Count -gt 0) { Stop-Install '-NoLocalHub only fits a single-facility site: several facilities need the local hub (README).' }
    $Cfg['COMPOSE_PROFILES'] = ''
  } else {
    $Cfg['COMPOSE_PROFILES'] = ((@('local-hub') + $list) -join ',')
  }
}

function Get-Config([string]$Mode) {
  # Client model (see README "Credentials the portal hands out"):
  #   hub mode A (local-hub profile on, default): services use LOCAL clients site-<svc> (generated here, fed to the hub through
  #     hub-bootstrap.env and to the services as Messaging__ClientSecret). Only the hub holds ONE portal-issued upstream client.
  #   hub mode B (-NoLocalHub): services talk to the cloud hub with the PORTAL-issued per-service clients (clinic, billing).
  $old = Read-EnvFile $EnvFile
  $oldMode = 'none'
  if (Test-Path -LiteralPath $EnvFile) {
    if ((",$($old['COMPOSE_PROFILES']),") -like '*,local-hub,*') { $oldMode = 'A' } else { $oldMode = 'B' }
  }
  $fromFlags = @{}
  foreach ($k in 'CLINIC_HUB_CLIENT_ID', 'CLINIC_HUB_CLIENT_SECRET', 'BILLING_HUB_CLIENT_ID', 'BILLING_HUB_CLIENT_SECRET', 'UPSTREAM_HUB_URL', 'UPSTREAM_CLIENT_ID', 'UPSTREAM_CLIENT_SECRET', 'EDGE_HUB_SIGNING_KEY', 'CLINIC_HUB_SIGNING_KEY', 'BILLING_HUB_SIGNING_KEY') { $fromFlags[$k] = $FromArgs[$k] }
  foreach ($k in $Keys) {
    $v = ''
    if ($FromArgs.ContainsKey($k)) { $v = $FromArgs[$k] }
    if ([string]::IsNullOrEmpty($v) -and $old.ContainsKey($k)) { $v = $old[$k] }
    if ($v.StartsWith('<')) { $v = '' }
    $Cfg[$k] = $v
  }

  Set-Default 'GHCR_OWNER_REPO' 'nextstep-software-solutions-inc/clinicez-arch2'
  Set-Default 'IMAGE_TAG' 'latest'
  Set-Default 'BASE_DOMAIN' 'clinic.local'
  Set-Default 'EDGE_CELL_NAME' 'Edge site'
  Set-Default 'CLINIC_FACILITY_NAME' 'Clinic'
  Set-Default 'LABORATORY_FACILITY_NAME' 'Laboratory'
  Set-Default 'PHARMACY_FACILITY_NAME' 'Pharmacy'
  Set-Default 'ORGANIZATION_FACILITY_NAME' 'Organization'
  Set-Default 'POSTGRES_USER' 'clinicez'
  Set-Default 'UPSTREAM_ENABLED' 'true'
  Set-Default 'HUB_BIND' '127.0.0.1'
  Set-Default 'HUB_LAN_PORT' '8090'
  Set-Default 'CLINIC_WEB_PORT' '8080'
  Set-Default 'LABORATORY_WEB_PORT' '8081'
  Set-Default 'PHARMACY_WEB_PORT' '8082'
  Set-Default 'CASHIER_WEB_PORT' '8083'
  Set-Default 'BACKUP_DIR' './backups'
  Set-Default 'BACKUP_INTERVAL_HOURS' '24'
  Set-Default 'BACKUP_RETENTION_DAYS' '14'
  Set-Default 'HUB_SIGNING_REQUIRED' 'true'
  Set-Default 'STORAGE_PROVIDER' 'Local'
  Set-Default 'STORAGE_ENABLE_LOCAL_FALLBACK' 'true'
  Set-Default 'S3_REGION' 'auto'
  Set-Default 'S3_FORCE_PATH_STYLE' 'true'

  # Infer provider if S3 or R2 parameters were passed explicitly without -StorageProvider
  if ([string]::IsNullOrEmpty($StorageProvider) -and ($Cfg['STORAGE_PROVIDER'] -eq 'Local')) {
    if ($Cfg['S3_SERVICE_URL'] -or $Cfg['S3_BUCKET_NAME']) { $Cfg['STORAGE_PROVIDER'] = 'S3' }
    elseif ($Cfg['R2_ACCOUNT_ID'] -or $Cfg['R2_BUCKET_NAME']) { $Cfg['STORAGE_PROVIDER'] = 'R2' }
  }

  if ($Mode -eq 'new') { Select-Profiles }
  $hubB = -not (Test-HasProfile 'local-hub')

  # Flags that belong to the other hub mode are refused instead of silently ignored.
  if ((-not $hubB) -and ($fromFlags['CLINIC_HUB_CLIENT_ID'] -or $fromFlags['CLINIC_HUB_CLIENT_SECRET'] -or $fromFlags['BILLING_HUB_CLIENT_ID'] -or $fromFlags['BILLING_HUB_CLIENT_SECRET'] -or $fromFlags['CLINIC_HUB_SIGNING_KEY'] -or $fromFlags['BILLING_HUB_SIGNING_KEY'])) {
    Stop-Install '-ClinicHubClient* / -BillingHubClient* / -ClinicHubSigningKey* / -BillingHubSigningKey* are the portal''s per-service clients and only fit -NoLocalHub. With the local hub the installer generates the local site-<service> clients and their signing keys.'
  }
  if ($hubB -and ($fromFlags['UPSTREAM_CLIENT_ID'] -or $fromFlags['UPSTREAM_CLIENT_SECRET'] -or $fromFlags['EDGE_HUB_SIGNING_KEY'])) {
    Stop-Install '-EdgeClientId/-EdgeClientSecret/-EdgeSigningKey* are the upstream client of the LOCAL hub. With -NoLocalHub use -ClinicHubClient*, -BillingHubClient* and the matching -*HubSigningKey*.'
  }
  # Switching hub mode with -Force: the old clients are of another kind (local site-<svc> vs portal-issued), never reuse them.
  if ($Mode -eq 'new' -and $oldMode -ne 'none' -and (($oldMode -eq 'B') -ne $hubB)) {
    foreach ($k in 'CLINIC_HUB_CLIENT_ID', 'CLINIC_HUB_CLIENT_SECRET', 'BILLING_HUB_CLIENT_ID', 'BILLING_HUB_CLIENT_SECRET', 'CLINIC_HUB_SIGNING_KEY', 'BILLING_HUB_SIGNING_KEY') { $Cfg[$k] = $fromFlags[$k] }
    $Cfg['CLINIC_HUB_PUBLIC_KEY'] = ''; $Cfg['BILLING_HUB_PUBLIC_KEY'] = ''
    $Cfg['MESSAGING_HUB_URL'] = ''
  }

  if ($Mode -eq 'new') {
    Read-Value 'TENANT_ID' 'Tenant id (from the portal)'
    Read-Value 'EDGE_CELL_ID' 'Edge cell id (from the portal)'
    Read-Value 'CLINIC_FACILITY_ID' 'Clinic facility id (GUID, from the portal)'
    if (Test-HasProfile 'laboratory') { Read-Value 'LABORATORY_FACILITY_ID' 'Laboratory facility id (GUID)' }
    if (Test-HasProfile 'pharmacy') { Read-Value 'PHARMACY_FACILITY_ID' 'Pharmacy facility id (GUID)' }
    if (Test-HasProfile 'organization') { Read-Value 'ORGANIZATION_FACILITY_ID' 'Organization facility id (GUID)' }
    Read-Value 'FACILITY_LICENSE_PUBLIC_KEY' 'License public key (base64 of PEM, from the portal; or pass -LicensePublicKeyFile)'

    if ($Interactive -and [string]::IsNullOrEmpty($StorageProvider) -and (-not ($Cfg['S3_SERVICE_URL'] -or $Cfg['S3_BUCKET_NAME'] -or $Cfg['R2_ACCOUNT_ID'] -or $Cfg['R2_BUCKET_NAME']))) {
      if (Read-YesNo 'Configure external S3-compatible storage (e.g. MinIO, Ceph, Cloudflare R2)?' $false) {
        $sp = Read-Host -Prompt 'Storage provider (S3/R2) [S3]'
        if ([string]::IsNullOrWhiteSpace($sp)) { $sp = 'S3' }
        if ($sp -match '^[rR]2?') { $Cfg['STORAGE_PROVIDER'] = 'R2' } else { $Cfg['STORAGE_PROVIDER'] = 'S3' }
      }
    }
    if ($Cfg['STORAGE_PROVIDER'] -eq 'S3') {
      Read-Value 'S3_SERVICE_URL' 'S3 service URL (e.g. http://minio.local:9000, https://s3.hospital.internal)'
      Read-Value 'S3_BUCKET_NAME' 'S3 bucket name'
      Read-Value 'S3_ACCESS_KEY_ID' 'S3 access key id'
      Read-Value 'S3_SECRET_ACCESS_KEY' 'S3 secret access key' -Secret
    } elseif ($Cfg['STORAGE_PROVIDER'] -eq 'R2') {
      Read-Value 'R2_ACCOUNT_ID' 'Cloudflare R2 Account ID'
      Read-Value 'R2_BUCKET_NAME' 'Cloudflare R2 Bucket name'
      Read-Value 'R2_ACCESS_KEY_ID' 'Cloudflare R2 Access Key ID'
      Read-Value 'R2_SECRET_ACCESS_KEY' 'Cloudflare R2 Secret Access Key' -Secret
    }
  }

  if (@('true', 'false') -notcontains $Cfg['UPSTREAM_ENABLED']) { Stop-Install 'UPSTREAM_ENABLED must be true or false.' }
  if ($hubB) {
    # No local hub: no upstream at all. MESSAGING_HUB_URL is the cloud hub; clinic and billing use the portal's own clients.
    $Cfg['UPSTREAM_ENABLED'] = 'true'
    foreach ($k in 'UPSTREAM_HUB_URL', 'UPSTREAM_CLIENT_ID', 'UPSTREAM_CLIENT_SECRET', 'LABORATORY_HUB_CLIENT_ID', 'LABORATORY_HUB_CLIENT_SECRET', 'PHARMACY_HUB_CLIENT_ID', 'PHARMACY_HUB_CLIENT_SECRET', 'ORGANIZATION_HUB_CLIENT_ID', 'ORGANIZATION_HUB_CLIENT_SECRET', 'EDGE_HUB_SIGNING_KEY', 'CLINIC_HUB_PUBLIC_KEY', 'BILLING_HUB_PUBLIC_KEY', 'LABORATORY_HUB_SIGNING_KEY', 'LABORATORY_HUB_PUBLIC_KEY', 'PHARMACY_HUB_SIGNING_KEY', 'PHARMACY_HUB_PUBLIC_KEY', 'ORGANIZATION_HUB_SIGNING_KEY', 'ORGANIZATION_HUB_PUBLIC_KEY') { $Cfg[$k] = '' }
    if ($fromFlags['UPSTREAM_HUB_URL']) { $Cfg['MESSAGING_HUB_URL'] = $fromFlags['UPSTREAM_HUB_URL'] }
    if ($Mode -eq 'new') {
      Read-Value 'MESSAGING_HUB_URL' 'Cloud hub URL (portal HubEdgeCredentials.HubUrl)'
      Read-Value 'CLINIC_HUB_CLIENT_ID' 'Clinic hub client id (portal-issued)'
      Read-Value 'CLINIC_HUB_CLIENT_SECRET' 'Clinic hub client secret (portal-issued)' -Secret
      Read-Value 'BILLING_HUB_CLIENT_ID' 'Billing hub client id (portal-issued)'
      Read-Value 'BILLING_HUB_CLIENT_SECRET' 'Billing hub client secret (portal-issued)' -Secret
      Read-Value 'CLINIC_HUB_SIGNING_KEY' 'Clinic hub signing key (portal-issued, base64 of PEM)' -Secret
      Read-Value 'BILLING_HUB_SIGNING_KEY' 'Billing hub signing key (portal-issued, base64 of PEM)' -Secret
      Read-Value 'PORTAL_BASE_URL' 'Portal web base URL (cloud portal)'
    }
  } else {
    Set-Default 'MESSAGING_HUB_URL' 'http://interop-hub:8080'
    if ($Mode -eq 'new' -and $Cfg['UPSTREAM_ENABLED'] -eq 'true') {
      Read-Value 'UPSTREAM_HUB_URL' 'Cloud hub URL (portal HubEdgeCredentials.HubUrl)'
      Read-Value 'UPSTREAM_CLIENT_ID' 'Upstream edge client id (portal HubEdgeCredentials.ClientId)'
      Read-Value 'UPSTREAM_CLIENT_SECRET' 'Upstream edge client secret (portal HubEdgeCredentials.ClientSecret)' -Secret
      Read-Value 'EDGE_HUB_SIGNING_KEY' 'Edge hub signing key (portal-issued with the edge client, base64 of PEM)' -Secret
      Read-Value 'PORTAL_BASE_URL' 'Portal web base URL (cloud portal)'
    }
  }
  if (-not $Cfg['PORTAL_BASE_URL']) {
    Write-Warn 'PORTAL_BASE_URL is empty: lab orders cannot be issued until it is set (public URL of the cloud portal; -PortalBaseUrl, or edit .env and run .\install.ps1 apply).'
  }
  if ($Mode -eq 'reuse' -and $AirGapped -and $old['UPSTREAM_ENABLED'] -ne 'false') {
    Write-Warn '-AirGapped is ignored on an existing .env: set UPSTREAM_ENABLED=false in .env and run .\install.ps1 apply (or re-run with -Force).'
  }

  foreach ($k in ($PubKeyVars + $PrivKeyVars)) { $Cfg[$k] = Format-KeyValue $Cfg[$k] }

  # Mode A: local hub clients site-<svc>, generated once then kept (read back from .env above). Mode B: the clinic and billing
  # clients are the portal's (asked above, never generated) and the other services do not run.
  foreach ($s in $Services) {
    if (-not $hubB) {
      Set-Default "$($s.Prefix)_HUB_CLIENT_ID" "site-$($s.Svc)"
      Set-GeneratedSecret "$($s.Prefix)_HUB_CLIENT_SECRET" 40
      Set-EnsuredKeyPair "$($s.Prefix)_HUB_SIGNING_KEY" "$($s.Prefix)_HUB_PUBLIC_KEY"
    }
    Set-GeneratedSecret "$($s.Prefix)_JWT_SIGNING_KEY" 64
  }
  Set-GeneratedSecret 'POSTGRES_PASSWORD' 40
  Set-GeneratedSecret 'HANGFIRE_DASHBOARD_PASSWORD' 24
  Set-GeneratedSecret 'CLINIC_ENCRYPTION_MASTER_SECRET' 64
  Set-GeneratedSecret 'CLINIC_DOCUMENT_SIGNING_KEY' 64
  Set-GeneratedSecret 'LABORATORY_DOCUMENT_SIGNING_KEY' 64
  Set-GeneratedSecret 'GAMOT_UPSC_SECRET_KEY' 64
  if ([string]::IsNullOrEmpty($Cfg['HUB_PAYLOAD_ENCRYPTION_KEY'])) { $Cfg['HUB_PAYLOAD_ENCRYPTION_KEY'] = New-Base64Key32 }

  foreach ($k in 'UPSTREAM_HUB_URL', 'PORTAL_BASE_URL', 'MESSAGING_HUB_URL', 'S3_SERVICE_URL', 'R2_PUBLIC_URL') { $Cfg[$k] = $Cfg[$k].TrimEnd('/') }
  foreach ($k in $Keys) {
    if ($k -eq 'EDGE_CELL_NAME' -or $k -like '*_FACILITY_NAME') { Test-SafeValue $k -AllowSpaces } else { Test-SafeValue $k }
  }
  foreach ($k in 'CLINIC_FACILITY_ID', 'LABORATORY_FACILITY_ID', 'PHARMACY_FACILITY_ID', 'ORGANIZATION_FACILITY_ID') {
    if ($Cfg[$k] -and $Cfg[$k] -notmatch '^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$') { Stop-Install "$k must be a GUID (got '$($Cfg[$k])')." }
  }
  if ($Cfg['EDGE_CELL_ID'].Contains(':')) { Stop-Install "EDGE_CELL_ID must not contain ':'." }
  if (@('true', 'false') -notcontains $Cfg['HUB_SIGNING_REQUIRED']) { Stop-Install 'HUB_SIGNING_REQUIRED must be true or false.' }
  if (@('Local', 'S3', 'R2') -notcontains $Cfg['STORAGE_PROVIDER']) { Stop-Install "STORAGE_PROVIDER must be Local, S3, or R2 (got '$($Cfg['STORAGE_PROVIDER'])')." }
  if (@('true', 'false') -notcontains $Cfg['STORAGE_ENABLE_LOCAL_FALLBACK']) { Stop-Install 'STORAGE_ENABLE_LOCAL_FALLBACK must be true or false.' }
  if (@('true', 'false') -notcontains $Cfg['S3_FORCE_PATH_STYLE']) { Stop-Install 'S3_FORCE_PATH_STYLE must be true or false.' }

  if ($Cfg['STORAGE_PROVIDER'] -eq 'S3') {
    if (-not $Cfg['S3_BUCKET_NAME']) { Stop-Install 'S3_BUCKET_NAME is required when STORAGE_PROVIDER=S3.' }
    if (-not $Cfg['S3_ACCESS_KEY_ID']) { Stop-Install 'S3_ACCESS_KEY_ID is required when STORAGE_PROVIDER=S3.' }
    if (-not $Cfg['S3_SECRET_ACCESS_KEY']) { Stop-Install 'S3_SECRET_ACCESS_KEY is required when STORAGE_PROVIDER=S3.' }
  } elseif ($Cfg['STORAGE_PROVIDER'] -eq 'R2') {
    if (-not $Cfg['R2_ACCOUNT_ID']) { Stop-Install 'R2_ACCOUNT_ID is required when STORAGE_PROVIDER=R2.' }
    if (-not $Cfg['R2_BUCKET_NAME']) { Stop-Install 'R2_BUCKET_NAME is required when STORAGE_PROVIDER=R2.' }
    if (-not $Cfg['R2_ACCESS_KEY_ID']) { Stop-Install 'R2_ACCESS_KEY_ID is required when STORAGE_PROVIDER=R2.' }
    if (-not $Cfg['R2_SECRET_ACCESS_KEY']) { Stop-Install 'R2_SECRET_ACCESS_KEY is required when STORAGE_PROVIDER=R2.' }
  }
  foreach ($k in $PubKeyVars) { Test-KeyValue $k 'public' }
  foreach ($k in $PrivKeyVars) { Test-KeyValue $k 'private' }
  if ($Mode -eq 'reuse') {
    $required = @('GHCR_OWNER_REPO', 'TENANT_ID', 'EDGE_CELL_ID', 'CLINIC_FACILITY_ID', 'FACILITY_LICENSE_PUBLIC_KEY', 'STORAGE_PROVIDER')
    if ($hubB) { $required += @('MESSAGING_HUB_URL', 'CLINIC_HUB_CLIENT_ID', 'CLINIC_HUB_CLIENT_SECRET', 'BILLING_HUB_CLIENT_ID', 'BILLING_HUB_CLIENT_SECRET', 'CLINIC_HUB_SIGNING_KEY', 'BILLING_HUB_SIGNING_KEY') }
    elseif ($Cfg['UPSTREAM_ENABLED'] -eq 'true') { $required += @('UPSTREAM_HUB_URL', 'UPSTREAM_CLIENT_ID', 'UPSTREAM_CLIENT_SECRET', 'EDGE_HUB_SIGNING_KEY') }
    if ($Cfg['STORAGE_PROVIDER'] -eq 'S3') { $required += @('S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY') }
    elseif ($Cfg['STORAGE_PROVIDER'] -eq 'R2') { $required += @('R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY') }
    foreach ($k in $required) {
      if (-not $Cfg[$k]) { Stop-Install "$k is empty in $EnvFile. Fix it, or re-run with -Force and the parameters (a missing key can also be given with its parameter on this command: .\install.ps1 apply|upgrade stores it in $EnvFile)." }
    }
  }
}

function Write-EnvFile {
  $c = $Cfg
  $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $lines = @(
    "# Written by install.ps1 on $now. Every variable is documented in .env.example.",
    '# Contains secrets: keep it out of git and out of the database backups. Re-running the installer keeps the generated ones.',
    '', '# Images'
  )
  $groups = @(
    @('GHCR_OWNER_REPO', 'IMAGE_TAG', 'COMPOSE_PROFILES'),
    @('# Identity (portal)', 'TENANT_ID', 'EDGE_CELL_ID', 'EDGE_CELL_NAME', 'CLINIC_FACILITY_ID', 'CLINIC_FACILITY_NAME', 'LABORATORY_FACILITY_ID', 'LABORATORY_FACILITY_NAME', 'PHARMACY_FACILITY_ID', 'PHARMACY_FACILITY_NAME', 'ORGANIZATION_FACILITY_ID', 'ORGANIZATION_FACILITY_NAME', 'BASE_DOMAIN', 'CORS_ALLOWED_ORIGINS'),
    @('# Cloud link of the LOCAL hub (mode A): ONE EdgeCell client (Service ''cell'') the portal issued = portal HubEdgeCredentials.',
      '# UPSTREAM_ENABLED=false (-AirGapped): the hub runs without any upstream, same-cell traffic only. Empty values are fine then;',
      '# to connect later set it to true, fill the three UPSTREAM_* values and run .\install.ps1 apply. Not used with -NoLocalHub.',
      'UPSTREAM_ENABLED', 'UPSTREAM_HUB_URL', 'UPSTREAM_CLIENT_ID', 'UPSTREAM_CLIENT_SECRET'),
    @('# Public URL of the lab-result upload page printed on lab slips (a cloud page; the site only needs outbound access).',
      '# Required to issue lab orders. May be empty when air-gapped.',
      'PORTAL_BASE_URL'),
    @('# Messaging clients of the services.',
      '#   Local hub (default): MESSAGING_HUB_URL is the local hub; every <SVC>_HUB_CLIENT_ID/SECRET is a LOCAL client (site-<service>)',
      '#     generated here; the same values go into hub-bootstrap.env.',
      '#   -NoLocalHub: MESSAGING_HUB_URL is the cloud hub; CLINIC_ and BILLING_HUB_CLIENT_ID/SECRET are the PORTAL-issued',
      '#     per-service clients (the other services do not run).',
      'MESSAGING_HUB_URL', 'CLINIC_HUB_CLIENT_ID', 'CLINIC_HUB_CLIENT_SECRET', 'BILLING_HUB_CLIENT_ID', 'BILLING_HUB_CLIENT_SECRET', 'LABORATORY_HUB_CLIENT_ID', 'LABORATORY_HUB_CLIENT_SECRET', 'PHARMACY_HUB_CLIENT_ID', 'PHARMACY_HUB_CLIENT_SECRET', 'ORGANIZATION_HUB_CLIENT_ID', 'ORGANIZATION_HUB_CLIENT_SECRET', 'COMMS_HUB_CLIENT_ID', 'COMMS_HUB_CLIENT_SECRET', 'HUB_PAYLOAD_ENCRYPTION_KEY', 'HUB_BIND', 'HUB_LAN_PORT'),
    @('# Database', 'POSTGRES_USER', 'POSTGRES_PASSWORD'),
    @('# Clinical Record Storage', 'STORAGE_PROVIDER', 'STORAGE_ENABLE_LOCAL_FALLBACK', 'S3_SERVICE_URL', 'S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'),
    @('# Service secrets', 'HANGFIRE_DASHBOARD_PASSWORD', 'CLINIC_JWT_SIGNING_KEY', 'BILLING_JWT_SIGNING_KEY', 'LABORATORY_JWT_SIGNING_KEY', 'PHARMACY_JWT_SIGNING_KEY', 'ORGANIZATION_JWT_SIGNING_KEY', 'COMMS_JWT_SIGNING_KEY', 'CLINIC_ENCRYPTION_MASTER_SECRET',
      '# Only while rotating the master secret: the previous value(s), so old records stay readable (see README).',
      'CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0', 'CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_1',
      '# Keys of the document digests (verification QR codes), one per service, and the pharmacy UPSC code key: keep them with this file.',
      'CLINIC_DOCUMENT_SIGNING_KEY', 'LABORATORY_DOCUMENT_SIGNING_KEY', 'GAMOT_UPSC_SECRET_KEY'),
    @('# Keys (ECDSA P-256, one-line base64 of a PEM).',
      '#   FACILITY_LICENSE_PUBLIC_KEY: the portal''s license public key, validates the facility licenses (REQUIRED). _PREVIOUS only while the portal rotates.',
      '#   EDGE_HUB_SIGNING_KEY: PRIVATE key the portal issued with the edge client (local hub re-signs upstream envelopes; empty only air-gapped).',
      '#   <SVC>_HUB_SIGNING_KEY / _PUBLIC_KEY: one pair per service client, generated by the installer (local hub); with -NoLocalHub the',
      '#     clinic / billing signing keys are portal-issued and the public keys stay empty. The private keys never leave this host.',
      'FACILITY_LICENSE_PUBLIC_KEY', 'FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS', 'HUB_SIGNING_REQUIRED', 'EDGE_HUB_SIGNING_KEY',
      'CLINIC_HUB_SIGNING_KEY', 'CLINIC_HUB_PUBLIC_KEY', 'BILLING_HUB_SIGNING_KEY', 'BILLING_HUB_PUBLIC_KEY',
      'LABORATORY_HUB_SIGNING_KEY', 'LABORATORY_HUB_PUBLIC_KEY', 'PHARMACY_HUB_SIGNING_KEY', 'PHARMACY_HUB_PUBLIC_KEY',
      'ORGANIZATION_HUB_SIGNING_KEY', 'ORGANIZATION_HUB_PUBLIC_KEY', 'COMMS_HUB_SIGNING_KEY', 'COMMS_HUB_PUBLIC_KEY'),
    @('# Web ports', 'CLINIC_WEB_PORT', 'LABORATORY_WEB_PORT', 'PHARMACY_WEB_PORT', 'CASHIER_WEB_PORT'),
    @('# Backups', 'BACKUP_DIR', 'BACKUP_INTERVAL_HOURS', 'BACKUP_RETENTION_DAYS')
  )
  $first = $true
  foreach ($g in $groups) {
    if (-not $first) { $lines += ''; }
    $first = $false
    foreach ($item in $g) {
      if ($item.StartsWith('#')) { $lines += $item } else { $lines += "$item=$($c[$item])" }
    }
  }
  Write-LfFile $EnvFile (($lines -join "`n") + "`n")
  Write-Log "Wrote $EnvFile"
}

function Add-MissingEnvValues {
  $old = Read-EnvFile $EnvFile
  $add = @()
  foreach ($k in $Keys) {
    if (-not $old.ContainsKey($k) -and $Cfg[$k]) { $add += "$k=$($Cfg[$k])" }
  }
  if ($add.Count -gt 0) {
    $text = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $EnvFile))
    if (-not $text.EndsWith("`n")) { $text += "`n" }
    Write-LfFile $EnvFile ($text + ($add -join "`n") + "`n")
  }
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = @()
  foreach ($l in [System.IO.File]::ReadAllLines((Join-Path $PSScriptRoot $EnvFile))) { if ($l -notmatch "^$Key=") { $lines += $l } }
  $lines += "$Key=$Value"
  Write-LfFile $EnvFile (($lines -join "`n") + "`n")
}

# hub-bootstrap.env: the cell, one EdgeCell client per enabled service and the site's facilities. The client secrets are the
# very values the services get as Messaging__ClientSecret (same variables in .env), so the two sides always match. These are the
# LOCAL clients site-<svc>; the portal-issued upstream client (UPSTREAM_*) is deliberately not in here. Without the local hub
# (-NoLocalHub) there is nothing to declare: the file is still written, comment-only, so compose always finds it.
function Write-HubBootstrap {
  $c = $Cfg
  if (-not (Test-HasProfile 'local-hub')) {
    Write-LfFile $HubEnvFile "# Generated by install.ps1 (.\install.ps1 render). No local hub on this site (-NoLocalHub): nothing to declare.`n"
    Write-Log "Rendered $HubEnvFile (no local hub: empty)"
    return
  }
  $out = @(
    '# Generated by install.ps1 from .env (.\install.ps1 render). Do not edit; contains the local hub client secrets and public keys.',
    "Hub__Bootstrap__Cells__0__CellId=$($c['EDGE_CELL_ID'])",
    "Hub__Bootstrap__Cells__0__Name=$($c['EDGE_CELL_NAME'])",
    'Hub__Bootstrap__Cells__0__Kind=Edge',
    "Hub__Bootstrap__Cells__0__TenantId=$($c['TENANT_ID'])"
  )
  $ci = 0; $fi = 0
  foreach ($s in $Services) {
    if ($s.Profile -and -not (Test-HasProfile $s.Profile)) { continue }
    $out += "Hub__Bootstrap__Clients__${ci}__ClientId=$($c["$($s.Prefix)_HUB_CLIENT_ID"])"
    $out += "Hub__Bootstrap__Clients__${ci}__Secret=$($c["$($s.Prefix)_HUB_CLIENT_SECRET"])"
    $out += "Hub__Bootstrap__Clients__${ci}__PublicKey=$($c["$($s.Prefix)_HUB_PUBLIC_KEY"])"
    $out += "Hub__Bootstrap__Clients__${ci}__CellId=$($c['EDGE_CELL_ID'])"
    $out += "Hub__Bootstrap__Clients__${ci}__Service=$($s.Svc)"
    $out += "Hub__Bootstrap__Clients__${ci}__Kind=EdgeCell"
    $ci++
    if ($s.FType -ne '-' -and $c["$($s.Prefix)_FACILITY_ID"]) {
      $out += "Hub__Bootstrap__Facilities__${fi}__TenantId=$($c['TENANT_ID'])"
      $out += "Hub__Bootstrap__Facilities__${fi}__FacilityId=$($c["$($s.Prefix)_FACILITY_ID"])"
      $out += "Hub__Bootstrap__Facilities__${fi}__FacilityType=$($s.FType)"
      $out += "Hub__Bootstrap__Facilities__${fi}__CellId=$($c['EDGE_CELL_ID'])"
      $out += "Hub__Bootstrap__Facilities__${fi}__DisplayName=$($c["$($s.Prefix)_FACILITY_NAME"])"
      $fi++
    }
  }
  Write-LfFile $HubEnvFile (($out -join "`n") + "`n")
  Write-Log "Rendered $HubEnvFile ($ci clients, $fi facilities)"
}

# ---------------------------------------------------------------- stack
function Connect-Registry {
  if ($env:GHCR_TOKEN) {
    if (-not $env:GHCR_USER) { Stop-Install 'Set GHCR_USER together with GHCR_TOKEN.' }
    Write-Log 'Logging in to ghcr.io'
    $env:GHCR_TOKEN | & docker login ghcr.io -u $env:GHCR_USER --password-stdin | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Install 'docker login ghcr.io failed.' }
  }
}

function Wait-Healthy([int]$TimeoutSeconds) {
  Write-Log "Waiting for services to become healthy (up to ${TimeoutSeconds}s)"
  $waited = 0
  while ($true) {
    $pending = @()
    foreach ($svc in (Get-EnabledServices)) {
      $cid = Get-DcOutput @('ps', '-q', $svc)
      if (-not $cid) { $pending += $svc; continue }
      $st = ''
      $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $st = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $cid 2>$null | Out-String).Trim() } finally { $ErrorActionPreference = $old }
      if ($st -ne 'healthy' -and $st -ne 'running') { $pending += $svc }
    }
    if ($pending.Count -eq 0) { Write-Log 'All services are healthy'; return $true }
    if ($waited -ge $TimeoutSeconds) { Write-Warn "Not healthy after ${TimeoutSeconds}s: $($pending -join ' ')  (docker compose logs --tail 100 $($pending -join ' '))"; return $false }
    Start-Sleep -Seconds 5; $waited += 5
  }
}

function Start-Stack {
  Write-HubBootstrap
  if ($NoStart) { Write-Log '-NoStart: configuration written, nothing started.'; return }
  if (-not $NoPull) {
    Connect-Registry
    Write-Log "Pulling images (profiles: $($Cfg['COMPOSE_PROFILES']))"
    if (-not (Invoke-Dc @('pull') -AllowFail)) {
      Stop-Install "docker compose pull failed. Check the network and ghcr.io access (docker login ghcr.io, GHCR_OWNER_REPO=$($Cfg['GHCR_OWNER_REPO']), IMAGE_TAG=$($Cfg['IMAGE_TAG'])). Air-gapped: docker load the images, then use -NoPull."
    }
  }
  Write-Log 'Starting the cell'
  [void](Invoke-Dc @('up', '-d', '--remove-orphans'))
  [void](Wait-Healthy 300)
}

# ---------------------------------------------------------------- activation
$script:ActivationPending = $false

function Read-ErrorBody($ex) {
  try {
    $r = $ex.Exception.Response
    if ($r) { $sr = New-Object System.IO.StreamReader($r.GetResponseStream()); $t = $sr.ReadToEnd(); $sr.Close(); return $t }
  } catch { }
  return $ex.Exception.Message
}

function Invoke-Activation([string]$Label, [string]$Port, [string]$Token) {
  $base = "http://127.0.0.1:$Port"
  $body = ''
  try { $body = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "$base/api/v1/license").Content } catch { }
  if ($body -match '"status"\s*:\s*"Active"') { Write-Log "${Label}: license is already active."; return }
  if (-not $Token) {
    Write-Warn "$Label is not activated. Run: .\install.ps1 activate -LicenseToken <token>   or   -LicenseFile <file>"
    $script:ActivationPending = $true
    return
  }
  if ($Token -notmatch '^[A-Za-z0-9_.=-]+$') { Stop-Install "$Label license token has unexpected characters (expected <payload>.<signature>)." }
  try {
    $json = '{"licenseToken":"' + $Token + '"}'
    [void](Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Method Post -ContentType 'application/json' -Body $json -Uri "$base/api/v1/license/apply")
    Write-Log "${Label}: license applied."
  } catch {
    $msg = Read-ErrorBody $_
    if ($msg.Length -gt 400) { $msg = $msg.Substring(0, 400) }
    Write-Warn "${Label}: activation failed: $msg"
    $script:ActivationPending = $true
  }
}

function Invoke-ActivationAll {
  Invoke-Activation 'Clinic' $Cfg['CLINIC_WEB_PORT'] $LicenseClinic
  if (Test-HasProfile 'laboratory') { Invoke-Activation 'Laboratory' $Cfg['LABORATORY_WEB_PORT'] $LicenseLaboratory }
  if (Test-HasProfile 'pharmacy') { Invoke-Activation 'Pharmacy' $Cfg['PHARMACY_WEB_PORT'] $LicensePharmacy }
}

# ---------------------------------------------------------------- commands
function Show-NextSteps {
  $h = '<this-server>'
  try { $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1; if ($ip) { $h = $ip.IPAddress } } catch { }
  Write-Host ''
  Write-Log 'Edge cell is up. Next steps'
  Write-Host "  Clinic web:      http://${h}:$($Cfg['CLINIC_WEB_PORT'])   (native apps: enter this address as the server)"
  if (Test-HasProfile 'laboratory') { Write-Host "  Laboratory web:  http://${h}:$($Cfg['LABORATORY_WEB_PORT'])" }
  if (Test-HasProfile 'pharmacy') { Write-Host "  Pharmacy web:    http://${h}:$($Cfg['PHARMACY_WEB_PORT'])" }
  if (Test-HasProfile 'cashier') { Write-Host "  Cashier web:     http://${h}:$($Cfg['CASHIER_WEB_PORT'])" }
  if ($script:ActivationPending) { Write-Host '  Activate:        .\install.ps1 activate -LicenseToken <token>   (or -LicenseFile <file> for an air-gapped site)' }
  Write-Host '  Create the first admin in the clinic web app, then add staff.'
  if ((Test-HasProfile 'local-hub') -and $Cfg['UPSTREAM_ENABLED'] -eq 'false') {
    Write-Host '  Air-gapped:      same-cell traffic only; cross-cell/portal messages are rejected, not queued. To connect later: set UPSTREAM_ENABLED=true + UPSTREAM_* in .env, then .\install.ps1 apply'
  }
  Write-Host "  Backups:         every $($Cfg['BACKUP_INTERVAL_HOURS'])h to $($Cfg['BACKUP_DIR']), kept $($Cfg['BACKUP_RETENTION_DAYS']) days.  Copy .env somewhere safe too."
  Write-Host "  Storage:         $($Cfg['STORAGE_PROVIDER']) (fallback to local disk: $($Cfg['STORAGE_ENABLE_LOCAL_FALLBACK']))"
  Write-Host '  Status / logs:   .\install.ps1 status      docker compose logs -f clinic-api'
  Write-Host '  Upgrade:         .\install.ps1 upgrade -Tag <version>'
}

function Invoke-Install {
  Test-DockerReady
  if ((Test-Path -LiteralPath $EnvFile) -and -not $Force) {
    Write-Log "$EnvFile exists: reusing it (-Force rewrites it and keeps the generated secrets)."
    Get-Config 'reuse'
    Add-MissingEnvValues
  } else {
    if (Test-Path -LiteralPath $EnvFile) {
      $bak = "$EnvFile.bak.$(Get-Date -Format yyyyMMddHHmmss)"
      Copy-Item -LiteralPath $EnvFile -Destination $bak
      Write-Log "Saved the old $EnvFile as $bak"
    }
    Get-Config 'new'
    Write-EnvFile
  }
  Test-PortsFree
  Start-Stack
  if (-not $NoStart) { Invoke-ActivationAll; Show-NextSteps }
}

function Invoke-Backup {
  Require-EnvFile
  Write-Log 'Backing up now'
  [void](Invoke-Dc @('exec', '-T', 'backup', '/bin/bash', '/backup/backup.sh', 'once'))
}

function Invoke-Upgrade {
  Require-EnvFile; Test-DockerReady
  $previous = (Read-EnvFile $EnvFile)['IMAGE_TAG']
  Get-Config 'reuse'
  Add-MissingEnvValues
  if ($Cfg['IMAGE_TAG'] -ne $previous) { Set-EnvValue 'IMAGE_TAG' $Cfg['IMAGE_TAG'] }
  if (-not $NoBackup) { try { Invoke-Backup } catch { Write-Warn "Pre-upgrade backup failed; continuing. $($_.Exception.Message)" } }
  Start-Stack
  if (-not $previous) { $previous = '<previous>' }
  Write-Log "Upgraded to tag '$($Cfg['IMAGE_TAG'])' (previous: '$previous'). Roll back with: .\install.ps1 upgrade -Tag $previous -NoBackup"
}

function Invoke-Restore {
  Require-EnvFile; Test-DockerReady; Get-Config 'reuse'
  if (-not $BackupFile) { Stop-Install 'Usage: .\install.ps1 restore <backup file>' }
  if (-not (Test-Path -LiteralPath $BackupFile)) { Stop-Install "File not found: $BackupFile" }
  $full = (Resolve-Path -LiteralPath $BackupFile).Path
  $name = Split-Path -Leaf $full
  $stop = @(Get-EnabledServices | Where-Object { $_ -ne 'postgres' })
  if ($name -like '*.dump') {
    $db = $name.Split('.')[0]
    Write-Warn "This REPLACES the contents of database $db with $name. Services are stopped while it runs."
    if (-not $Yes -and -not (Read-YesNo 'Continue?' $false)) { Stop-Install 'Cancelled.' }
    [void](Invoke-Dc (@('stop') + $stop))
    $cid = Get-DcOutput @('ps', '-q', 'postgres')
    & docker cp $full "${cid}:/tmp/restore.dump" | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-Install 'docker cp failed.' }
    if (-not (Invoke-Dc @('exec', '-T', 'postgres', 'pg_restore', '-U', $Cfg['POSTGRES_USER'], '-d', $db, '--clean', '--if-exists', '--no-owner', '/tmp/restore.dump') -AllowFail)) {
      Write-Warn "pg_restore reported problems (often harmless 'does not exist' notices): check the output above."
    }
    [void](Invoke-Dc @('exec', '-T', 'postgres', 'rm', '-f', '/tmp/restore.dump') -AllowFail)
  } elseif ($name -like '*.tar.gz') {
    Write-Warn "This OVERWRITES the clinical records and JWT key volumes with the contents of $name. Services are stopped while it runs."
    if (-not $Yes -and -not (Read-YesNo 'Continue?' $false)) { Stop-Install 'Cancelled.' }
    [void](Invoke-Dc (@('stop') + $stop))
    $dockerArgs = @('run', '--rm', '-v', 'clinicez-edge_clinic-records:/data/clinic-records')
    foreach ($svc in 'clinic-api', 'billing-api', 'laboratory-api', 'pharmacy-api', 'organization-api', 'comms-api') { $dockerArgs += '-v'; $dockerArgs += "clinicez-edge_${svc}-keys:/data/keys/$svc" }
    $dockerArgs += '-v'; $dockerArgs += ((Split-Path -Parent $full) + ':/in:ro')
    $dockerArgs += 'postgres:16'; $dockerArgs += 'tar'; $dockerArgs += '-xzf'; $dockerArgs += "/in/$name"; $dockerArgs += '-C'; $dockerArgs += '/data'
    & docker @dockerArgs | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-Install 'Restoring the files failed.' }
  } else {
    Stop-Install 'Unknown backup file type (expected <DB>.<time>.dump or files.<time>.tar.gz).'
  }
  [void](Invoke-Dc @('up', '-d'))
  [void](Wait-Healthy 300)
  Write-Log 'Restore finished.'
}

function Invoke-Status {
  Require-EnvFile; Get-Config 'reuse'
  [void](Invoke-Dc @('ps') -AllowFail)
  Write-Host ''
  $body = ''
  try { $body = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "http://127.0.0.1:$($Cfg['CLINIC_WEB_PORT'])/api/v1/license").Content } catch { }
  if ($body) { Write-Host "Clinic license: $body" } else { Write-Host 'Clinic license: API not reachable' }
  if ((Test-HasProfile 'local-hub') -and $Cfg['UPSTREAM_ENABLED'] -eq 'false') {
    Write-Host 'Hub upstream: disabled (UPSTREAM_ENABLED=false, air-gapped): same-cell traffic only.'
  } elseif (Test-HasProfile 'local-hub') {
    $n = Get-DcOutput @('exec', '-T', 'postgres', 'psql', '-U', $Cfg['POSTGRES_USER'], '-d', 'CLINICEZ_INTEROP_HUB_LOCAL_DB', '-tAc', 'SELECT count(*) FROM public."Outbound"')
    if (-not $n) { $n = 'n/a (see README)' }
    Write-Host "Hub outbound queue (messages waiting for the cloud): $n"
  }
}

switch ($Command) {
  'install' { Invoke-Install }
  'apply' { Require-EnvFile; Test-DockerReady; Get-Config 'reuse'; Add-MissingEnvValues; Start-Stack }
  'upgrade' { Invoke-Upgrade }
  'activate' {
    Require-EnvFile; Get-Config 'reuse'
    if (-not ($LicenseClinic -or $LicenseLaboratory -or $LicensePharmacy)) { Stop-Install 'Give -LicenseToken/-LicenseFile (or -Lab... / -Pharmacy...).' }
    Invoke-ActivationAll
    if ($script:ActivationPending) { exit 1 }
  }
  'backup' { Test-DockerReady; Invoke-Backup }
  'restore' { Invoke-Restore }
  'status' { Invoke-Status }
  'render' { Require-EnvFile; Get-Config 'reuse'; Add-MissingEnvValues; Write-HubBootstrap }
}
