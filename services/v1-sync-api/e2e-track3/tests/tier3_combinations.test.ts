import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  clinicObjectKey,
  decryptClinicPayload,
  decryptPatientPayload,
  patientObjectKey,
} from "../lib/crypto-parity.ts";
import {
  canonicalAzureBlob1Url,
  canonicalAzureBlob2Url,
  canonicalGoogleDriveUrl,
  deterministicPayloadForPath,
} from "../lib/mock-origin.ts";
import {
  createTrack3Binding,
  initLiveSuiteContext,
  teardownLiveSuiteContext,
  withSyntheticContext,
  type LiveSuiteContext,
} from "../lib/test-harness.ts";

describe("Tier 3: Pairwise Feature Combinations", () => {
  let suite: LiveSuiteContext;

  beforeAll(async () => {
    suite = await initLiveSuiteContext();
  });

  afterAll(async () => {
    await teardownLiveSuiteContext(suite);
  });

  test("Pair 1: CLINIC_ONLY x AZURE_BLOB_1 x SCOPED migrates Azure Blob #1 Clinic rows and ignores Patient & Drive", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const cAz1 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p1_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/p1_c_${ctx.runId}.pdf`),
      });
      const cDrv = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p1_d_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalGoogleDriveUrl(`p1_${ctx.runId}`),
      });
      const pAz1 = await suite.pg.seedPatientFile(ctx, {
        fileName: `p1_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob1Url(`healthy/p1_p_${ctx.runId}.pdf`),
      });

      const binding = await createTrack3Binding(suite, ctx, { patientCohortMode: "SCOPED" });
      const run = await suite.api.backfill(
        binding.id,
        { targetPlaneFilter: "CLINIC_ONLY", providerFilter: "AZURE_BLOB_1" },
        false,
      );
      expect(run.status).toBe(200);
      expect((await suite.pg.getClinicAttachment(cAz1))?.EncryptionAlgorithm).toBe("AES-256-GCM");
      expect((await suite.pg.getClinicAttachment(cDrv))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getPatientFile(pAz1))?.encryption_algorithm).toBe("NONE");
    });
  });

  test("Pair 2: PATIENT_ONLY x AZURE_BLOB_1 x SCOPED migrates Patient Azure Blob #1 and skips Clinic", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const cAz1 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p2_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/p2_c_${ctx.runId}.pdf`),
      });
      const pAz1 = await suite.pg.seedPatientFile(ctx, {
        fileName: `p2_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob1Url(`healthy/p2_p_${ctx.runId}.pdf`),
      });

      const binding = await createTrack3Binding(suite, ctx, { patientCohortMode: "SCOPED" });
      const run = await suite.api.backfill(
        binding.id,
        { targetPlaneFilter: "PATIENT_ONLY", providerFilter: "AZURE_BLOB_1" },
        false,
      );
      expect(run.status).toBe(200);
      expect((await suite.pg.getClinicAttachment(cAz1))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getPatientFile(pAz1))?.encryption_algorithm).toBe("AES-256-GCM");
    });
  });

  test("Pair 3: BOTH x ALL x GLOBAL dry-run scans Clinic + Patient scopes without mutating existing rows", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const cAz1 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p3_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/p3_c_${ctx.runId}.pdf`),
      });
      const cAz2 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p3_a2_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob2Url(`p3_${ctx.runId}.pdf`),
      });
      const pAz1 = await suite.pg.seedPatientFile(ctx, {
        fileName: `p3_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob1Url(`healthy/p3_p_${ctx.runId}.pdf`),
      });

      const binding = await createTrack3Binding(suite, ctx, { patientCohortMode: "GLOBAL" });
      const run = await suite.api.dryRun(
        binding.id,
        { targetPlaneFilter: "BOTH", providerFilter: "ALL", sampleLimit: 25 },
        false,
      );
      expect(run.status).toBe(200);
      expect(run.data.mode).toBe("DRY_RUN");
      expect(run.data.status).toBe("COMPLETED");
      expect(run.data.summary.totalItems).toBeGreaterThanOrEqual(2);
      expect(run.data.summary.totalItems).toBeLessThanOrEqual(25);
      expect(run.data.summary.skippedCount ?? 0).toBeGreaterThanOrEqual(1);
      expect((await suite.pg.getClinicAttachment(cAz1))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getClinicAttachment(cAz2))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getPatientFile(pAz1))?.encryption_algorithm).toBe("NONE");
    });
  });

  test("Pair 4: Lifecycle state machine DRY_RUN -> BACKFILL -> FINAL_SWEEP -> FREEZE -> UNFREEZE -> PULL_NOW", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const att1 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `lc1_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/lc1_${ctx.runId}.pdf`),
      });
      const binding = await createTrack3Binding(suite, ctx);

      expect((await suite.api.dryRun(binding.id, {}, false)).status).toBe(200);
      expect((await suite.pg.getClinicAttachment(att1))?.EncryptionAlgorithm).toBe("NONE");

      expect((await suite.api.backfill(binding.id, {}, false)).status).toBe(200);
      expect((await suite.pg.getClinicAttachment(att1))?.EncryptionAlgorithm).toBe("AES-256-GCM");

      const sweep = await suite.api.finalSweep(binding.id, {}, false);
      expect(sweep.status).toBe(200);
      expect(sweep.data.parity?.readyToFreeze).toBe(true);

      const frozen = await suite.api.freeze(binding.id, "FREEZE");
      expect(frozen.status).toBe(200);
      expect(frozen.data.binding.isFrozen).toBe(true);
      expect((await suite.api.pullNow(binding.id, {})).status).toBe(409);

      const unfrozen = await suite.api.unfreeze(binding.id);
      expect(unfrozen.status).toBe(200);
      expect(unfrozen.data.isFrozen).toBe(false);
      expect((await suite.api.pullNow(binding.id, {})).status).toBe(200);
    });
  });

  test("Pair 5: Shared URL Download-Once Encrypt-Twice + Patient delete + Clinic CMK decrypt survival", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const subPath = `shared/p5_${ctx.runId}.pdf`;
      const sharedUrl = canonicalAzureBlob1Url(subPath);
      const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
      const patientId = await suite.pg.seedPatientAccount(ctx);
      const attId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p5_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: expectedPlain.byteLength,
        storageUri: sharedUrl,
      });
      const fileId = await suite.pg.seedPatientFile(ctx, {
        patientId,
        fileName: `p5_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: expectedPlain.byteLength,
        storageKey: sharedUrl,
      });

      suite.mockOrigin?.resetState();
      const binding = await createTrack3Binding(suite, ctx);
      const run = await suite.api.backfill(binding.id, {}, false);
      expect(run.status).toBe(200);
      expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${subPath}`)).toBe(1);

      const cKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
      const pKey = patientObjectKey(patientId, fileId);
      const pRow = await suite.pg.getPatientFile(fileId);
      const pDec = decryptPatientPayload(
        await suite.s3.getBytes(suite.s3.patientBucket, pKey),
        pRow?.encryption_iv_base64 ?? "",
        pRow?.encryption_tag_base64 ?? "",
        pRow?.wrapped_key_json ?? "",
        patientId,
        suite.config.patientMasterSecret,
      );
      expect(pDec.equals(Buffer.from(expectedPlain))).toBe(true);

      await suite.s3.deleteObject(suite.s3.patientBucket, pKey);
      const cRow = await suite.pg.getClinicAttachment(attId);
      const cDec = decryptClinicPayload(
        await suite.s3.getBytes(suite.s3.clinicBucket, cKey),
        cRow?.EncryptionIvBase64 ?? "",
        cRow?.EncryptionTagBase64 ?? "",
        cRow?.WrappedKeyJson ?? "",
        ctx.v2TenantId,
        ctx.v2ClinicId,
        suite.config.clinicMasterSecret,
      );
      expect(cDec.equals(Buffer.from(expectedPlain))).toBe(true);
    });
  });

  test("Pair 6: Transient 429 & 503 -> FAILED_RETRYABLE -> retry-failed -> parity.readyToFreeze=true", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p6_503_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`transient-503/p6_${ctx.runId}.pdf?fail=3`),
      });
      await suite.pg.seedPatientFile(ctx, {
        fileName: `p6_429_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob1Url(`transient-429/p6_${ctx.runId}.pdf?fail=3`),
      });

      const binding = await createTrack3Binding(suite, ctx);
      await suite.api.backfill(binding.id, {}, false);
      expect((await suite.api.getParity(binding.id)).data.readyToFreeze).toBe(false);

      const retry = await suite.api.retryFailed(binding.id, { asyncMode: false });
      expect(retry.status).toBe(200);
      expect((await suite.api.getStorageObjects(binding.id, { status: "FAILED_RETRYABLE" })).data.totalCount).toBe(0);
      expect((await suite.api.getParity(binding.id)).data.readyToFreeze).toBe(true);
    });
  });

  test("Pair 7: Auth-gated 401 -> retry-failed without vs with includeAuthSkipped=true", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const subPath = `auth-401/p7_${ctx.runId}.pdf`;
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p7_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(subPath),
      });
      const binding = await createTrack3Binding(suite, ctx);
      await suite.api.backfill(binding.id, {}, false);

      suite.mockOrigin?.resetState();
      await suite.api.retryFailed(binding.id, { asyncMode: false, includeAuthSkipped: false });
      expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${subPath}`)).toBe(0);

      await suite.api.retryFailed(binding.id, { asyncMode: false, includeAuthSkipped: true });
      expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${subPath}`)).toBe(1);
      const ledger = await suite.api.getStorageObjects(binding.id, {
        status: "SKIPPED_AUTH_REQUIRED",
      });
      expect(ledger.data.totalCount).toBe(1);
    });
  });

  test("Pair 8: Mixed healthy + 404 + 0-byte + HTML + Drive + Azure #2 -> ATTENTION filter + informational parity", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p8_ok_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/p8_${ctx.runId}.pdf`),
      });
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p8_404_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`dead-404/p8_${ctx.runId}.pdf`),
      });
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p8_0_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 0,
        storageUri: canonicalAzureBlob1Url(`empty-0/p8_${ctx.runId}.pdf`),
      });
      await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p8_html_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`html-wall/p8_${ctx.runId}.pdf`),
      });
      await suite.pg.seedPatientFile(ctx, {
        fileName: `p8_drv_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalGoogleDriveUrl(`p8_${ctx.runId}`),
      });
      await suite.pg.seedPatientFile(ctx, {
        fileName: `p8_az2_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob2Url(`p8_${ctx.runId}.pdf`),
      });

      const binding = await createTrack3Binding(suite, ctx);
      await suite.api.backfill(binding.id, {}, false);

      const attention = await suite.api.getStorageObjects(binding.id, { status: "ATTENTION" });
      expect(attention.data.totalCount).toBe(5);
      const parity = await suite.api.getParity(binding.id);
      expect(parity.data.readyToFreeze).toBe(true);
    });
  });

  test("Pair 9: Post-migration Track 1 & Track 2 bindings co-exist with Track 3 with 0 false V2_MODIFIED conflicts", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const attId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p9_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/p9_c_${ctx.runId}.pdf`),
      });
      const patientId = await suite.pg.seedPatientAccount(ctx);
      const fileId = await suite.pg.seedPatientFile(ctx, {
        patientId,
        fileName: `p9_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob1Url(`healthy/p9_p_${ctx.runId}.pdf`),
      });
      const t3 = await createTrack3Binding(suite, ctx);
      const bf = await suite.api.backfill(t3.id, {}, false);
      expect(bf.status).toBe(200);

      const t1 = await suite.api.createBinding({
        track: "TRACK1_CLINIC",
        name: `P9 T1 ${ctx.runId}`,
        v1ClinicId: 999911,
        v2TenantId: ctx.v2TenantId,
        v2ClinicId: ctx.v2ClinicId,
      });
      const t2 = await suite.api.createBinding({
        track: "TRACK2_PATIENT",
        name: `P9 T2 ${ctx.runId}`,
        v1ClinicId: 999911,
        v2TenantId: ctx.v2TenantId,
        v2ClinicId: ctx.v2ClinicId,
        patientCohortMode: "SCOPED",
      });
      expect(t1.status).toBe(201);
      expect(t2.status).toBe(201);
      ctx.bindingIds.push(t1.data.id, t2.data.id);

      const statusRes = await suite.api.getStatus();
      const t1Dry = await suite.api.dryRun(t1.data.id, { sampleLimit: 5 }, false);
      const t2Dry = await suite.api.dryRun(t2.data.id, { sampleLimit: 5 }, false);
      expect(t1Dry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
      expect(t2Dry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);

      const afterAtt = await suite.pg.getClinicAttachment(attId);
      const afterFile = await suite.pg.getPatientFile(fileId);
      expect(afterAtt?.EncryptionAlgorithm).toBe("AES-256-GCM");
      expect(afterAtt?.StorageUri).toBe(clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId));
      expect(afterFile?.encryption_algorithm).toBe("AES-256-GCM");
      expect(afterFile?.storage_key).toBe(patientObjectKey(patientId, fileId));
      expect((await suite.api.listConflicts(t1.data.id, "OPEN")).data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
      expect((await suite.api.listConflicts(t2.data.id, "OPEN")).data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
    });
  });

  test("Pair 10: asyncMode=true Backfill (maxConcurrency=8, batchSize=10) + polling + HEAD & CMK/PMK decryption", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const subPath = `healthy/p10_${ctx.runId}.pdf`;
      const plain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
      const attId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `p10_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: plain.byteLength,
        storageUri: canonicalAzureBlob1Url(subPath),
      });
      const binding = await createTrack3Binding(suite, ctx);
      const trigger = await suite.api.backfill(
        binding.id,
        { sampleLimit: 10, maxConcurrency: 8, batchSize: 10 },
        true,
      );
      expect(trigger.status).toBe(202);
      const completed = await suite.api.waitForRun(binding.id, trigger.data.id);
      expect(completed.status).toBe("COMPLETED");

      const row = await suite.pg.getClinicAttachment(attId);
      const key = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
      const head = await suite.s3.headObjectMetadata(suite.s3.clinicBucket, key);
      expect(head.encryption).toBe("AES-256-GCM");
      expect(head.keyScheme).toBe("cmk-v1");

      const dec = decryptClinicPayload(
        await suite.s3.getBytes(suite.s3.clinicBucket, key),
        row?.EncryptionIvBase64 ?? "",
        row?.EncryptionTagBase64 ?? "",
        row?.WrappedKeyJson ?? "",
        ctx.v2TenantId,
        ctx.v2ClinicId,
        suite.config.clinicMasterSecret,
      );
      expect(dec.equals(Buffer.from(plain))).toBe(true);
    });
  });
});
