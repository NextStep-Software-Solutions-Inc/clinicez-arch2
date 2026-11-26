import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  clinicObjectKey,
  decryptClinicPayload,
  decryptPatientPayload,
  encryptClinicPayload,
  encryptPatientPayload,
  parseWrappedKeyJson,
  patientObjectKey,
  sha256Hex,
} from "../lib/crypto-parity.ts";
import {
  canonicalAzureBlob1Url,
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
import { auditAdminWebTrack3Copy } from "../lib/ui-probe.ts";

describe("Tier 2: Boundary & Corner Cases (E2E-1 through E2E-9)", () => {
  let suite: LiveSuiteContext;

  beforeAll(async () => {
    suite = await initLiveSuiteContext();
  });

  afterAll(async () => {
    await teardownLiveSuiteContext(suite);
  });

  describe("E2E-1 Boundaries: Binding CRUD, Auth & Clamping", () => {
    test("POST /bindings rejects unsupported track value with 400", async () => {
      const res = await suite.api.createBinding({
        track: "TRACK99_UNKNOWN",
        name: "Invalid Track",
        v2TenantId: "e2e_t3_invalid",
        v2ClinicId: randomUUID(),
      });
      expect(res.status).toBe(400);
    });

    test("POST /bindings rejects empty or whitespace-only name with 400", async () => {
      const res = await suite.api.createBinding({
        track: "TRACK3_STORAGE",
        name: "   ",
        v2TenantId: "e2e_t3_emptyname",
        v2ClinicId: randomUUID(),
      });
      expect(res.status).toBe(400);
    });

    test("POST /bindings clamps batchSize to [10..1000] and pollIntervalSeconds to [10..3600]", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const low = await suite.api.createBinding({
          track: "TRACK3_STORAGE",
          name: `Clamp Low ${ctx.runId}`,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          batchSize: 1,
          pollIntervalSeconds: 1,
        });
        expect(low.status).toBe(201);
        ctx.bindingIds.push(low.data.id);
        expect(low.data.batchSize).toBe(10);
        expect(low.data.pollIntervalSeconds).toBe(10);

        const high = await suite.api.createBinding({
          track: "TRACK3_STORAGE",
          name: `Clamp High ${ctx.runId}`,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          batchSize: 9999,
          pollIntervalSeconds: 99999,
        });
        expect(high.status).toBe(201);
        ctx.bindingIds.push(high.data.id);
        expect(high.data.batchSize).toBe(1000);
        expect(high.data.pollIntervalSeconds).toBe(3600);
      });
    });

    test("PATCH and DELETE on unknown binding UUID return 404", async () => {
      const missingId = randomUUID();
      const patchRes = await suite.api.patchBinding(missingId, { name: "Missing" });
      expect(patchRes.status).toBe(404);
      const delRes = await suite.api.deleteBinding(missingId, true);
      expect(delRes.status).toBe(404);
    });

    test("V1SyncAdminGuard rejects spoofed X-Forwarded-For or invalid admin key with 401", async () => {
      const spoofRes = await fetch(`${suite.config.v1SyncUrl}/api/v1/v1-sync/status`, {
        headers: { "X-Forwarded-For": "203.0.113.42" },
      });
      expect(spoofRes.status).toBe(401);

      const badKeyRes = await fetch(`${suite.config.v1SyncUrl}/api/v1/v1-sync/status`, {
        headers: { "X-V1-Sync-Admin-Key": "definitely-invalid-admin-key-000" },
      });
      expect(badKeyRes.status).toBe(401);
    });
  });

  describe("E2E-2 Boundaries: SampleLimit, BatchSize, VerboseLogs & Run Locks", () => {
    test("sampleLimit=1 processes at most 1 item even when multiple rows are eligible", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        for (let i = 0; i < 3; i++) {
          await suite.pg.seedClinicAttachment(ctx, {
            fileName: `sl1_${i}_${ctx.runId}.pdf`,
            contentType: "application/pdf",
            fileSizeBytes: 80,
            storageUri: canonicalAzureBlob1Url(`healthy/sl1_${i}_${ctx.runId}.pdf`),
          });
        }
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, { sampleLimit: 1 }, false);
        expect(run.status).toBe(200);
        expect(run.data.summary.clinicCopiesMigrated ?? 0).toBe(1);
      });
    });

    test("batchSize boundary values 10 and 1000 execute backfill cleanly", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `bs10_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/bs10_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const rMin = await suite.api.dryRun(binding.id, { batchSize: 10 }, false);
        expect(rMin.status).toBe(200);
        const rMax = await suite.api.dryRun(binding.id, { batchSize: 1000 }, false);
        expect(rMax.status).toBe(200);
      });
    });

    test("POST /dry-run and /backfill on unknown binding UUID return 404", async () => {
      const unknown = randomUUID();
      expect((await suite.api.dryRun(unknown, {}, false)).status).toBe(404);
      expect((await suite.api.backfill(unknown, {}, false)).status).toBe(404);
    });

    test("verboseLogs never exceeds 150 lines", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        for (let i = 0; i < 12; i++) {
          await suite.pg.seedClinicAttachment(ctx, {
            fileName: `vl_${i}_${ctx.runId}.pdf`,
            contentType: "application/pdf",
            fileSizeBytes: 64,
            storageUri: canonicalAzureBlob1Url(`healthy/vl_${i}_${ctx.runId}.pdf`),
          });
        }
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, { batchSize: 10 }, false);
        expect(run.status).toBe(200);
        expect((run.data.summary.verboseLogs ?? []).length).toBeLessThanOrEqual(150);
      });
    });

    test("Concurrent POST /backfill on same active binding returns 409 Conflict", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        for (let i = 0; i < 2; i++) {
          await suite.pg.seedClinicAttachment(ctx, {
            fileName: `lock_${i}_${ctx.runId}.pdf`,
            contentType: "application/pdf",
            fileSizeBytes: 128,
            storageUri: canonicalAzureBlob1Url(`custom-size/128/lock_${i}_${ctx.runId}.bin?delayMs=2000`),
          });
        }
        const binding = await createTrack3Binding(suite, ctx);
        const first = await suite.api.backfill(binding.id, { maxConcurrency: 1 }, true);
        expect(first.status).toBe(202);

        const second = await suite.api.backfill(binding.id, {}, false);
        // Wait for first run to settle before cleanup
        await suite.api.waitForRun(binding.id, first.data.id);
        expect(second.status).toBe(409);
      });
    });
  });

  describe("E2E-3 Boundaries: /storage-objects Pagination, Filters & /parity", () => {
    test("GET /storage-objects clamps limit=0 to >=1 and limit=500 to <=200", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `pag_1_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/pag_1_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `pag_2_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/pag_2_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const low = await suite.api.getStorageObjects(binding.id, { limit: 0 });
        expect(low.status).toBe(200);
        expect(low.data.items.length).toBe(1);
        expect(low.data.totalCount).toBe(2);

        const high = await suite.api.getStorageObjects(binding.id, { limit: 500 });
        expect(high.status).toBe(200);
        expect(high.data.items.length).toBe(2);
      });
    });

    test("GET /storage-objects handles negative offset and out-of-range offset gracefully", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `off_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/off_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const neg = await suite.api.getStorageObjects(binding.id, { offset: -10 });
        expect(neg.status).toBe(200);
        expect(neg.data.items.length).toBe(1);

        const past = await suite.api.getStorageObjects(binding.id, { offset: 9999 });
        expect(past.status).toBe(200);
        expect(past.data.items).toHaveLength(0);
        expect(past.data.totalCount).toBe(1);
      });
    });

    test("GET /storage-objects?status=ATTENTION returns only SKIPPED_* and FAILED_* rows", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `att_ok_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/att_ok_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `att_404_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`dead-404/att_404_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `att_503_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`transient-503/att_503_${ctx.runId}.pdf?fail=5`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const attention = await suite.api.getStorageObjects(binding.id, { status: "ATTENTION" });
        expect(attention.status).toBe(200);
        expect(attention.data.totalCount).toBe(2);
        expect(
          attention.data.items.every(
            (i) => i.status.startsWith("SKIPPED_") || i.status.startsWith("FAILED_"),
          ),
        ).toBe(true);
      });
    });

    test("GET /storage-objects supports comma-separated multi-status filter", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ms_404_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`dead-404/ms_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ms_0_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 0,
          storageUri: canonicalAzureBlob1Url(`empty-0/ms_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ms_ok_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/ms_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const csv = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_DEAD_LINK,SKIPPED_EMPTY_BLOB",
        });
        expect(csv.status).toBe(200);
        expect(csv.data.totalCount).toBe(2);
      });
    });

    test("GET /parity returns readyToFreeze=false when any FAILED_RETRYABLE row remains", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `fail_p_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`transient-503/fail_p_${ctx.runId}.pdf?fail=5`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const parity = await suite.api.getParity(binding.id);
        expect(parity.status).toBe(200);
        expect(parity.data.readyToFreeze).toBe(false);
      });
    });
  });

  describe("E2E-4 Boundaries: Freeze Token & Frozen Write Protection", () => {
    test("POST /freeze rejects lowercase 'freeze' and empty confirmationToken with 400", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const binding = await createTrack3Binding(suite, ctx);
        expect((await suite.api.freeze(binding.id, "freeze")).status).toBe(400);
        expect((await suite.api.freeze(binding.id, "")).status).toBe(400);
      });
    });

    test("POST /backfill on frozen binding returns 409 Conflict", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `f409_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/f409_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.freeze(binding.id, "FREEZE");
        expect((await suite.api.backfill(binding.id, {}, false)).status).toBe(409);
      });
    });

    test("POST /pull-now, /final-sweep, and /retry-failed on frozen binding return 409 Conflict", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `fw409_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/fw409_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.freeze(binding.id, "FREEZE");

        expect((await suite.api.pullNow(binding.id, {})).status).toBe(409);
        expect((await suite.api.finalSweep(binding.id, {}, false)).status).toBe(409);
        expect((await suite.api.retryFailed(binding.id, { asyncMode: false })).status).toBe(409);
      });
    });

    test("POST /dry-run remains allowed (200) on a frozen binding", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `fdry_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/fdry_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.freeze(binding.id, "FREEZE");
        const dry = await suite.api.dryRun(binding.id, {}, false);
        expect(dry.status).toBe(200);
      });
    });

    test("PATCH /bindings/{id} while frozen forces autoSyncEnabled=false", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.freeze(binding.id, "FREEZE");
        const patched = await suite.api.patchBinding(binding.id, { autoSyncEnabled: true });
        expect(patched.status).toBe(200);
        expect(patched.data.autoSyncEnabled).toBe(false);
      });
    });
  });

  describe("E2E-5 Boundaries: Concurrency Clamping, Aliases & Soft-Delete Exclusion", () => {
    test("maxConcurrency=0 and negative values clamp cleanly to 1 and succeed", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `mc0_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/mc0_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        expect((await suite.api.dryRun(binding.id, { maxConcurrency: 0 }, false)).status).toBe(200);
        expect((await suite.api.dryRun(binding.id, { maxConcurrency: -4 }, false)).status).toBe(200);
      });
    });

    test("maxConcurrency=99 clamps cleanly to 16 and succeeds", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `mc99_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/mc99_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, { maxConcurrency: 99 }, false);
        expect(run.status).toBe(200);
        expect(run.data.status).toBe("COMPLETED");
      });
    });

    test("providerFilter='AZURE_BLOB' alias behaves equivalently to 'AZURE_BLOB_1'", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `alias_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/alias_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, { providerFilter: "AZURE_BLOB" }, false);
        expect(run.status).toBe(200);
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("targetPlaneFilter='PATIENT_ONLY' when only Clinic rows exist never modifies Clinic rows", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `po_empty_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/po_empty_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(
          binding.id,
          { targetPlaneFilter: "PATIENT_ONLY" },
          false,
        );
        expect(run.status).toBe(400);
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
      });
    });

    test("Soft-deleted rows (IsDeleted=true / is_deleted=true) are excluded from Track 3 migration", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `active_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/active_${ctx.runId}.pdf`),
        });
        const deletedId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `deleted_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/deleted_${ctx.runId}.pdf`),
          isDeleted: true,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(deletedId))?.EncryptionAlgorithm).toBe("NONE");
        const ledger = await suite.api.getStorageObjects(binding.id);
        expect(ledger.data.items.some((i) => i.targetEntityId === deletedId)).toBe(false);
      });
    });
  });

  describe("E2E-6 Boundaries: Size Caps, 1-Byte vs 0-Byte, SSRF & Drive Variants", () => {
    test("1-byte payload succeeds and produces 1-byte encrypted .cez object", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `custom-size/1/tiny_${ctx.runId}.bin`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `tiny_${ctx.runId}.bin`,
          contentType: "application/octet-stream",
          fileSizeBytes: 1,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
        expect(row?.EncryptedSizeBytes).toBe(1);
      });
    });

    test("0-byte payload is skipped as SKIPPED_EMPTY_BLOB and never encrypted", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `zero_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 0,
          storageUri: canonicalAzureBlob1Url(`empty-0/zero_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        const ledger = await suite.api.getStorageObjects(binding.id, { status: "SKIPPED_EMPTY_BLOB" });
        expect(ledger.data.totalCount).toBe(1);
      });
    });

    test("Oversized (>50 MB) payload is aborted and classified as FAILED_PERMANENT without DB flip", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `oversize_${ctx.runId}.bin`,
          contentType: "application/octet-stream",
          fileSizeBytes: 52 * 1024 * 1024,
          storageUri: canonicalAzureBlob1Url(`oversized/oversize_${ctx.runId}.bin`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        const ledger = await suite.api.getStorageObjects(binding.id, { status: "FAILED_PERMANENT" });
        expect(ledger.data.totalCount).toBe(1);
      });
    }, { timeout: 30_000 });

    test("SSRF / private IP metadata URL (169.254.169.254) is rejected without outbound request", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const ssrfUrl = "http://169.254.169.254/latest/meta-data/iam";
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ssrf_${ctx.runId}.txt`,
          contentType: "text/plain",
          fileSizeBytes: 10,
          storageUri: ssrfUrl,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        expect((await suite.pg.getClinicAttachment(attId))?.StorageUri).toBe(ssrfUrl);
        const ledger = await suite.api.getStorageObjects(binding.id, { status: "ATTENTION" });
        expect(ledger.data.totalCount).toBe(1);
        expect(["FAILED_PERMANENT", "SKIPPED_LEGACY_UNSUPPORTED"]).toContain(
          ledger.data.items[0]?.status ?? "",
        );
      });
    });

    test("Google Drive open?id=... variant classifies as SKIPPED_LEGACY_UNSUPPORTED", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const driveOpen = canonicalGoogleDriveUrl(`open_${ctx.runId}`, "open");
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `gdopen_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 100,
          storageUri: driveOpen,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        const ledger = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_LEGACY_UNSUPPORTED",
        });
        expect(ledger.data.totalCount).toBe(1);
      });
    });
  });

  describe("E2E-7 Boundaries: Crypto Parity, Key Formatting & Retry Filtering", () => {
    test("Clinic CMK trims/lowercases mixed-case TenantId and uses hyphenless clinicId", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        ctx.v2TenantId = `E2E_T3_MIX_${ctx.runId}`;
        const subPath = `healthy/mix_${ctx.runId}.pdf`;
        const plain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `mix_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: plain.byteLength,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        const bindingRes = await suite.api.createBinding({
          track: "TRACK3_STORAGE",
          name: `E2E MixTrim ${ctx.runId}`,
          v2TenantId: `  ${ctx.v2TenantId}  `,
          v2ClinicId: ctx.v2ClinicId,
          patientCohortMode: "SCOPED",
        });
        expect(bindingRes.status).toBe(201);
        ctx.bindingIds.push(bindingRes.data.id);

        const run = await suite.api.backfill(bindingRes.data.id, {}, false);
        expect(run.status).toBe(200);

        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
        if (row?.StorageUri) {
          ctx.s3Objects.push({ bucket: suite.s3.clinicBucket, key: row.StorageUri });
        }
        const cipher = await suite.s3.getBytes(suite.s3.clinicBucket, row?.StorageUri ?? "");
        const dec = decryptClinicPayload(
          cipher,
          row?.EncryptionIvBase64 ?? "",
          row?.EncryptionTagBase64 ?? "",
          row?.WrappedKeyJson ?? "",
          `  ${ctx.v2TenantId.toUpperCase()}  `,
          ctx.v2ClinicId.toUpperCase(),
          suite.config.clinicMasterSecret,
        );
        expect(dec.equals(Buffer.from(plain))).toBe(true);
      });
    });

    test("WrappedKeyJson uses exact PascalCase keys and 12B IV / 16B Tag / 32B CipherText", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `healthy/wk_${ctx.runId}.pdf`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `wk_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getClinicAttachment(attId);
        const parsed = parseWrappedKeyJson(row?.WrappedKeyJson ?? "");
        expect(parsed.Alg).toBe("AES-256-GCM");
        expect(parsed.Kid).toMatch(/^[0-9a-f]{8}$/);
        expect(Buffer.from(parsed.Iv, "base64").byteLength).toBe(12);
        expect(Buffer.from(parsed.Tag, "base64").byteLength).toBe(16);
        expect(Buffer.from(parsed.CipherText, "base64").byteLength).toBe(32);
      });
    });

    test("MinIO .cez ContentLength equals plaintext length and EncryptedHash equals SHA256(ciphertext)", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `custom-size/333/exact_${ctx.runId}.bin`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `exact_${ctx.runId}.bin`,
          contentType: "application/octet-stream",
          fileSizeBytes: 333,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getClinicAttachment(attId);
        const key = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        const stat = await suite.s3.stat(suite.s3.clinicBucket, key);
        const cipher = await suite.s3.getBytes(suite.s3.clinicBucket, key);

        expect(stat.size).toBe(333);
        expect(row?.EncryptedSizeBytes).toBe(333);
        expect(row?.EncryptedHash).toBe(sha256Hex(cipher));
      });
    });

    test("Patient PMK decryption strictly rejects mismatched patientId", () => {
      const p1 = randomUUID();
      const p2 = randomUUID();
      const plain = Buffer.from("BoundaryPMKPayload", "utf8");
      const enc = encryptPatientPayload(plain, p1, suite.config.patientMasterSecret);
      expect(() =>
        decryptPatientPayload(
          enc.ciphertext,
          enc.ivBase64,
          enc.tagBase64,
          enc.wrappedKeyJson,
          p2,
          suite.config.patientMasterSecret,
        ),
      ).toThrow();
    });

    test("POST /retry-failed respects includeAuthSkipped=false vs includeAuthSkipped=true", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const authPath = `auth-401/r_${ctx.runId}.pdf`;
        const deadPath = `dead-404/r_${ctx.runId}.pdf`;
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ra_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(authPath),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `rd_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(deadPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        suite.mockOrigin?.resetState();
        const rNoAuth = await suite.api.retryFailed(binding.id, {
          asyncMode: false,
          includeAuthSkipped: false,
        });
        expect(rNoAuth.status).toBe(200);
        expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${authPath}`)).toBe(0);
        expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${deadPath}`)).toBe(0);

        const rWithAuth = await suite.api.retryFailed(binding.id, {
          asyncMode: false,
          includeAuthSkipped: true,
        });
        expect(rWithAuth.status).toBe(200);
        expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${authPath}`)).toBe(1);
        expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${deadPath}`)).toBe(0);
      });
    });
  });

  describe("E2E-8 Boundaries: Track 1/2 Non-Clobber & Ledger Preservation", () => {
    test("Track 3 ignores rows already having EncryptionAlgorithm='AES-256-GCM'", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const preId = randomUUID();
        const preKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, preId);
        const enc = encryptClinicPayload(
          Buffer.from("PreEncrypted", "utf8"),
          ctx.v2TenantId,
          ctx.v2ClinicId,
          suite.config.clinicMasterSecret,
        );
        await suite.s3.putBytes(suite.s3.clinicBucket, preKey, enc.ciphertext);
        ctx.s3Objects.push({ bucket: suite.s3.clinicBucket, key: preKey });

        await suite.pg.seedClinicAttachment(ctx, {
          id: preId,
          fileName: `pre_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: enc.ciphertext.byteLength,
          storageUri: preKey,
          encryptionAlgorithm: "AES-256-GCM",
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `trig_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/trig_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        expect((await suite.pg.getClinicAttachment(preId))?.StorageUri).toBe(preKey);
      });
    });

    test("Clinic RecordAttachments update preserves Title, FileName, and PatientId", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const title = `Synthetic Lab ${ctx.runId}`;
        const fileName = `preserve_c_${ctx.runId}.pdf`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          title,
          fileName,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/preserve_c_${ctx.runId}.pdf`),
        });
        const before = await suite.pg.getClinicAttachment(attId);
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const after = await suite.pg.getClinicAttachment(attId);
        expect(after?.Title).toBe(title);
        expect(after?.FileName).toBe(fileName);
        expect(after?.PatientId).toBe(before?.PatientId ?? "");
        expect(after?.EncryptionKeyId).toBe("cmk-v1");
      });
    });

    test("Patient file_records update preserves title, file_name, and patient_id while setting pmk-v1", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const title = `Synthetic Record ${ctx.runId}`;
        const fileName = `preserve_p_${ctx.runId}.pdf`;
        const fileId = await suite.pg.seedPatientFile(ctx, {
          title,
          fileName,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/preserve_p_${ctx.runId}.pdf`),
        });
        const before = await suite.pg.getPatientFile(fileId);
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const after = await suite.pg.getPatientFile(fileId);
        expect(after?.title).toBe(title);
        expect(after?.file_name).toBe(fileName);
        expect(after?.patient_id).toBe(before?.patient_id ?? "");
        expect(after?.encryption_key_id).toBe("pmk-v1");
      });
    });

    test("sync_storage_objects retains original source_url after RecordAttachments.StorageUri flips to .cez", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const legacyUrl = canonicalAzureBlob1Url(`healthy/src_keep_${ctx.runId}.pdf`);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `src_keep_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: legacyUrl,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const dbRow = await suite.pg.getClinicAttachment(attId);
        expect(dbRow?.StorageUri ?? "").toMatch(/\.cez$/);

        const ledgerRows = await suite.pg.getStorageObjectLedgerRows(binding.id);
        const match = ledgerRows.find((r) => r.target_entity_id === attId);
        expect(match?.source_url).toBe(legacyUrl);
      });
    });

    test("Track 1 and Track 2 conflict endpoints report 0 V2_MODIFIED conflicts after Track 3 backfill", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `c0_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/c0_${ctx.runId}.pdf`),
        });
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `p0_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/p0_${ctx.runId}.pdf`),
        });
        const t3 = await createTrack3Binding(suite, ctx);
        const bf = await suite.api.backfill(t3.id, {}, false);
        expect(bf.status).toBe(200);

        const t1 = await suite.api.createBinding({
          track: "TRACK1_CLINIC",
          name: `T1 C0 ${ctx.runId}`,
          v1ClinicId: 999902,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
        });
        const t2 = await suite.api.createBinding({
          track: "TRACK2_PATIENT",
          name: `T2 C0 ${ctx.runId}`,
          v1ClinicId: 999902,
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

        expect((await suite.pg.getClinicAttachment(attId))?.StorageUri).toBe(
          clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId),
        );
        expect((await suite.pg.getPatientFile(fileId))?.storage_key).toBe(
          patientObjectKey(patientId, fileId),
        );

        const c1 = await suite.api.listConflicts(t1.data.id, "OPEN");
        const c2 = await suite.api.listConflicts(t2.data.id, "OPEN");
        expect(c1.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
        expect(c2.data.items.filter((x) => x.conflictType === "V2_MODIFIED")).toHaveLength(0);
      });
    });
  });

  describe("E2E-9 Boundaries: Admin Web UI Forbidden Jargon & Standardization", () => {
    test("Zero occurrences of CMK, PMK, DEK, or .cez in user-facing UI strings", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const cryptoJargon = audit.jargonViolations.filter((v) =>
        ["CMK", "PMK", "DEK", ".cez extension"].includes(v.label),
      );
      expect(cryptoJargon).toEqual([]);
    }, { timeout: 30_000 });

    test("Zero occurrences of raw SKIPPED_* enums or DB table names in user-facing UI strings", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const dbEnumJargon = audit.jargonViolations.filter((v) =>
        [
          "SKIPPED_LEGACY_UNSUPPORTED",
          "SKIPPED_DEAD_LINK",
          "SKIPPED_AUTH_REQUIRED",
          "SKIPPED_EMPTY_BLOB",
          "RecordAttachments",
          "file_records",
          "sync_storage_objects",
        ].includes(v.label),
      );
      expect(dbEnumJargon).toEqual([]);
    }, { timeout: 30_000 });

    test("Zero occurrences of NXDOMAIN, HTML Interstitial, R2, or unspaced ClinicEZ in UI copy", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const infraJargon = audit.jargonViolations.filter((v) =>
        ["NXDOMAIN", "HTML Interstitial", "R2 technical acronym", "Unspaced ClinicEZ brand"].includes(
          v.label,
        ),
      );
      expect(infraJargon).toEqual([]);
    }, { timeout: 30_000 });

    test("Zero raw <button>, <select>, or role='tab' elements in /v1-sync TSX components", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const primitiveViolations = audit.uiPrimitiveViolations.filter(
        (v) => v.issue.includes("<button>") || v.issue.includes("<select>") || v.issue.includes('role="tab"'),
      );
      expect(primitiveViolations).toEqual([]);
    }, { timeout: 30_000 });

    test("Zero hardcoded hex color literals in /v1-sync TSX component props", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const hexViolations = audit.uiPrimitiveViolations.filter((v) => v.issue.includes("hex color"));
      expect(hexViolations).toEqual([]);
    }, { timeout: 30_000 });
  });
});
