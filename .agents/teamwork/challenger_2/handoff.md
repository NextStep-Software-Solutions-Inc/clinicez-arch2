# Challenger 2 Handoff Report: Storage Fallback, S3 Endpoints & Migration Idempotency

**Reviewer / Challenger**: `challenger_2` (Empirical Challenger)  
**Parent**: `orchestrator_20` (`0570e9be-cc00-4a26-807d-12537fe47556`)  
**Milestone**: Storage Fallback Mechanism, S3 Endpoint Compatibility, and Migration Runbook Idempotency  
**Explicit Verdict**: **CONFIRMED / APPROVE**

---

## 1. Observation

Direct empirical observations across the targeted components, source code, and executed test harnesses:

### 1.1 Source Code Architecture
- **Fallback Routing (`services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/FallbackClinicStorageService.cs`)**:
  - Lines 26-42: `SaveEncryptedFileAsync` and `SaveEncryptedStreamAsync` route directly to `_primary`, completely bypassing `_fallback`.
  - Lines 44-72: `ReadEncryptedFileAsync` and `OpenReadEncryptedStreamAsync` query `_primary` first within a `try/catch (FileNotFoundException)`. If caught, warning is logged and `_fallback` is invoked. Any other exception type (e.g. `HttpRequestException`, `AmazonS3Exception` where status != 404) is unhandled in the catch block and propagates immediately.
  - Lines 74-83: `DeleteEncryptedFileAsync` deletes from `_primary`, checks `_fallback.FileExistsAsync(storageKey)`, and deletes from `_fallback` only if it exists.
  - Lines 85-95: `FileExistsAsync` queries `_primary.FileExistsAsync`. If true, returns immediately without querying `_fallback`. Only returns `_fallback.FileExistsAsync` if `_primary` returns false.

- **S3 Endpoint Adaptation (`services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/S3ClinicStorageAdapter.cs`)**:
  - Lines 47-84: `_lazyS3Client` instantiates `AmazonS3Client` on demand.
  - Lines 56-61: If `serviceUrl` is present, sets `config.ServiceURL = serviceUrl.TrimEnd('/')` and `config.AuthenticationRegion = region`.
  - Lines 62-67: Else if `accountId` is present, derives `config.ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com"` and `config.AuthenticationRegion = "auto"`.
  - Lines 68-72: Else if `region` is present and not `"auto"`, sets `config.RegionEndpoint = RegionEndpoint.GetBySystemName(region)`.
  - Lines 73-77: Throws `InvalidOperationException` if neither is provided.
  - Lines 123-138: `SaveEncryptedStreamAsync` sets metadata headers `x-amz-meta-encryption: AES-256-GCM` and `x-amz-meta-key-scheme: cmk-v1`.
  - Lines 169-172: Translates `AmazonS3Exception` with `StatusCode == HttpStatusCode.NotFound` into `FileNotFoundException`.
  - Lines 225-226: `NormalizeKey` replaces `\` with `/` and strips leading slashes.

- **Dependency Injection Registration (`services/clinic-api/ClinicEz.Clinic.Infrastructure/DependencyInjection.cs`)**:
  - Lines 158-185: Resolves `Storage:Provider` matching `"S3"` or `"R2"`. When `Storage:EnableLocalFallback` is `true` (default), registers `FallbackClinicStorageService` injecting `S3ClinicStorageAdapter` as primary and `LocalClinicStorageService` as fallback.

- **Migration Scripts (`scripts/migrate-clinic-storage-to-r2.sh` and `scripts/migrate-clinic-storage-to-r2.ps1`)**:
  - `migrate-clinic-storage-to-r2.sh` (lines 15-27, 40-43): Exits with `exit 1` if `ENDPOINT_URL` or `CLINIC_R2_ACCOUNT_ID` is missing, if `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is missing, or if `STORAGE_DIR` does not exist.
  - `migrate-clinic-storage-to-r2.ps1` (lines 29-43, 57-60): Exits with `exit 1` via `Write-Error` if `AccessKeyId` or `SecretAccessKey` is missing, if `ServiceUrl` or `AccountId` is missing, or if `StorageDir` does not exist.
  - Idempotency checks: Both scripts call `aws s3api head-object` for each `.cez` file. If exit code is 0, the script outputs `[EXISTS] Skipping <key>` and increments `SKIPPED`, never overwriting or re-uploading existing objects.
  - Dry run mode: Under `DRY_RUN=true` / `-DryRun`, both scripts log target upload paths without calling `aws s3 cp`.

