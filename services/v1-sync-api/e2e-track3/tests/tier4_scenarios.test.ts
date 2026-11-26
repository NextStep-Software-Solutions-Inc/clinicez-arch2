import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  clinicObjectKey,
  decryptClinicPayload,
  decryptPatientPayload,
  patientObjectKey,
  sha256Hex,
} from "../lib/crypto-parity.ts";
import { assertZeroPhi } from "../lib/guardrails.ts";
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
import { auditAdminWebTrack3Copy, probeChromeDom } from "../lib/ui-probe.ts";

describe("Tier 4: Real-World End-to-End Scenarios", () => {
  let suite: LiveSuiteContext;

  beforeAll(async () => {
    suite = await initLiveSuiteContext();
  });

  afterAll(async () => {
    await teardownLiveSuiteContext(suite);
  });

  test("Scenario 1: End-to-end Clinic + Patient Dry-Run (SampleLimit=25) on local MinIO & PG17", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const patientId = await suite.pg.seedPatientAccount(ctx);
      const clinicIds: string[] = [];
      const patientFileIds: string[] = [];

      for (let i = 0; i < 15; i++) {
        clinicIds.push(
          await suite.pg.seedClinicAttachment(ctx, {
            fileName: `s1_c_${i}_${ctx.runId}.pdf`,
            contentType: "application/pdf",
            fileSizeBytes: 80,
            storageUri: canonicalAzureBlob1Url(`healthy/s1_c_${i}_${ctx.runId}.pdf`),
          }),
        );
      }
      for (let i = 0; i < 12; i++) {
        patientFileIds.push(
          await suite.pg.seedPatientFile(ctx, {
            patientId,
            fileName: `s1_p_${i}_${ctx.runId}.png`,
            mimeType: "image/png",
            extension: "png",
            sizeBytes: 64,
            storageKey: canonicalAzureBlob1Url(`healthy/s1_p_${i}_${ctx.runId}.png`),
          }),
        );
      }

      const binding = await createTrack3Binding(suite, ctx, {
        name: `E2E S1 DryRun ${ctx.runId}`,
        patientCohortMode: "SCOPED",
      });

      const dryRun = await suite.api.dryRun(
        binding.id,
        { sampleLimit: 25, targetPlaneFilter: "BOTH", providerFilter: "AZURE_BLOB_1" },
        false,
      );
      expect(dryRun.status).toBe(200);
      expect(dryRun.data.status).toBe("COMPLETED");
      expect(dryRun.data.mode).toBe("DRY_RUN");
      expect(dryRun.data.summary.processedItems).toBeLessThanOrEqual(25);
      assertZeroPhi(JSON.stringify(dryRun.data), "Scenario 1 Dry-Run response");

      // Verify zero DB mutations and zero MinIO uploads
      for (const attId of clinicIds) {
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        expect(
          await suite.s3.exists(
            suite.s3.clinicBucket,
            clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId),
          ),
        ).toBe(false);
      }
      for (const fileId of patientFileIds) {
        expect((await suite.pg.getPatientFile(fileId))?.encryption_algorithm).toBe("NONE");
        expect(
          await suite.s3.exists(suite.s3.patientBucket, patientObjectKey(patientId, fileId)),
        ).toBe(false);
      }
    });
  }, { timeout: 30_000 });

  test("Scenario 2: Sample Backfill (Limit=25) -> MinIO .cez upload + real CMK/PMK decryption + DB verification", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const patientId = await suite.pg.seedPatientAccount(ctx);
      const clinicItems: Array<{ id: string; plain: Uint8Array }> = [];
      const patientItems: Array<{ id: string; plain: Uint8Array }> = [];

      for (let i = 0; i < 13; i++) {
        const subPath = `healthy/s2_c_${i}_${ctx.runId}.pdf`;
        const plain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const id = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `s2_c_${i}_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: plain.byteLength,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        clinicItems.push({ id, plain });
      }
      for (let i = 0; i < 12; i++) {
        const subPath = `healthy/s2_p_${i}_${ctx.runId}.png`;
        const plain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const id = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `s2_p_${i}_${ctx.runId}.png`,
          mimeType: "image/png",
          extension: "png",
          sizeBytes: plain.byteLength,
          storageKey: canonicalAzureBlob1Url(subPath),
        });
        patientItems.push({ id, plain });
      }

      const binding = await createTrack3Binding(suite, ctx, {
        name: `E2E S2 Backfill25 ${ctx.runId}`,
        patientCohortMode: "SCOPED",
        batchSize: 10,
      });

      const trigger = await suite.api.backfill(
        binding.id,
        { sampleLimit: 25, maxConcurrency: 4 },
        true,
      );
      expect(trigger.status).toBe(202);
      const completed = await suite.api.waitForRun(binding.id, trigger.data.id, 45_000);
      expect(completed.status).toBe("COMPLETED");
      expect(completed.summary.clinicCopiesMigrated).toBe(13);
      expect(completed.summary.patientCopiesMigrated).toBe(12);
      expect((completed.summary.bytesDownloaded ?? 0)).toBeGreaterThan(0);
      expect((completed.summary.bytesUploaded ?? 0)).toBeGreaterThan(0);

      for (const item of clinicItems) {
        const row = await suite.pg.getClinicAttachment(item.id);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
        expect(row?.EncryptionKeyId).toBe("cmk-v1");
        const key = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, item.id);
        expect(row?.StorageUri).toBe(key);

        const head = await suite.s3.headObjectMetadata(suite.s3.clinicBucket, key);
        expect(head.exists).toBe(true);
        expect(head.encryption).toBe("AES-256-GCM");
        expect(head.keyScheme).toBe("cmk-v1");

        const cipher = await suite.s3.getBytes(suite.s3.clinicBucket, key);
        expect(sha256Hex(cipher)).toBe(row?.EncryptedHash ?? "");
        const decrypted = decryptClinicPayload(
          cipher,
          row?.EncryptionIvBase64 ?? "",
          row?.EncryptionTagBase64 ?? "",
          row?.WrappedKeyJson ?? "",
          ctx.v2TenantId,
          ctx.v2ClinicId,
          suite.config.clinicMasterSecret,
        );
        expect(decrypted.equals(Buffer.from(item.plain))).toBe(true);
      }

      for (const item of patientItems) {
        const row = await suite.pg.getPatientFile(item.id);
        expect(row?.encryption_algorithm).toBe("AES-256-GCM");
        expect(row?.encryption_key_id).toBe("pmk-v1");
        const key = patientObjectKey(patientId, item.id);
        expect(row?.storage_key).toBe(key);

        const head = await suite.s3.headObjectMetadata(suite.s3.patientBucket, key);
        expect(head.exists).toBe(true);
        expect(head.encryption).toBe("AES-256-GCM");
        expect(head.keyScheme).toBe("pmk-v1");

        const cipher = await suite.s3.getBytes(suite.s3.patientBucket, key);
        expect(sha256Hex(cipher)).toBe(row?.encrypted_hash ?? "");
        const decrypted = decryptPatientPayload(
          cipher,
          row?.encryption_iv_base64 ?? "",
          row?.encryption_tag_base64 ?? "",
          row?.wrapped_key_json ?? "",
          patientId,
          suite.config.patientMasterSecret,
        );
        expect(decrypted.equals(Buffer.from(item.plain))).toBe(true);
      }
    });
  }, { timeout: 60_000 });

  test("Scenario 3: Mixed healthy/dead/auth/HTML/Drive/Azure#2/shared-URL/transient-503 batch + retry-failed + parity", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const patientId = await suite.pg.seedPatientAccount(ctx);
      const sharedPath = `shared/s3_${ctx.runId}.pdf`;
      const sharedUrl = canonicalAzureBlob1Url(sharedPath);
      const sharedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${sharedPath}`);

      const sharedClinicId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_sh_c_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: sharedPlain.byteLength,
        storageUri: sharedUrl,
      });
      const sharedPatientId = await suite.pg.seedPatientFile(ctx, {
        patientId,
        fileName: `s3_sh_p_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: sharedPlain.byteLength,
        storageKey: sharedUrl,
      });
      const transientId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_503_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`transient-503/s3_${ctx.runId}.pdf?fail=3`),
      });
      const deadId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_404_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`dead-404/s3_${ctx.runId}.pdf`),
      });
      const emptyId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_0_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 0,
        storageUri: canonicalAzureBlob1Url(`empty-0/s3_${ctx.runId}.pdf`),
      });
      const authId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_401_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`auth-401/s3_${ctx.runId}.pdf`),
      });
      const htmlId = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s3_html_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`html-wall/s3_${ctx.runId}.pdf`),
      });
      const driveId = await suite.pg.seedPatientFile(ctx, {
        patientId,
        fileName: `s3_drv_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalGoogleDriveUrl(`s3_${ctx.runId}`),
      });
      const az2Id = await suite.pg.seedPatientFile(ctx, {
        patientId,
        fileName: `s3_az2_${ctx.runId}.pdf`,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 80,
        storageKey: canonicalAzureBlob2Url(`s3_${ctx.runId}.pdf`),
      });

      suite.mockOrigin?.resetState();
      const binding = await createTrack3Binding(suite, ctx, { name: `E2E S3 Mixed ${ctx.runId}` });
      const firstRun = await suite.api.backfill(binding.id, {}, false);
      expect(firstRun.status).toBe(200);
      expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${sharedPath}`)).toBe(1);
      expect((firstRun.data.summary.overlapSavedDownloads ?? 0)).toBeGreaterThanOrEqual(1);

      expect((await suite.pg.getClinicAttachment(sharedClinicId))?.EncryptionAlgorithm).toBe("AES-256-GCM");
      expect((await suite.pg.getPatientFile(sharedPatientId))?.encryption_algorithm).toBe("AES-256-GCM");
      expect((await suite.api.getParity(binding.id)).data.readyToFreeze).toBe(false);

      // Retry failed recovers transient 503
      const retryRun = await suite.api.retryFailed(binding.id, { asyncMode: false });
      expect(retryRun.status).toBe(200);
      expect((await suite.pg.getClinicAttachment(transientId))?.EncryptionAlgorithm).toBe("AES-256-GCM");

      // Skipped rows remain NONE with original pointers untouched
      expect((await suite.pg.getClinicAttachment(deadId))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getClinicAttachment(emptyId))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getClinicAttachment(authId))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getClinicAttachment(htmlId))?.EncryptionAlgorithm).toBe("NONE");
      expect((await suite.pg.getPatientFile(driveId))?.encryption_algorithm).toBe("NONE");
      expect((await suite.pg.getPatientFile(az2Id))?.encryption_algorithm).toBe("NONE");

      const parity = await suite.api.getParity(binding.id);
      expect(parity.status).toBe(200);
      expect(parity.data.readyToFreeze).toBe(true);
    });
  }, { timeout: 30_000 });

  test("Scenario 4: Post-migration Track 1 & Track 2 sync (0 V2_MODIFIED) + Auto-Sync pickup", async () => {
    await withSyntheticContext(suite, async (ctx) => {
      const att1 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s4_1_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/s4_1_${ctx.runId}.pdf`),
      });
      const binding = await createTrack3Binding(suite, ctx, {
        name: `E2E S4 AutoSync ${ctx.runId}`,
        autoSyncEnabled: true,
        pollIntervalSeconds: 10,
      });
      await suite.api.backfill(binding.id, {}, false);
      expect((await suite.pg.getClinicAttachment(att1))?.EncryptionAlgorithm).toBe("AES-256-GCM");

      // Verify existing or synthetic Track 1 / Track 2 bindings report 0 false V2_MODIFIED conflicts on migrated rows
      const statusRes = await suite.api.getStatus();
      const existingBindings = await suite.api.listBindings();
      const t1 = existingBindings.data.find((b) => b.track === "TRACK1_CLINIC" && !b.isFrozen);
      if (t1) {
        const pull1 = await suite.api.pullNow(t1.id, {});
        expect(pull1.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        const c1 = await suite.api.listConflicts(t1.id, "OPEN");
        expect(c1.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
      } else {
        const synthT1 = await suite.api.createBinding({
          track: "TRACK1_CLINIC",
          name: `E2E S4 T1 ${ctx.runId}`,
          v1ClinicId: 999921,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
        });
        expect(synthT1.status).toBe(201);
        ctx.bindingIds.push(synthT1.data.id);
        const dry1 = await suite.api.dryRun(synthT1.data.id, { sampleLimit: 5 }, false);
        expect(dry1.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        const c1 = await suite.api.listConflicts(synthT1.data.id, "OPEN");
        expect(c1.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
      }
      expect((await suite.pg.getClinicAttachment(att1))?.StorageUri).toBe(
        clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, att1),
      );

      const t2 = existingBindings.data.find((b) => b.track === "TRACK2_PATIENT" && !b.isFrozen);
      if (t2) {
        const pull2 = await suite.api.pullNow(t2.id, {});
        expect(pull2.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        const c2 = await suite.api.listConflicts(t2.id, "OPEN");
        expect(c2.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
      } else {
        const synthT2 = await suite.api.createBinding({
          track: "TRACK2_PATIENT",
          name: `E2E S4 T2 ${ctx.runId}`,
          v1ClinicId: 999921,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          patientCohortMode: "SCOPED",
        });
        expect(synthT2.status).toBe(201);
        ctx.bindingIds.push(synthT2.data.id);
        const dry2 = await suite.api.dryRun(synthT2.data.id, { sampleLimit: 5 }, false);
        expect(dry2.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        const c2 = await suite.api.listConflicts(synthT2.data.id, "OPEN");
        expect(c2.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
      }

      // Add a new NONE attachment and verify Auto-Sync (or pull-now if worker disabled) picks it up
      const att2 = await suite.pg.seedClinicAttachment(ctx, {
        fileName: `s4_2_${ctx.runId}.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 80,
        storageUri: canonicalAzureBlob1Url(`healthy/s4_2_${ctx.runId}.pdf`),
      });

      if (statusRes.data.backgroundWorkerEnabled) {
        const phHour = (new Date().getUTCHours() + 8) % 24;
        const waitMs = phHour >= 22 || phHour < 6 ? 75_000 : 45_000;
        const deadline = Date.now() + waitMs;
        let pickedUp = false;
        while (Date.now() < deadline) {
          if ((await suite.pg.getClinicAttachment(att2))?.EncryptionAlgorithm === "AES-256-GCM") {
            pickedUp = true;
            break;
          }
          await Bun.sleep(500);
        }
        expect(pickedUp).toBe(true);
      } else {
        const pull = await suite.api.pullNow(binding.id, {});
        expect(pull.status).toBe(200);
        expect((await suite.pg.getClinicAttachment(att2))?.EncryptionAlgorithm).toBe("AES-256-GCM");
      }
    });
  }, { timeout: 90_000 });

  test("Scenario 5: Live /v1-sync UI end-to-end verification on admin-web", async () => {
    const domProbe = probeChromeDom(suite.config, "/v1-sync");
    expect(domProbe.httpStatus).toBe(200);
    expect(domProbe.hasClinicEzBrand).toBe(true);
    expect(domProbe.hasViteErrorOverlay).toBe(false);

    const uiAudit = await auditAdminWebTrack3Copy(suite.config);
    expect(uiAudit.fetchedPaths.length).toBeGreaterThanOrEqual(10);
    expect(uiAudit.missingRequiredLabels).toEqual([]);
    expect(uiAudit.jargonViolations).toEqual([]);
    expect(uiAudit.uiPrimitiveViolations).toEqual([]);
  }, { timeout: 30_000 });
});
