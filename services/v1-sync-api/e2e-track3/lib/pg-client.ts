import { randomUUID } from "node:crypto";
import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { assertNonProductionEnvironment, assertZeroPhi } from "./guardrails.ts";
import type { Track3S3Harness } from "./s3-client.ts";

export interface ClinicAttachmentSeed {
  id?: string;
  patientId?: string;
  recordType?: string;
  title?: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
  encryptionAlgorithm?: string;
  isDeleted?: boolean;
}

export interface PatientFileSeed {
  id?: string;
  patientId?: string;
  clinicId?: string | null;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  storageKey: string;
  title?: string;
  encryptionAlgorithm?: string;
  isDeleted?: boolean;
}

export interface SeededFixtureContext {
  runId: string;
  v2TenantId: string;
  v2ClinicId: string;
  clinicPatientIds: string[];
  patientIds: string[];
  clinicMembershipIds: string[];
  syntheticClinicIds: string[];
  attachmentIds: string[];
  fileRecordIds: string[];
  bindingIds: string[];
  syntheticDocumentTypeIds: string[];
  s3Objects: Array<{ bucket: string; key: string }>;
}

export interface ClinicAttachmentRow {
  Id: string;
  TenantId: string;
  ClinicId: string;
  PatientId: string;
  FileName: string;
  ContentType: string;
  FileSizeBytes: number;
  StorageUri: string;
  EncryptionAlgorithm: string;
  EncryptionKeyId: string | null;
  EncryptionIvBase64: string | null;
  EncryptionTagBase64: string | null;
  EncryptedSizeBytes: number | null;
  EncryptedHash: string | null;
  WrappedKeyJson: string | null;
  Title: string;
}

export interface PatientFileRow {
  id: string;
  patient_id: string;
  clinic_id: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  encryption_algorithm: string | null;
  encryption_key_id: string | null;
  encryption_iv_base64: string | null;
  encryption_tag_base64: string | null;
  encrypted_size_bytes: number | null;
  encrypted_hash: string | null;
  wrapped_key_json: string | null;
  title: string;
}

export interface SyncStorageObjectRow {
  binding_id: string;
  target_plane: string;
  target_entity_id: string;
  owner_id: string;
  tenant_id: string | null;
  source_provider: string;
  source_url: string;
  source_size_bytes: number;
  source_sha256: string | null;
  target_bucket: string | null;
  target_r2_key: string | null;
  encrypted_size_bytes: number | null;
  encrypted_sha256: string | null;
  encryption_key_scheme: string | null;
  status: string;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
}

export class PgHarness {
  readonly syncDb: Bun.SQL;
  readonly clinicDb: Bun.SQL;
  readonly patientDb: Bun.SQL;