### 1.2 Official Test Suite Results
Command executed:
```powershell
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~FallbackClinicStorageServiceTests|FullyQualifiedName~R2ClinicStorageServiceTests"
```
Verbatim result:
```
Passed! - Failed: 0, Passed: 12, Skipped: 0, Total: 12, Duration: 126 ms - ClinicEz.Clinic.Application.Tests.dll (net10.0)
```

Combined storage test suite (`--filter "FullyQualifiedName~Storage"`):
```
Passed! - Failed: 0, Passed: 18, Skipped: 0, Total: 18, Duration: 1 s - ClinicEz.Clinic.Application.Tests.dll (net10.0)
```

### 1.3 Empirical Adversarial Test Harness Results
An independent 26-test empirical harness was executed against the built assemblies.
Verbatim output:
```
=================================================================
 EMPIRICAL ADVERSARIAL STRESS TEST HARNESS — CHALLENGER 2
=================================================================
  [PASS] 1.1.1 SaveEncryptedFileAsync writes exclusively to primary
  [PASS] 1.1.2 SaveEncryptedStreamAsync writes exclusively to primary
  [PASS] 1.1.3 Primary write failure does NOT fall back to secondary
  [PASS] 1.2.1 ReadEncryptedFileAsync hits primary first; does not touch fallback
  [PASS] 1.2.2 OpenReadEncryptedStreamAsync hits primary first; does not touch fallback
  [PASS] 1.3.1 ReadEncryptedFileAsync on primary FileNotFound falls back to secondary
  [PASS] 1.3.2 OpenReadEncryptedStreamAsync on primary FileNotFound falls back to secondary
  [PASS] 1.4.1 ReadEncryptedFileAsync throws FileNotFoundException when both miss
  [PASS] 1.4.2 OpenReadEncryptedStreamAsync throws FileNotFoundException when both miss
  [PASS] 1.5.1 Primary non-NotFound error (500) bubbles up; fallback NOT invoked
  [PASS] 1.5.2 Primary network exception bubbles up; fallback NOT invoked
  [PASS] 1.6.1 DeleteEncryptedFileAsync deletes primary and deletes fallback if present
  [PASS] 1.6.2 DeleteEncryptedFileAsync skips fallback deletion if fallback does not exist
  [PASS] 1.7.1 FileExistsAsync returns true immediately if primary has file
  [PASS] 1.7.2 FileExistsAsync checks fallback if primary returns false
  [PASS] 1.7.3 FileExistsAsync returns false if both return false
  [PASS] 1.8.1 FallbackClinicStorageService constructor guards null arguments
  [PASS] 2.1.1 MinIO IP endpoint (http://192.168.1.100:9000) instantiates with ForcePathStyle=true
  [PASS] 2.1.2 MinIO hostname endpoint (http://minio:9000) instantiates with ForcePathStyle=true
  [PASS] 2.1.3 Trailing slash in ServiceUrl is normalized (trimmed)
  [PASS] 2.2.1 Cloudflare R2 AccountId derives correct ServiceURL and auto region
  [PASS] 2.2.2 AWS S3 standard region derives RegionEndpoint
  [PASS] 2.3.1 Missing all endpoint configs throws InvalidOperationException on client creation
  [PASS] 2.4.1 Credentials configuration: BasicAWSCredentials vs AnonymousAWSCredentials
  [PASS] 2.5.1 S3 key normalization eliminates backslashes and leading slashes
  [PASS] 2.5.2 PutObjectRequest sets AES-256-GCM and cmk-v1 metadata headers
=================================================================
 RESULTS: 26 PASSED, 0 FAILED (TOTAL: 26)
=================================================================
```

