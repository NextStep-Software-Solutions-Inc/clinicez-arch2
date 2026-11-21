# Handoff Report — Cryptographic Security, Multi-Tenancy Boundary, Deployment Configs & Migration Runbooks Review

## Review Summary

**Verdict**: **APPROVE**  
**Role**: Reviewer and Adversarial Critic (`reviewer_2`)  
**Scope**: Clinic File Storage S3/R2 Migration, Envelope Encryption, Multi-Tenancy Isolation, Deployment Manifests, and Idempotent Migration Runbooks.  
**Date**: 2026-10-21  

---

## 1. Observation

### 1.1 Cryptographic Envelope Encryption & Key Derivation
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/ClinicEncryptionService.cs`
  - **DEK Generation**: Line 42: `var dek = RandomNumberGenerator.GetBytes(32);` produces an independent, non-predictable 256-bit AES key per file.
  - **IV Generation**: Line 45: `var fileIv = RandomNumberGenerator.GetBytes(12);` produces an RFC 5116 standard 96-bit nonce per file.
  - **Payload Encryption**: Lines 51-54: `using var aesGcmFile = new AesGcm(dek, 16); aesGcmFile.Encrypt(fileIv, plaintextBytes, ciphertext, fileTag);` uses authenticated AES-256-GCM with a 128-bit authentication tag.
  - **Payload Hash**: Line 57: `var encryptedHash = Convert.ToHexString(SHA256.HashData(ciphertext)).ToLowerInvariant();` produces SHA-256 integrity digest of ciphertext.
  - **CMK Derivation**: Lines 184-191:
    ```csharp
    private static byte[] DeriveClinicMasterKey(byte[] masterSecret, string tenantId, Guid clinicId)
    {
        var salt = Encoding.UTF8.GetBytes(tenantId.Trim().ToLowerInvariant());
        var info = Encoding.UTF8.GetBytes($"{clinicId:N}:ClinicEz:ClinicEncryption:v1");

        // HKDF-SHA256 (RFC 5869)
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, salt, info);
    }
    ```
    Uses RFC 5869 HKDF-SHA256 with tenant salt (`tenantId.Trim().ToLowerInvariant()`) and clinic context info (`{clinicId:N}:ClinicEz:ClinicEncryption:v1`).
  - **Key Wrapping**: Lines 60-69: `using var aesGcmCmk = new AesGcm(cmk, 16); aesGcmCmk.Encrypt(wrapIv, dek, wrappedDekCiphertext, wrapTag);` wraps DEK using CMK with separate random 12-byte IV and 16-byte tag.
  - **Key Zeroization**: Lines 72-73, 131, 177: `CryptographicOperations.ZeroMemory(dek)` and `CryptographicOperations.ZeroMemory(cmk)` clear raw cryptographic key material from memory.
  - **Key Ring & Rotation**: `ClinicEncryptionKeyRing.cs` lines 47-73 enforces `MinSecretLength = 32`, reads `ClinicEncryption:MasterSecret` and `ClinicEncryption:PreviousMasterSecrets`, associates SHA-256 truncated key IDs (`Kid`), and enables transparent key rotation.

### 1.2 Zero-Knowledge S3 Storage & Absence of PHI
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/S3ClinicStorageAdapter.cs`
  - Lines 124-136:
    ```csharp
    var normalizedKey = NormalizeKey(storageKey);
    var request = new PutObjectRequest
    {
        BucketName = _bucketName,
        Key = normalizedKey,
        InputStream = ciphertextStream,
        ContentType = "application/octet-stream",
        AutoCloseStream = false
    };

    request.Metadata.Add("x-amz-meta-encryption", "AES-256-GCM");
    request.Metadata.Add("x-amz-meta-key-scheme", "cmk-v1");
    ```
  - Object ContentType is explicitly and strictly set to generic `"application/octet-stream"`.
  - Object custom metadata headers contain strictly `x-amz-meta-encryption: AES-256-GCM` and `x-amz-meta-key-scheme: cmk-v1`.
  - No patient identifiers, clinician names, diagnostic details, medical record titles, original file names (e.g. `cxr.pdf`), or PHI exist in S3 keys or headers. All clinical metadata is stored exclusively in PostgreSQL in `ClinicRecordAttachment` and `ClinicLabResult`.

