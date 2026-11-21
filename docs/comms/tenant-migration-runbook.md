# Tenant Communication Migration Runbook & CLI Reference

## 1. Overview & Operational Purpose

The `ClinicEz.Comms.MigrationTool` is a high-assurance command-line utility for moving tenant communication data bidirectionally between **Cloud Multi-Tenant Shared Cells** and **On-Premise Edge Cells**.

### 1.1 Core Invariants
1. **Zero Data Loss**: Every conversation, message, triage request, disposition, attachment, and eligibility grant is migrated with complete relational integrity.
2. **Cryptographic Provenance**: Every exported bundle is packaged into an encrypted container (`.clinicez-comms-bundle`) signed with the source cell's ECDSA P-256 private key and verified prior to import.
3. **Zero ID Re-Mapping**: Primary keys (`Guid`), sequence numbers (`Seq`), and cryptographic hashes (`HashSha256`) are strictly preserved across migration, preventing broken links in client mobile/web offline caches.
4. **Controlled Write-Pause**: Writes are paused during migration (`HTTP 423 Locked`) while transactional outboxes drain to achieve zero mid-flight message loss.
5. **Atomic Rollback**: If signature verification, checksum validation, or database ingestion fails, the target database rolls back completely with zero orphaned records.

---

## 2. Cryptographic Container Specification (`.clinicez-comms-bundle`)

The migration package is a structured ZIP archive containing encrypted datasets and detached digital signatures:

```
bundle.clinicez-comms-bundle
├── manifest.json              # Canonical JSON manifest (metadata, Merkle root, key envelopes)
├── signature.sig              # Detached ECDSA P-256 signature of manifest.json
├── data/
│   ├── conversations.json.enc # AES-256-GCM encrypted conversation table
│   ├── messages.json.enc      # AES-256-GCM encrypted messages table
│   ├── triage.json.enc        # AES-256-GCM encrypted triage requests & notes
│   ├── attachments.json.enc   # AES-256-GCM encrypted attachment metadata
│   └── grants.json.enc        # AES-256-GCM encrypted eligibility grants
└── attachments/
    ├── {fileKey_1}.enc        # AES-256-GCM re-encrypted binary attachment
    └── {fileKey_2}.enc        # AES-256-GCM re-encrypted binary attachment
```

### 2.1 The Two-Tier Key Architecture ($K_{\text{bundle}}$)
To prevent sharing master database or disk encryption keys across cells:
1. At export, the tool generates an ephemeral 256-bit AES-GCM bundle session key ($K_{\text{bundle}}$).
2. Data rows and attachments are encrypted under $K_{\text{bundle}}$.
3. $K_{\text{bundle}}$ is encrypted using the provided bundle passphrase (via PBKDF2 with 100,000 iterations) or target cell public key.
4. At import, the target decrypts $K_{\text{bundle}}$, decrypts records, and re-encrypts attachments using the target cell's local master key.

---

## 3. CLI Command Reference

### 3.1 Syntax
```powershell
ClinicEz.Comms.MigrationTool <command> [options]
```

### 3.2 Supported Commands
| Command | Description |
|---|---|
| `export` | Extracts tenant communication data, drains outbox, and generates a signed `.clinicez-comms-bundle`. |
| `import` | Verifies cryptographic signature and Merkle checksums, and ingests bundle atomically into the target database. |
| `verify` | Validates bundle integrity, ECDSA signature, and Merkle root without mutating the database. |
| `inspect` | Prints high-level manifest metadata (tenant ID, row counts, export timestamp, schema version). |