  constructor(config: E2EConfig = loadConfig()) {
    assertNonProductionEnvironment(config);
    const makeUrl = (dbName: string): string =>
      `postgres://${encodeURIComponent(config.pgUser)}:${encodeURIComponent(config.pgPassword)}@${config.pgHost}:${config.pgPort}/${encodeURIComponent(dbName)}`;

    this.syncDb = new Bun.SQL(makeUrl("CLINICEZ-V1_SYNC_DB"));
    this.clinicDb = new Bun.SQL(makeUrl("CLINICEZ-CLINIC_DB"));
    this.patientDb = new Bun.SQL(makeUrl("CLINICEZ-PATIENT_DB"));
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.syncDb.close(), this.clinicDb.close(), this.patientDb.close()]);
  }

  async pingAll(): Promise<void> {
    await this.syncDb`SELECT 1 AS ok`;
    await this.clinicDb`SELECT 1 AS ok`;
    await this.patientDb`SELECT 1 AS ok`;
  }

  createEmptyContext(runId: string): SeededFixtureContext {
    return {
      runId,
      v2TenantId: `e2e_t3_${runId}`,
      v2ClinicId: randomUUID(),
      clinicPatientIds: [],
      patientIds: [],
      clinicMembershipIds: [],
      syntheticClinicIds: [],
      attachmentIds: [],
      fileRecordIds: [],
      bindingIds: [],
      syntheticDocumentTypeIds: [],
      s3Objects: [],
    };
  }

  async ensureDocumentTypeId(ctx: SeededFixtureContext): Promise<string> {
    const existing = await this.patientDb<{ id: string }>`
      SELECT id::text AS id FROM document_types WHERE is_deleted = false ORDER BY sort_order ASC LIMIT 1
    `;
    if (existing.length > 0 && existing[0]?.id) {
      return existing[0].id;
    }

    const docTypeId = randomUUID();
    const now = new Date().toISOString();
    await this.patientDb`
      INSERT INTO document_types (
        id, code, label, description, supported_extensions_json, supported_mime_types_json,
        native_preview_kind, is_active, sort_order, created_at, created_by, is_deleted
      ) VALUES (
        ${docTypeId}::uuid,
        ${`E2E_SYN_${ctx.runId}`},
        'Synthetic Document',
        'Synthetic E2E Document Type',
        '["pdf","png","txt"]',
        '["application/pdf","image/png","text/plain"]',
        'pdf',
        true,
        999,
        ${now}::timestamptz,
        'e2e-track3',
        false
      )
    `;
    ctx.syntheticDocumentTypeIds.push(docTypeId);
    return docTypeId;
  }

  async seedClinicPatient(
    ctx: SeededFixtureContext,
    cloudPatientId: string | null = null,
  ): Promise<string> {
    const patientId = randomUUID();
    const now = new Date().toISOString();
    const code = `E2E-CL-${ctx.runId}-${ctx.clinicPatientIds.length + 1}`;
    assertZeroPhi(code, "synthetic clinic PatientCode");

    await this.clinicDb`
      INSERT INTO "Patients" (
        "Id", "PatientCode", "FirstName", "LastName", "Sex", "ContactNumber",
        "CloudPatientId", "ShareGrantScopes", "IsDeceased", "CustomFields",
        "HasActiveSafetyAlert", "VerificationStatus", "CreatedAt", "CreatedBy",
        "IsDeleted", "TenantId", "ClinicId"
      ) VALUES (
        ${patientId}::uuid,
        ${code},
        'Synthetic',
        ${`ClinicPatient_${ctx.runId}`},
        'O',
        '0000000000',
        ${cloudPatientId}::uuid,
        'NONE',
        false,
        '{}'::jsonb,
        false,
        'Verified',
        ${now}::timestamptz,
        'e2e-track3',
        false,
        ${ctx.v2TenantId},
        ${ctx.v2ClinicId}::uuid
      )
    `;
    ctx.clinicPatientIds.push(patientId);
    return patientId;
  }

  async seedPatientAccount(ctx: SeededFixtureContext): Promise<string> {
    const patientId = randomUUID();
    const now = new Date().toISOString();
    const clinicEzId = `E2E-PT-${ctx.runId}-${ctx.patientIds.length + 1}`;
    assertZeroPhi(clinicEzId, "synthetic patient clinic_ez_id");

    await this.patientDb`
      INSERT INTO patients (
        id, client_id, clinic_ez_id, first_name, last_name,
        consent_to_share_info, created_at, created_by, is_deleted, welcome_visited_steps_json
      ) VALUES (
        ${patientId}::uuid,
        ${randomUUID()}::uuid,
        ${clinicEzId},
        'Synthetic',
        ${`Patient_${ctx.runId}`},
        false,
        ${now}::timestamptz,
        'e2e-track3',
        false,
        '[]'
      )
    `;
    ctx.patientIds.push(patientId);
    return patientId;
  }

  async ensurePatientClinic(ctx: SeededFixtureContext): Promise<string> {
    const now = new Date().toISOString();
    const clinicName = `E2E Synthetic Clinic ${ctx.runId}`;
    assertZeroPhi(clinicName, "ensurePatientClinic.name");

    await this.patientDb`
      INSERT INTO clinics (
        id, name, tenant_id, is_workspace_eligible, is_directory_published,
        is_public, supports_appointments, is_gated, specialties_json,
        required_share_fields_json, featured_score, active_member_count,
        created_at, updated_at, is_platform_verified
      ) VALUES (
        ${ctx.v2ClinicId}::uuid,
        ${clinicName},
        ${ctx.v2TenantId},
        false,
        false,
        false,
        false,
        false,
        '[]',
        '[]',
        0,
        0,
        ${now}::timestamptz,
        ${now}::timestamptz,
        false
      )
      ON CONFLICT (id) DO NOTHING
    `;
    if (!ctx.syntheticClinicIds.includes(ctx.v2ClinicId)) {
      ctx.syntheticClinicIds.push(ctx.v2ClinicId);
    }
    return ctx.v2ClinicId;
  }

  async seedPatientClinicMembership(
    ctx: SeededFixtureContext,
    patientId: string,
  ): Promise<string> {
    await this.ensurePatientClinic(ctx);
    const membershipId = randomUUID();
    const now = new Date().toISOString();

    await this.patientDb`
      INSERT INTO clinic_memberships (
        id, client_id, patient_id, clinic_id, status,
        consent_privacy_policy, consent_terms_and_conditions, consent_data_sharing,
        consented_at, created_at, created_by, is_deleted
      ) VALUES (
        ${membershipId}::uuid,
        ${randomUUID()}::uuid,
        ${patientId}::uuid,
        ${ctx.v2ClinicId}::uuid,
        'Active',
        true,
        true,
        true,
        ${now}::timestamptz,
        ${now}::timestamptz,
        'e2e-track3',
        false
      )
      ON CONFLICT (patient_id, clinic_id) DO NOTHING
    `;
    ctx.clinicMembershipIds.push(membershipId);
    return membershipId;
  }

  async seedClinicAttachment(
    ctx: SeededFixtureContext,
    seed: ClinicAttachmentSeed,
  ): Promise<string> {
    const id = seed.id ?? randomUUID();
    const patientId =
      seed.patientId ??
      (ctx.clinicPatientIds[0] ?? (await this.seedClinicPatient(ctx, ctx.patientIds[0] ?? null)));
    const now = new Date().toISOString();
    const docDate = now.slice(0, 10);
    const title = seed.title ?? `E2E Synthetic Attachment ${id.slice(0, 8)}`;

    assertZeroPhi(seed.fileName, "seedClinicAttachment.fileName");
    assertZeroPhi(seed.storageUri, "seedClinicAttachment.storageUri");
    assertZeroPhi(title, "seedClinicAttachment.title");

    await this.clinicDb`
      INSERT INTO "RecordAttachments" (
        "Id", "PatientId", "RecordType", "Title", "FileName", "ContentType",
        "FileSizeBytes", "StorageUri", "DocumentDate", "VerificationStatus",
        "EncryptionAlgorithm", "CreatedAt", "CreatedBy", "IsDeleted", "TenantId", "ClinicId"
      ) VALUES (
        ${id}::uuid,
        ${patientId}::uuid,
        ${seed.recordType ?? "LAB_RESULT"},
        ${title},
        ${seed.fileName},
        ${seed.contentType},
        ${seed.fileSizeBytes},
        ${seed.storageUri},
        ${docDate}::date,
        'Verified',
        ${seed.encryptionAlgorithm ?? "NONE"},
        ${now}::timestamptz,
        'e2e-track3',
        ${seed.isDeleted ?? false},
        ${ctx.v2TenantId},
        ${ctx.v2ClinicId}::uuid
      )
    `;
    ctx.attachmentIds.push(id);
    return id;
  }

  async seedPatientFile(
    ctx: SeededFixtureContext,
    seed: PatientFileSeed,
  ): Promise<string> {
    const id = seed.id ?? randomUUID();
    const patientId = seed.patientId ?? (ctx.patientIds[0] ?? (await this.seedPatientAccount(ctx)));
    const docTypeId = await this.ensureDocumentTypeId(ctx);
    const now = new Date().toISOString();
    const docDate = now.slice(0, 10);
    const title = seed.title ?? `E2E Synthetic File ${id.slice(0, 8)}`;

    assertZeroPhi(seed.fileName, "seedPatientFile.fileName");
    assertZeroPhi(seed.storageKey, "seedPatientFile.storageKey");
    assertZeroPhi(title, "seedPatientFile.title");

    await this.patientDb`
      INSERT INTO file_records (
        id, client_id, patient_id, clinic_id, file_name, mime_type, extension,
        size_bytes, storage_key, document_type_id, sync_status, uploaded_at,
        encryption_algorithm, created_at, created_by, is_deleted, document_date, title
      ) VALUES (
        ${id}::uuid,
        ${randomUUID()}::uuid,
        ${patientId}::uuid,
        ${seed.clinicId === undefined ? ctx.v2ClinicId : seed.clinicId}::uuid,
        ${seed.fileName},
        ${seed.mimeType},
        ${seed.extension},
        ${seed.sizeBytes},
        ${seed.storageKey},
        ${docTypeId}::uuid,
        'SYNCED',
        ${now}::timestamptz,
        ${seed.encryptionAlgorithm ?? "NONE"},
        ${now}::timestamptz,
        'e2e-track3',
        ${seed.isDeleted ?? false},
        ${docDate}::date,
        ${title}
      )
    `;
    ctx.fileRecordIds.push(id);
    return id;
  }

  async getClinicAttachment(id: string): Promise<ClinicAttachmentRow | null> {
    const rows = await this.clinicDb<ClinicAttachmentRow>`
      SELECT
        "Id"::text AS "Id",
        "TenantId",
        "ClinicId"::text AS "ClinicId",
        "PatientId"::text AS "PatientId",
        "FileName",
        "ContentType",
        "FileSizeBytes"::bigint::int AS "FileSizeBytes",
        "StorageUri",
        "EncryptionAlgorithm",
        "EncryptionKeyId",
        "EncryptionIvBase64",
        "EncryptionTagBase64",
        "EncryptedSizeBytes"::bigint::int AS "EncryptedSizeBytes",
        "EncryptedHash",
        "WrappedKeyJson",
        "Title"
      FROM "RecordAttachments"
      WHERE "Id" = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async getPatientFile(id: string): Promise<PatientFileRow | null> {
    const rows = await this.patientDb<PatientFileRow>`
      SELECT
        id::text AS id,
        patient_id::text AS patient_id,
        clinic_id::text AS clinic_id,
        file_name,
        mime_type,
        size_bytes::bigint::int AS size_bytes,
        storage_key,
        encryption_algorithm,
        encryption_key_id,
        encryption_iv_base64,
        encryption_tag_base64,
        encrypted_size_bytes::bigint::int AS encrypted_size_bytes,
        encrypted_hash,
        wrapped_key_json,
        title
      FROM file_records
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async getStorageObjectLedgerRows(bindingId: string): Promise<SyncStorageObjectRow[]> {
    return this.syncDb<SyncStorageObjectRow>`
      SELECT
        binding_id::text AS binding_id,
        target_plane,
        target_entity_id::text AS target_entity_id,
        owner_id::text AS owner_id,
        tenant_id,
        source_provider,
        source_url,
        source_size_bytes::bigint::int AS source_size_bytes,
        source_sha256,
        target_bucket,
        target_r2_key,
        encrypted_size_bytes::bigint::int AS encrypted_size_bytes,
        encrypted_sha256,
        encryption_key_scheme,
        status,
        attempt_count,
        last_error_code,
        last_error_message
      FROM sync_storage_objects
      WHERE binding_id = ${bindingId}::uuid
      ORDER BY target_plane, target_entity_id
    `;
  }

  async cleanupRunFixtures(
    ctx: SeededFixtureContext,
    s3?: Track3S3Harness,
  ): Promise<void> {
    // 1. Clean S3/MinIO objects created during synthetic run
    if (s3) {
      for (const obj of ctx.s3Objects) {
        await s3.deleteObject(obj.bucket, obj.key).catch(() => {});
      }
      const trimmedTenant = ctx.v2TenantId.trim();
      if (trimmedTenant.toLowerCase().startsWith("e2e_t3_")) {
        const prefixes = Array.from(new Set([`tenants/${ctx.v2TenantId}/`, `tenants/${trimmedTenant}/`]));
        for (const prefix of prefixes) {
          const clinicKeys = await s3.listKeys(s3.clinicBucket, prefix).catch(() => []);
          for (const key of clinicKeys) {
            await s3.deleteObject(s3.clinicBucket, key).catch(() => {});
          }
        }
      }
      for (const patientId of ctx.patientIds) {
        const patientKeys = await s3
          .listKeys(s3.patientBucket, `patients/${patientId}/`)
          .catch(() => []);
        for (const key of patientKeys) {
          await s3.deleteObject(s3.patientBucket, key).catch(() => {});
        }
      }
    }

    // 2. Clean sync ledger tables for synthetic bindings
    for (const bindingId of ctx.bindingIds) {
      await this.syncDb`DELETE FROM sync_storage_objects WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_conflicts WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_change_diffs WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_runs WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_cursors WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_audit_logs WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_id_map WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_row_hashes WHERE binding_id = ${bindingId}::uuid`.catch(() => {});
      await this.syncDb`DELETE FROM sync_bindings WHERE id = ${bindingId}::uuid`.catch(() => {});
    }

    // 3. Clean Clinic DB synthetic rows (attachments BEFORE patients due to FK_RecordAttachments_Patients_PatientId)
    for (const attachmentId of ctx.attachmentIds) {
      await this.clinicDb`
        DELETE FROM "RecordAttachments"
        WHERE "Id" = ${attachmentId}::uuid AND "CreatedBy" = 'e2e-track3'
      `.catch(() => {});
    }
    for (const clinicPatientId of ctx.clinicPatientIds) {
      await this.clinicDb`
        DELETE FROM "Patients"
        WHERE "Id" = ${clinicPatientId}::uuid AND "CreatedBy" = 'e2e-track3'
      `.catch(() => {});
    }

    // 4. Clean Patient DB synthetic rows (strict FK order: file_records -> clinic_memberships -> patients -> clinics -> document_types)
    for (const fileId of ctx.fileRecordIds) {
      await this.patientDb`
        DELETE FROM file_records
        WHERE id = ${fileId}::uuid AND created_by = 'e2e-track3'
      `.catch(() => {});
    }
    for (const membershipId of ctx.clinicMembershipIds) {
      await this.patientDb`
        DELETE FROM clinic_memberships
        WHERE id = ${membershipId}::uuid AND created_by = 'e2e-track3'
      `.catch(() => {});
    }
    for (const patientId of ctx.patientIds) {
      await this.patientDb`
        DELETE FROM patients
        WHERE id = ${patientId}::uuid AND created_by = 'e2e-track3'
      `.catch(() => {});
    }
    for (const clinicId of ctx.syntheticClinicIds) {
      await this.patientDb`
        DELETE FROM clinics
        WHERE id = ${clinicId}::uuid AND name LIKE 'E2E Synthetic Clinic %'
      `.catch(() => {});
    }
    for (const docTypeId of ctx.syntheticDocumentTypeIds) {
      await this.patientDb`
        DELETE FROM document_types
        WHERE id = ${docTypeId}::uuid AND created_by = 'e2e-track3'
      `.catch(() => {});
    }
  }
}