### 1.3 Strict Multi-Tenancy Folder Partitioning
- **Storage Path Pattern Audits**:
  - `UploadAndEncryptRecordAttachmentCommand.cs:62`:
    `var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";`
  - `IntakePatientSharedFileCommand.cs:65`:
    `var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";`
  - `AppointmentBookedHandler.cs:282`:
    `var storageKey = $"tenants/{tenantId}/clinics/{message.ClinicId}/records/{file.FileId}.cez";`
  - `PatientRecordSharedHandler.cs:121`:
    `var storageKey = $"tenants/{clinic.TenantId}/clinics/{clinic.ClinicId}/records/{message.FileId}.cez";`
  - `LabResultFileStore.cs:23`:
    `var storageKey = $"tenants/{result.TenantId}/clinics/{result.ClinicId}/lab-results/{result.Id:N}.cez";`
  - Every storage path strictly complies with `tenants/{tenantId}/clinics/{clinicId}/records/{id}.cez` or `tenants/{tenantId}/clinics/{clinicId}/lab-results/{id}.cez`.

### 1.4 Cryptographic Multi-Tenancy Boundary Enforcement
- In `ClinicEncryptionService.cs:150-182`:
  - `UnwrapDek` reconstructs `cmk = DeriveClinicMasterKey(masterSecret, tenantId, clinicId);`
  - `aesGcmCmk.Decrypt(wrapIv, wrappedDekCiphertext, wrapTag, dek);`
  - If `tenantId` or `clinicId` does not match the exact values used during encryption, HKDF produces a completely different CMK. AES-GCM tag verification fails and throws `CryptographicException`.
- Verified in `ClinicStorageEncryptionIntegrationTests.cs:111-146`:
  - `actWrongTenant = () => encryptionService.DecryptAsync(..., tenantB, clinicA);` -> throws `CryptographicException`.
  - `actWrongClinic = () => encryptionService.DecryptAsync(..., tenantA, clinicB);` -> throws `CryptographicException`.

### 1.5 Deployment Configurations & Migration Runbooks
- **Docker Compose**: `deploy/clinic-api/docker-compose.yml`
  - Lines 65-87 map `Storage__Provider`, `Storage__BasePath`, `Storage__EnableLocalFallback`, `S3__*`, `R2__*`, `ClinicEncryption__MasterSecret`, and `ClinicEncryption__PreviousMasterSecrets__*`.
  - Volume `clinic-records:/app/storage/records` is retained alongside `clinic-api-keys:/app/keys` to support zero-downtime fallback during transition.
- **CI/CD Workflow**: `.github/workflows/deploy-clinic-api-dev.yml`
  - Lines 98-108 bind storage and encryption secrets.
  - Lines 122-136 execute strict pre-deployment validation: `require_min_length CLINIC_ENCRYPTION_MASTER_SECRET 32` and abort if `CLINIC_ENCRYPTION_MASTER_SECRET` is unset or too short.
- **Migration Scripts**:
  - `scripts/migrate-clinic-storage-to-r2.sh`: Lines 60-65 use `aws --endpoint-url "$ENDPOINT_URL" s3api head-object` to skip already-migrated keys idempotently; uploads with `--content-type "application/octet-stream"` and `--metadata "encryption=AES-256-GCM,key-scheme=cmk-v1"`; supports `DRY_RUN=true`.
  - `scripts/migrate-clinic-storage-to-r2.ps1`: Lines 77-89 perform identical `s3api head-object` idempotent checks and upload commands with PowerShell `-DryRun` switch.