### 3.3 Command-Line Options
| Option | Short | Description |
|---|---|---|
| `--tenant <id>` | `-t` | Tenant workspace identifier (UUID or slug). |
| `--connection <conn>` | `-c` | PostgreSQL connection string to `comms_api` database. |
| `--storage-path <path>` | | Filesystem path to attachment blob storage. |
| `--output <file>` | `-o` | Destination bundle path for `export`. |
| `--bundle <file>` | `-b` | Source bundle path for `import` or `verify`. |
| `--signer-key <key>` | | Private ECDSA P-256 key (literal PEM, base64, or file path) to sign exported bundle. |
| `--trusted-signer-key <key>`| | Public ECDSA P-256 key (literal PEM, base64, or file path) to verify imported bundle. |
| `--cell-key <key>` | | Local cell master encryption key (base64 32 bytes) for decrypting/re-encrypting attachments. |
| `--passphrase <phrase>` | `-p` | Passphrase used to encrypt/decrypt $K_{\text{bundle}}$. |
| `--dry-run` | | Executes full import validation and database insertion within a transaction, then rolls back. |
| `--allow-overwrite` | | Allows overwriting an existing output file during export. |
| `--verbose` | | Enables verbose trace logging. |

### 3.4 Process Exit Codes
| Exit Code | Name | Meaning |
|---|---|---|
| `0` | `Success` | Operation completed cleanly with 100% verification. |
| `1` | `InvalidArguments` | Missing or malformed command-line arguments. |
| `2` | `SignatureFailure` | ECDSA P-256 signature verification failed or signer untrusted. |
| `3` | `ChecksumMismatch` | Merkle root or attachment SHA-256 checksum mismatch (tamper detected). |
| `4` | `DatabaseFailure` | Relational database connection or constraint error. |
| `5` | `IoOrCryptoFailure` | File I/O, corrupt ZIP container, or decryption failure. |
| `6` | `PreconditionFailed` | Outbox not quiescent or cell write-pause not established. |
| `7` | `VersionMismatch` | Incompatible database schema or bundle format version. |

---

## 4. End-to-End Migration Runbook

### Step 1: Pre-Migration Health Check & Quiescence Drain
Before initiating migration:
1. Verify database connectivity on both source and target cells.
2. Put source cell `comms-api` into **Write-Pause Mode**:
   ```powershell
   curl -X POST https://source-cell.clinicez.internal/api/v1/migration/pause-writes \
     -H "Authorization: Bearer <AdminToken>" \
     -H "Content-Type: application/json" \
     -d '{"tenantId": "tenant-prime", "reason": "Cloud-to-Edge migration"}'
   ```
   *Expected Result*: Returns `HTTP 200 OK`. All subsequent writes from mobile or web clients will return `HTTP 423 Locked`.
3. Wait for the source cell's Interop Hub outbox to reach **quiescence** (zero pending messages for `tenant-prime`).

### Step 2: Export Bundle from Source Cell
```powershell
ClinicEz.Comms.MigrationTool export `
  --tenant "tenant-prime" `
  --connection "Host=source-db;Database=CLINICEZ_COMMS;Username=comms_admin;Password=secret" `
  --storage-path "/var/clinicez/attachments" `
  --output "C:\migrations\tenant-prime-20261026.clinicez-comms-bundle" `
  --signer-key "C:\keys\source-cell-signer.pem" `
  --cell-key "Y2VsbC1tYXN0ZXIta2V5LTAxMjM0NTY3ODkxMjM0NTY=" `
  --passphrase "CorrectHorseBatteryStaple2026!"
```
*Expected Result*:
```
[INFO] Scanning tenant records for 'tenant-prime'...
[INFO] Conversations: 142 | Messages: 1,894 | Triage: 87 | Attachments: 45 | Grants: 310
[INFO] Computing composite Merkle root...
[INFO] Merkle Root SHA-256: 4f8b9e...d2a1
[INFO] Exporting and re-encrypting attachments under bundle session key...
[INFO] Signing manifest with ECDSA P-256 private key...
[SUCCESS] Export complete. Bundle written to C:\migrations\tenant-prime-20261026.clinicez-comms-bundle (Exit Code 0)
```

### Step 3: Verify Bundle Integrity Prior to Transfer
On the destination edge cell, verify the bundle before touching the database:
```powershell
ClinicEz.Comms.MigrationTool verify `
  --bundle "C:\migrations\tenant-prime-20261026.clinicez-comms-bundle" `
  --trusted-signer-key "C:\keys\source-cell-public.pem" `
  --passphrase "CorrectHorseBatteryStaple2026!"
```
*Expected Result*:
```
[INFO] Verifying container format and signature...
[INFO] ECDSA P-256 signature is VALID (Signer: source-cell-cloud).
[INFO] Decrypting manifest and calculating Merkle tree...
[INFO] Manifest Merkle Root matches computed dataset hash.
[SUCCESS] Bundle verified successfully. (Exit Code 0)
```