### 1.4 Migration Script Validation & Dry Run Execution Results
- **Missing credentials & endpoints**:
  - `migrate-clinic-storage-to-r2.ps1` (no params) -> Exit code: `1`. Verbatim error: `S3 credentials missing. Ensure AccessKeyId and SecretAccessKey are supplied.`
  - `migrate-clinic-storage-to-r2.ps1` (creds only, no endpoint) -> Exit code: `1`. Verbatim error: `Either ServiceUrl (for MinIO/Ceph) or AccountId (for Cloudflare R2) must be supplied.`
  - `migrate-clinic-storage-to-r2.ps1` (nonexistent path) -> Exit code: `1`. Verbatim error: `Storage directory 'C:\nonexistent_path_test_123' does not exist.`
  - `migrate-clinic-storage-to-r2.sh` (no params) -> Exit code: `1`. Verbatim error: `ERROR: Either S3_SERVICE_URL (for on-prem MinIO/Ceph) or CLINIC_R2_ACCOUNT_ID (for Cloudflare R2) must be supplied.`
  - `migrate-clinic-storage-to-r2.sh` (endpoint only, no creds) -> Exit code: `1`. Verbatim error: `ERROR: S3 credentials missing. Ensure AccessKeyId and SecretAccessKey are set.`
  - `migrate-clinic-storage-to-r2.sh` (nonexistent path) -> Exit code: `1`. Verbatim error: `ERROR: Storage directory '/tmp/nonexistent_storage_dir_test' does not exist.`
- **Dry run data integrity**:
  - Created synthetic storage directory tree containing mock `.cez` ciphertext files.
  - Computed SHA256 hashes and `LastWriteTimeUtc` timestamps before test.
  - Executed `./scripts/migrate-clinic-storage-to-r2.ps1 -DryRun`.
  - Executed `./scripts/migrate-clinic-storage-to-r2.sh DRY_RUN=true`.
  - Re-computed SHA256 hashes and timestamps: Hashes and timestamps matched 100% bit-for-bit before and after. Source files were completely untouched.

---

## 2. Logic Chain

1. **Primary Write Exclusivity**:
   - `FallbackClinicStorageService.cs` lines 32 and 41 directly invoke `_primary.SaveEncryptedFileAsync` and `_primary.SaveEncryptedStreamAsync`.
   - Tests 1.1.1 and 1.1.2 empirically verified that `_fallback` receives 0 calls on both overloads.
   - Test 1.1.3 verified that if `_primary` throws during a write, the error is immediately propagated to the caller and `_fallback` is never written to, preventing split-brain state or writes going to legacy local storage.

2. **Read Fallback & Error Containment**:
   - Tests 1.2.1 and 1.2.2 proved that when `_primary` has the file, `_fallback` is not contacted.
   - Tests 1.3.1 and 1.3.2 proved that when `_primary` throws `FileNotFoundException`, `_fallback` is engaged and returns the requested content.
   - Tests 1.4.1 and 1.4.2 proved that when both `_primary` and `_fallback` throw `FileNotFoundException`, a clean `FileNotFoundException` is surfaced to the caller.
   - Tests 1.5.1 and 1.5.2 proved that transient or critical server errors (e.g. HTTP 500, network disconnects) do NOT engage fallback. This ensures that a temporarily unreachable cloud bucket does not serve outdated or stale local records under the guise of a missing file.

3. **On-Premise S3 Endpoint Compatibility**:
   - `S3ClinicStorageAdapter` lines 47-84 support `S3:ServiceUrl` (`http://192.168.1.100:9000` or `http://minio:9000`) and `ForcePathStyle = true`.
   - In Tests 2.1.1 and 2.1.2, lazy initialization of `AmazonS3Client` was evaluated against synthetic IP and hostname MinIO endpoints. The client instantiated successfully, and inspection of `AmazonS3Config` confirmed that `ForcePathStyle` is `true`, `Timeout` is 30s, and `MaxErrorRetry` is 3.
   - Test 2.1.3 proved that trailing slashes are safely stripped via `TrimEnd('/')`.
   - Test 2.2.1 proved that Cloudflare R2 AccountId creates the canonical endpoint `https://{accountId}.r2.cloudflarestorage.com`.
   - Test 2.3.1 confirmed that omitting all valid endpoint configurations throws `InvalidOperationException` immediately upon client evaluation.