- **Architecture & Deployment Documentation**:
  - `docs/architecture/data-ownership.md:82`: Accurately documents envelope encryption, per-file DEKs, HKDF-SHA256 CMK derivation, S3-compatible storage, and strict partitioning.
  - `docs/deployment-configuration.md:47-49, 81-86, 118`: Details key configuration, rotation runbook, and migration prerequisites.

### 1.6 Independent Test & Build Execution
- **Command 1**: `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ClinicStorageEncryptionIntegrationTests|FullyQualifiedName~ClinicEncryptionServiceTests"`
  - **Result**: Passed! Failed: 0, Passed: 18, Skipped: 0, Total: 18, Duration: 1 s.
- **Command 2**: `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Storage|FullyQualifiedName~Encryption"`
  - **Result**: Passed! Failed: 0, Passed: 35, Skipped: 0, Total: 35, Duration: 2 s.
- **Command 3**: `dotnet build services/clinic-api/ClinicEz.Clinic.Infrastructure/ClinicEz.Clinic.Infrastructure.csproj`
  - **Result**: Build succeeded. 0 Warning(s), 0 Error(s). Time Elapsed: 00:00:02.39.

---

## 2. Logic Chain

1. **Envelope Encryption Rigor (Observation 1.1)**:
   - Each file encrypts with a distinct 256-bit DEK generated via CSPRNG (`RandomNumberGenerator.GetBytes(32)`).
   - The file payload is encrypted with AES-256-GCM using a unique 12-byte IV and verified with a 16-byte tag.
   - The DEK is wrapped under a Clinic Master Key (CMK) derived via RFC 5869 HKDF-SHA256 from the master secret, tenant salt, and clinic info.
   - Therefore, knowledge of the ciphertext alone or a compromised DEK for one file does not compromise any other file or the CMK.

2. **Multi-Tenancy & Zero-Knowledge Boundary (Observations 1.2, 1.3, 1.4)**:
   - S3 objects are named with pure UUID/GUID identifiers and `.cez` extension under `tenants/{tenantId}/clinics/{clinicId}/...`.
   - The S3 client sets `ContentType = "application/octet-stream"` and metadata exclusively to algorithm tags (`x-amz-meta-encryption: AES-256-GCM`, `x-amz-meta-key-scheme: cmk-v1`).
   - S3 buckets, administrators, or cloud infrastructure providers cannot view plaintext patient data or metadata.
   - Because HKDF uses tenantId as salt and clinicId in context info, cross-tenant or cross-clinic key derivation produces distinct keys. Any cross-tenant decryption attempt causes AES-GCM tag verification failure and throws `CryptographicException`. Multi-tenant cryptographic isolation is enforced mathematically.

3. **Fallback & Deployment Continuity (Observations 1.5, 1.6)**:
   - `FallbackClinicStorageService` routes all writes to primary storage (S3/R2) while falling back to local disk on `FileNotFoundException` during the migration period.
   - Both migration scripts (`.sh` and `.ps1`) query `s3api head-object` prior to uploading, ensuring idempotent, resume-capable execution without duplicate uploads or local data deletion.
   - Pre-deployment validation checks guarantee that master secrets meet the minimum 32-character requirement before containers boot.

4. **Absence of Integrity Violations**:
   - No hardcoded test responses, facades, mock shortcuts in production code, or fabricated artifacts were detected.

---

## 3. Findings & Adversarial Challenges

### 3.1 Minor Finding 1: Key Zeroization in `EncryptAsync` Exception Path
- **Where**: `ClinicEncryptionService.cs:42-74`
- **What**: In `EncryptAsync`, `CryptographicOperations.ZeroMemory(dek)` and `CryptographicOperations.ZeroMemory(cmk)` are called sequentially at lines 72-73 without an enclosing `try...finally` block.
- **Why**: If an unexpected exception (e.g., `OutOfMemoryException`) occurs between line 42 and line 72, `dek` and `cmk` memory zeroization is bypassed, leaving raw keys in GC memory until collected.
- **Suggestion**: Wrap DEK encryption and key wrapping in a `try...finally` block to guarantee `ZeroMemory(dek)` and `ZeroMemory(cmk)` execution on any failure, mirroring the existing pattern in `DecryptAsync` and `UnwrapDek`.