### Step 4: Dry-Run Import Verification
Execute an atomic dry-run on the target database:
```powershell
ClinicEz.Comms.MigrationTool import `
  --bundle "C:\migrations\tenant-prime-20261026.clinicez-comms-bundle" `
  --connection "Host=edge-db;Database=CLINICEZ_COMMS;Username=comms_admin;Password=secret" `
  --storage-path "/var/clinicez/edge-attachments" `
  --trusted-signer-key "C:\keys\source-cell-public.pem" `
  --cell-key "ZWRnZS1jZWxsLW1hc3Rlci1rZXktMDEyMzQ1Njc4OTA=" `
  --passphrase "CorrectHorseBatteryStaple2026!" `
  --dry-run
```
*Expected Result*: Validates schema compatibility, checks foreign keys, simulates attachment storage, and rolls back transaction cleanly with exit code `0`.

### Step 5: Execute Live Import on Target Cell
```powershell
ClinicEz.Comms.MigrationTool import `
  --bundle "C:\migrations\tenant-prime-20261026.clinicez-comms-bundle" `
  --connection "Host=edge-db;Database=CLINICEZ_COMMS;Username=comms_admin;Password=secret" `
  --storage-path "/var/clinicez/edge-attachments" `
  --trusted-signer-key "C:\keys\source-cell-public.pem" `
  --cell-key "ZWRnZS1jZWxsLW1hc3Rlci1rZXktMDEyMzQ1Njc4OTA=" `
  --passphrase "CorrectHorseBatteryStaple2026!"
```
*Expected Result*:
```
[INFO] Ingesting 142 conversations...
[INFO] Ingesting 1,894 messages...
[INFO] Ingesting 87 triage inquiries...
[INFO] Re-encrypting 45 attachments with target cell key...
[INFO] Verifying post-import row count matrix...
[INFO] Ingested 100% of records.
[INFO] Committing database transaction...
[SUCCESS] Migration import complete. (Exit Code 0)
```

### Step 6: Post-Migration Activation & Cutover
1. Update DNS or Service Discovery to point the tenant's workstations to the edge cell:
   `https://comms.edge-facility.clinicez.internal`
2. Target cell `comms-api` is started in active mode.
3. Source cell can be archived or decommissioned.

---

## 5. Disaster Recovery & Rollback Procedures

### Scenario A: Tamper Detected or Signature Verification Fails
If a bundle was corrupted or tampered with in transit:
1. `import` or `verify` will exit immediately with exit code `2` (`SignatureFailure`) or `3` (`ChecksumMismatch`).
2. **Database Protection**: The database transaction is immediately aborted. No data is written.
3. **Recovery Action**: Re-transfer the original bundle or re-execute `export`. Unpause source cell writes if cutover cannot proceed:
   ```powershell
   curl -X POST https://source-cell.clinicez.internal/api/v1/migration/resume-writes \
     -H "Authorization: Bearer <AdminToken>" \
     -H "Content-Type: application/json" \
     -d '{"tenantId": "tenant-prime"}'
   ```

### Scenario B: Target Database Failure During Import
If the target host encounters disk exhaustion or database constraint violation during `import`:
1. `import` intercepts the exception, logs the root cause, and issues `await transaction.RollbackAsync()`.
2. The target database remains 100% clean with zero partial state.
3. Exit code `4` (`DatabaseFailure`) is returned.
4. Source cell remains unchanged in write-pause state until resolved.
