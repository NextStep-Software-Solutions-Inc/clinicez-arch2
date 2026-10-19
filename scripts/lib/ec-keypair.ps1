# Shared implementation of scripts/generate-license-keys.ps1 and scripts/generate-signing-key.ps1 (dot-sourced by them).
#
# Generates an ECDSA P-256 key pair on Windows PowerShell 5.1 (.NET Framework, which has no ExportPkcs8PrivateKey) and on
# PowerShell 7 on Windows: CNG creates the key with a plaintext-export policy, the raw X / Y / D values are read from the
# ECCPrivateBlob and the DER structures are written by hand:
#   private key = SEC1 "EC PRIVATE KEY" (same as `openssl ecparam -name prime256v1 -genkey -noout`)
#   public key  = SubjectPublicKeyInfo "PUBLIC KEY" (same as `openssl ec -pubout`)
# Both are PEM-wrapped at 64 columns and then base64-encoded as a whole (single line: fits .env files and GitHub secrets).
# The pair is verified with a sign/verify round trip using the keys re-imported from the produced PEM text.
# Non-Windows PowerShell has no CNG: use the .sh scripts there.

function ConvertTo-EcPemText {
  param([byte[]]$Der, [string]$Label)
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
  # Returns @{ X; Y; D } (32 bytes each, big endian) of a fresh P-256 key.
  $cp = New-Object System.Security.Cryptography.CngKeyCreationParameters
  $cp.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::AllowPlaintextExport
  $cp.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Signing
  # [NullString]::Value, not $null: PowerShell would turn $null into "" and CNG would then PERSIST a key named "" in the user's key store.
  $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, [NullString]::Value, $cp)
  try { $blob = $key.Export([System.Security.Cryptography.CngKeyBlobFormat]::EccPrivateBlob) } finally { $key.Dispose() }
  # BCRYPT_ECCKEY_BLOB: magic (4) | cbKey (4) | X | Y | D
  if ([BitConverter]::ToInt32($blob, 4) -ne 32 -or $blob.Length -ne 104) { throw 'Unexpected ECC private blob layout.' }
  $x = New-Object byte[] 32; $y = New-Object byte[] 32; $d = New-Object byte[] 32
  [Array]::Copy($blob, 8, $x, 0, 32); [Array]::Copy($blob, 40, $y, 0, 32); [Array]::Copy($blob, 72, $d, 0, 32)
  return @{ X = $x; Y = $y; D = $d }
}

function ConvertTo-EcPrivatePem {
  param($Raw)
  $der = New-Object System.Collections.Generic.List[byte]
  $der.AddRange([byte[]](0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20))
  $der.AddRange([byte[]]$Raw.D)
  $der.AddRange([byte[]](0xA0, 0x0A, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0xA1, 0x44, 0x03, 0x42, 0x00, 0x04))
  $der.AddRange([byte[]]$Raw.X)
  $der.AddRange([byte[]]$Raw.Y)
  return (ConvertTo-EcPemText $der.ToArray() 'EC PRIVATE KEY')
}

function ConvertTo-EcPublicPem {
  param($Raw)
  $der = New-Object System.Collections.Generic.List[byte]
  $der.AddRange([byte[]](0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04))
  $der.AddRange([byte[]]$Raw.X)
  $der.AddRange([byte[]]$Raw.Y)
  return (ConvertTo-EcPemText $der.ToArray() 'PUBLIC KEY')
}

function Test-ByteRun {
  param([byte[]]$Data, [int]$Offset, [byte[]]$Expected)
  if ($Offset + $Expected.Length -gt $Data.Length) { return $false }
  for ($i = 0; $i -lt $Expected.Length; $i++) { if ($Data[$Offset + $i] -ne $Expected[$i]) { return $false } }
  return $true
}

function ConvertFrom-EcPem {
  # Parses our own two PEM shapes back into @{ X; Y; D } (D only for the private key). Throws on anything else.
  param([string]$Pem, [ValidateSet('private', 'public')][string]$Kind)
  if ($Pem -notmatch '-----BEGIN ([A-Z ]+)-----([^-]+)-----END \1-----') { throw 'Not a PEM block.' }
  $label = $Matches[1]
  $der = [Convert]::FromBase64String(($Matches[2] -replace '\s', ''))
  $x = New-Object byte[] 32; $y = New-Object byte[] 32
  if ($Kind -eq 'public') {
    $hdr = [byte[]](0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04)
    if ($label -ne 'PUBLIC KEY' -or $der.Length -ne 91 -or -not (Test-ByteRun $der 0 $hdr)) { throw 'Not an uncompressed P-256 public key (SubjectPublicKeyInfo).' }
    [Array]::Copy($der, 27, $x, 0, 32); [Array]::Copy($der, 59, $y, 0, 32)
    return @{ X = $x; Y = $y }
  }
  $pre = [byte[]](0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20)
  $mid = [byte[]](0xA0, 0x0A, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0xA1, 0x44, 0x03, 0x42, 0x00, 0x04)
  if ($label -ne 'EC PRIVATE KEY' -or $der.Length -ne 121 -or -not (Test-ByteRun $der 0 $pre) -or -not (Test-ByteRun $der 39 $mid)) {
    throw 'Not a P-256 SEC1 private key (EC PRIVATE KEY).'
  }
  $d = New-Object byte[] 32
  [Array]::Copy($der, 7, $d, 0, 32); [Array]::Copy($der, 57, $x, 0, 32); [Array]::Copy($der, 89, $y, 0, 32)
  return @{ X = $x; Y = $y; D = $d }
}