### 3.2 Minor Finding 2: Bash Migration Script Trailing Slash Normalization
- **Where**: `scripts/migrate-clinic-storage-to-r2.sh:56`
- **What**: Line 56 calculates `rel_key="${file#$STORAGE_DIR/}"`. If the operator invokes the script with a trailing slash in `STORAGE_DIR` (e.g. `STORAGE_DIR=/opt/records/`), `$STORAGE_DIR/` expands with a double slash (`/opt/records//`), causing prefix matching to fail and prefixing unwanted path segments into `rel_key`.
- **Why**: PowerShell script `migrate-clinic-storage-to-r2.ps1` explicitly handles this via `TrimEnd('\', '/')`, but the bash script lacks trailing slash normalization.
- **Suggestion**: Add `STORAGE_DIR="${STORAGE_DIR%/}"` immediately after line 7 in `scripts/migrate-clinic-storage-to-r2.sh`.

### 3.3 Minor Finding 3: Defensive Path Traversal Guard in `LocalClinicStorageService`
- **Where**: `LocalClinicStorageService.cs:39, 63, 86, 105, 125, 145`
- **What**: `LocalClinicStorageService` normalizes directory separators and trims leading slashes, but does not explicitly verify that `Path.GetFullPath(fullPath).StartsWith(_storageRoot)`.
- **Why**: Although current callers construct keys from Guids, defensive hardening against path traversal (`..` sequences) on the local filesystem interface prevents traversal if external keys are ever supplied.
- **Suggestion**: Add `if (!Path.GetFullPath(fullPath).StartsWith(_storageRoot, StringComparison.OrdinalIgnoreCase)) throw new UnauthorizedAccessException("Path traversal detected.");`.

---

## 4. Caveats

1. **Large Binary Streaming**: AES-256-GCM requires buffering the full payload to calculate and verify the 16-byte authentication tag. Uploading attachments substantially larger than 50 MB in memory-constrained containers (limit 450 MB) should be gated by pre-flight file size validation.
2. **Key Rotation Re-encryption**: As documented in `docs/deployment-configuration.md:118`, key rotation currently supports reading retired secrets via `ClinicEncryption:PreviousMasterSecrets`, but background re-encryption of legacy files under the newest secret is not yet implemented.

---

## 5. Conclusion

The Clinic File Storage migration to S3/Cloudflare R2, cryptographic envelope encryption pipeline (`ClinicEncryptionService`), key ring management (`ClinicEncryptionKeyRing`), multi-tenancy isolation, deployment manifests (`docker-compose.yml`, `deploy-clinic-api-dev.yml`), and migration runbooks satisfy all security, architectural, and functional requirements.

**Explicit Verdict**: **APPROVE**

---

## 6. Verification Method

To independently verify this review:

1. **Compile Infrastructure Layer**:
   ```powershell
   dotnet build services/clinic-api/ClinicEz.Clinic.Infrastructure/ClinicEz.Clinic.Infrastructure.csproj
   ```
   *Expected*: 0 Errors, 0 Warnings.

2. **Execute Cryptographic & Integration Test Suite**:
   ```powershell
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ClinicStorageEncryptionIntegrationTests|FullyQualifiedName~ClinicEncryptionServiceTests"
   ```
   *Expected*: 18/18 tests pass.

3. **Execute Complete Storage & Encryption Verification**:
   ```powershell
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Storage|FullyQualifiedName~Encryption"
   ```
   *Expected*: 35/35 tests pass.

4. **Verify S3 Object Metadata & Zero PHI**:
   Inspect `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/S3ClinicStorageAdapter.cs:124-136` to verify generic ContentType (`application/octet-stream`) and metadata (`x-amz-meta-encryption: AES-256-GCM`, `x-amz-meta-key-scheme: cmk-v1`).