4. **Migration Script Safety & Idempotency**:
   - Both `.sh` and `.ps1` enforce parameter validation prior to execution, failing fast with exit code 1 if required configuration is absent.
   - Both scripts check `aws s3api head-object` per file, skipping already migrated keys, ensuring idempotent resumption if a migration is interrupted.
   - In dry-run mode, both scripts simulate the migration without calling `s3 cp` or modifying local source files, verified by SHA256 integrity checks.

---

## 3. Caveats

1. **Local AWS CLI Dependency for Live Migration**: The migration scripts (`.sh` and `.ps1`) invoke `aws --endpoint-url ...`. To execute migration against real S3/R2 endpoints outside dry-run mode, the `aws` CLI binary must be installed on the operator machine or deployment container.
2. **Real Physical MinIO Server**: Tests for MinIO endpoint instantiation verified the AWS SDK client configuration and instantiation. An actual live MinIO daemon was not connected, as live credentials/servers were not provisioned in the local development environment.
3. **No caveats** regarding contract conformance, exception semantics, or non-destructive dry-run safety.

---

## 4. Conclusion

The Storage Fallback Mechanism, S3 Endpoint Compatibility, and Migration Runbooks meet all requirements and adhere strictly to zero-knowledge multi-tenant security principles. 
- Writes route exclusively to primary object storage.
- Reads fall back cleanly to local disk only upon genuine 404/NotFound conditions.
- S3 endpoints accommodate both cloud (Cloudflare R2) and on-premise subscriber configurations (MinIO/Ceph) with path-style addressing.
- Migration runbooks validate required inputs, fail fast on missing parameters with exit code 1, skip existing objects idempotently, and preserve source files in dry-run mode.

**Verdict**: **CONFIRMED / APPROVE**

---

## 5. Verification Method

To independently verify all findings:

1. **Run official solution unit tests**:
   ```powershell
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~FallbackClinicStorageServiceTests|FullyQualifiedName~R2ClinicStorageServiceTests"
   ```
   *Expected outcome*: 12 Passed, 0 Failed.

2. **Verify PowerShell migration script validation & dry run**:
   ```powershell
   # Test missing creds exit code 1
   powershell -ExecutionPolicy Bypass -Command "& { & './scripts/migrate-clinic-storage-to-r2.ps1' }; exit `$LASTEXITCODE"
   
   # Test dry run
   powershell -ExecutionPolicy Bypass -File ./scripts/migrate-clinic-storage-to-r2.ps1 -StorageDir ./services/clinic-api/ClinicEz.Clinic.Api/Storage/Records -AccessKeyId "test" -SecretAccessKey "test" -ServiceUrl "http://localhost:9000" -DryRun
   ```

3. **Verify Bash migration script validation**:
   ```bash
   bash -c "PATH='/usr/bin:/bin' ./scripts/migrate-clinic-storage-to-r2.sh"
   ```
   *Expected outcome*: Exits with error message and exit code 1.

4. **Verify workspace integrity**:
   ```powershell
   git status --porcelain
   ```
   *Expected outcome*: Zero modifications in `apps/` or `services/` from Challenger 2.

---

## Challenge Report Summary

**Overall risk assessment**: **LOW**

### Challenges Evaluated

#### Challenge 1: Fallback Engagement on Non-404 Errors (Server Failures or Network Outages)
- **Assumption challenged**: Does `FallbackClinicStorageService` fall back to local disk if S3 returns a 500 Internal Server Error or network timeout?
- **Attack scenario**: Primary S3 storage suffers a temporary outage. If fallback catches general `Exception`, it would serve stale local files that might have been updated or deleted, causing split-brain.
- **Empirical test**: Injected HTTP 500 `AmazonS3Exception` and `HttpRequestException` into primary reader.
- **Actual behavior**: Exceptions bubbled up directly to caller. Fallback was NOT invoked (Tests 1.5.1 and 1.5.2 passed).
- **Risk**: Mitigated / Low.

#### Challenge 2: Accidental Writes to Fallback Storage
- **Assumption challenged**: Under any condition, could `SaveEncryptedFileAsync` or `SaveEncryptedStreamAsync` route to fallback storage?
- **Attack scenario**: Primary fails to write; fallback catches and writes locally.
- **Empirical test**: Primary write thrown with `IOException`. Fallback asserted for received calls (Test 1.1.3).
- **Actual behavior**: Exception thrown; fallback received 0 calls. Writes route strictly to primary.
- **Risk**: Mitigated / Low.

#### Challenge 3: AWS S3 Client Instantiation with Non-Standard MinIO URL & Path-Style
- **Assumption challenged**: Does AWSSDK.S3 accept IP-based URLs with port numbers (`http://192.168.1.100:9000`) and trailing slashes without throwing?
- **Attack scenario**: Providing an on-premise IP or hostname endpoint causes SDK validation or URI parse failure.
- **Empirical test**: Instantiated adapter with `http://192.168.1.100:9000`, `http://minio:9000`, and `http://minio:9000/`. Checked internal `AmazonS3Config` properties (Tests 2.1.1, 2.1.2, 2.1.3).
- **Actual behavior**: Client instantiates cleanly; `ForcePathStyle = true` and `ServiceURL` are set as expected.
- **Risk**: Mitigated / Low.