function ConvertTo-CngEcKey {
  param($Raw, [bool]$Private)
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  if ($Private) { $bw.Write([int]0x32534345) } else { $bw.Write([int]0x31534345) }   # 'ECS2' / 'ECS1' (ECDSA P-256)
  $bw.Write([int]32)
  $bw.Write([byte[]]$Raw.X); $bw.Write([byte[]]$Raw.Y)
  if ($Private) { $bw.Write([byte[]]$Raw.D) }
  $bw.Flush()
  $fmt = [System.Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob
  if ($Private) { $fmt = [System.Security.Cryptography.CngKeyBlobFormat]::EccPrivateBlob }
  return [System.Security.Cryptography.CngKey]::Import($ms.ToArray(), $fmt)
}

function Test-EcPairRoundTrip {
  # Signs random data with the private PEM and verifies it with the public PEM (and rejects other data).
  param([string]$PrivatePem, [string]$PublicPem)
  $privKey = ConvertTo-CngEcKey (ConvertFrom-EcPem $PrivatePem 'private') $true
  $pubKey = ConvertTo-CngEcKey (ConvertFrom-EcPem $PublicPem 'public') $false
  $data = New-Object byte[] 64; $other = New-Object byte[] 64
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($data); $rng.GetBytes($other); $rng.Dispose()
  $signer = New-Object System.Security.Cryptography.ECDsaCng($privKey)
  $signer.HashAlgorithm = [System.Security.Cryptography.CngAlgorithm]::Sha256
  $sig = $signer.SignData($data)
  $verifier = New-Object System.Security.Cryptography.ECDsaCng($pubKey)
  $verifier.HashAlgorithm = [System.Security.Cryptography.CngAlgorithm]::Sha256
  $ok = $verifier.VerifyData($data, $sig) -and -not $verifier.VerifyData($other, $sig)
  $signer.Dispose(); $verifier.Dispose(); $privKey.Dispose(); $pubKey.Dispose()
  return $ok
}

function New-EcKeyPairPem {
  # Returns @{ PrivatePem; PublicPem } after a self test.
  $raw = New-EcP256Raw
  $privPem = ConvertTo-EcPrivatePem $raw
  $pubPem = ConvertTo-EcPublicPem $raw
  if (-not (Test-EcPairRoundTrip $privPem $pubPem)) { throw 'Self test failed: the generated pair did not sign/verify.' }
  return @{ PrivatePem = $privPem; PublicPem = $pubPem }
}

function Protect-KeyFile {
  # Leaves only the current user with access (the Windows counterpart of chmod 600 / 700).
  param([string]$Path)
  $item = Get-Item -LiteralPath $Path -Force
  $acl = $item.GetAccessControl()
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($item.PSIsContainer) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  } else {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'Allow')
  }
  $acl.AddAccessRule($rule)
  $item.SetAccessControl($acl)
}

function Invoke-EcKeyPairTool {
  param(
    [string]$ScriptName, [string]$Title, [string]$PrivateName, [string]$PublicName, [string]$Prefix, [string]$Warning,
    [string]$Out = '', [switch]$Force
  )
  $pair = New-EcKeyPairPem
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $privB64 = [Convert]::ToBase64String($utf8.GetBytes($pair.PrivatePem))
  $pubB64 = [Convert]::ToBase64String($utf8.GetBytes($pair.PublicPem))
  if ($Out) {
    $fPriv = Join-Path $Out "$Prefix-private.pem"; $fPub = Join-Path $Out "$Prefix-public.pem"; $fEnv = Join-Path $Out "$Prefix-keys.env"
    foreach ($f in $fPriv, $fPub, $fEnv) { if ((Test-Path -LiteralPath $f) -and -not $Force) { throw "$f already exists (use -Force to overwrite)." } }
    if (-not (Test-Path -LiteralPath $Out)) { [void](New-Item -ItemType Directory -Path $Out); Protect-KeyFile $Out }
    [System.IO.File]::WriteAllText($fPriv, $pair.PrivatePem, $utf8)
    [System.IO.File]::WriteAllText($fPub, $pair.PublicPem, $utf8)
    [System.IO.File]::WriteAllText($fEnv, "$PrivateName=$privB64`n$PublicName=$pubB64`n", $utf8)
    foreach ($f in $fPriv, $fPub, $fEnv) { Protect-KeyFile $f }
    Write-Host "Wrote $fPriv, $fPub and $fEnv (current user only)."
  } else {
    Write-Output "$PrivateName=$privB64"
    Write-Output "$PublicName=$pubB64"
  }
  Write-Warning $Warning
  Write-Warning 'Never commit it, never paste it into tickets or chat; the public key is not secret.'
}