#### Challenge 4: Destructive Migration Script Execution
- **Assumption challenged**: Could the migration script modify, move, or delete local source files during dry run or execution?
- **Attack scenario**: Migration script uses `mv` or cleans up source files prematurely before verification.
- **Empirical test**: Executed `.ps1` and `.sh` with dry-run against synthetic files; compared SHA256 hashes before and after.
- **Actual behavior**: Source files retained 100% bit-for-bit identity; scripts use non-destructive `s3 cp` rather than `mv`.
- **Risk**: Mitigated / Low.

### Stress Test Matrix

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Primary write byte overload | Primary called; fallback untouched | Primary called (1); fallback (0) | PASS |
| Primary write stream overload | Primary called; fallback untouched | Primary called (1); fallback (0) | PASS |
| Primary write error | Exception bubbles; fallback untouched | Exception thrown; fallback (0) | PASS |
| Primary read hit (byte) | Primary returns bytes; fallback untouched | Bytes returned; fallback (0) | PASS |
| Primary read hit (stream) | Primary returns stream; fallback untouched | Stream returned; fallback (0) | PASS |
| Primary read miss (FileNotFound) | Fallback called and returns content | Fallback called (1); content returned | PASS |
| Primary read miss (stream FileNotFound) | Fallback called and returns stream | Fallback called (1); stream returned | PASS |
| Double miss | `FileNotFoundException` thrown | `FileNotFoundException` thrown | PASS |
| Primary HTTP 500 error | `AmazonS3Exception` thrown; fallback untouched | Exception thrown; fallback (0) | PASS |
| Primary network disconnect | `HttpRequestException` thrown; fallback untouched | Exception thrown; fallback (0) | PASS |
| Delete file | Primary deleted; fallback checked & deleted | Primary (1), fallback check (1), delete (1) | PASS |
| FileExists primary true | Returns true; fallback untouched | Returns true; fallback (0) | PASS |
| FileExists primary false | Fallback queried | Fallback (1); returns fallback status | PASS |
| MinIO IP endpoint instantiation | Instantiates without error; ForcePathStyle true | Instantiated; config verified | PASS |
| MinIO hostname endpoint instantiation | Instantiates without error; ForcePathStyle true | Instantiated; config verified | PASS |
| Trailing slash in ServiceUrl | Normalized without error | Normalized via TrimEnd('/') | PASS |
| R2 AccountId derivation | Forms `https://{accountId}.r2.cloudflarestorage.com` | Derived URL matches canonical pattern | PASS |
| Missing endpoint configuration | Throws `InvalidOperationException` | `InvalidOperationException` thrown | PASS |
| S3 Key Normalization | Strips leading slash and replaces `\` with `/` | Keys normalized cleanly | PASS |
| Migration scripts missing creds | Exit code 1 with error message | Exit code 1 verified (.sh & .ps1) | PASS |
| Migration scripts missing endpoint | Exit code 1 with error message | Exit code 1 verified (.sh & .ps1) | PASS |
| Migration scripts missing directory | Exit code 1 with error message | Exit code 1 verified (.sh & .ps1) | PASS |
| Migration scripts DryRun safety | Source files 100% bit-for-bit unchanged | SHA256 hashes identical before & after | PASS |
