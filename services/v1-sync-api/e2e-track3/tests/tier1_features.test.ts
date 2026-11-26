import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  clinicObjectKey,
  decryptClinicPayload,
  decryptPatientPayload,
  encryptClinicPayload,
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

describe("Tier 1: Track 3 Functional Features (E2E-1 through E2E-9)", () => {
  let suite: LiveSuiteContext;

  beforeAll(async () => {
    suite = await initLiveSuiteContext();
  });

  afterAll(async () => {
    await teardownLiveSuiteContext(suite);
  });

  describe("E2E-1: TRACK3_STORAGE Binding CRUD & /status Readiness", () => {
    test("GET /health returns healthy liveness probe without auth", async () => {
      const res = await fetch(`${suite.config.v1SyncUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { service: string; status: string };
      expect(body.service).toBe("v1-sync-api");
      expect(body.status).toBe("healthy");
    });

    test("GET /api/v1/v1-sync/status exposes Track 3 R2, encryption, Azure Blob #1, and storage counts", async () => {
      const res = await suite.api.getStatus();
      expect(res.status).toBe(200);
      expect(typeof res.data.clinicR2Connected).toBe("boolean");
      expect(typeof res.data.patientR2Connected).toBe("boolean");
      expect(typeof res.data.clinicEncryptionConfigured).toBe("boolean");
      expect(typeof res.data.patientEncryptionConfigured).toBe("boolean");
      expect(typeof res.data.azureBlob1Configured).toBe("boolean");
      expect(res.data.clinicR2Connected).toBe(true);
      expect(res.data.patientR2Connected).toBe(true);
      expect(res.data.clinicEncryptionConfigured).toBe(true);
      expect(res.data.patientEncryptionConfigured).toBe(true);
      expect(typeof res.data.clinicPendingStorageCount).toBe("number");
      expect(typeof res.data.patientPendingStorageCount).toBe("number");
      expect(typeof res.data.clinicTotalStorageCount).toBe("number");
      expect(typeof res.data.patientTotalStorageCount).toBe("number");
    });

    test("POST /bindings creates TRACK3_STORAGE binding with 201 and appears in GET /bindings", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const created = await suite.api.createBinding({
          track: "TRACK3_STORAGE",
          name: `E2E Tier1 Create ${ctx.runId}`,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          patientCohortMode: "SCOPED",
          autoSyncEnabled: false,
          pollIntervalSeconds: 45,
          batchSize: 50,
        });
        expect(created.status).toBe(201);
        expect(created.data.track).toBe("TRACK3_STORAGE");
        expect(created.data.v2TenantId).toBe(ctx.v2TenantId);
        expect(created.data.v2ClinicId).toBe(ctx.v2ClinicId);
        ctx.bindingIds.push(created.data.id);

        const list = await suite.api.listBindings();
        expect(list.status).toBe(200);
        expect(list.data.some((b) => b.id === created.data.id && b.track === "TRACK3_STORAGE")).toBe(
          true,
        );
      });
    });

    test("PATCH /bindings/{id} updates name, batchSize, pollIntervalSeconds, and patientCohortMode", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const binding = await createTrack3Binding(suite, ctx);
        const patched = await suite.api.patchBinding(binding.id, {
          name: `E2E Patched ${ctx.runId}`,
          batchSize: 120,
          pollIntervalSeconds: 60,
          patientCohortMode: "GLOBAL",
        });
        expect(patched.status).toBe(200);
        expect(patched.data.name).toBe(`E2E Patched ${ctx.runId}`);
        expect(patched.data.batchSize).toBe(120);
        expect(patched.data.pollIntervalSeconds).toBe(60);
        expect(patched.data.patientCohortMode).toBe("GLOBAL");
      });
    });

    test("DELETE /bindings/{id}?force=true removes TRACK3_STORAGE binding", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const binding = await createTrack3Binding(suite, ctx);
        const del = await suite.api.deleteBinding(binding.id, true);
        expect(del.status).toBe(200);
        expect(del.data.deletedId).toBe(binding.id);

        const list = await suite.api.listBindings();
        expect(list.data.some((b) => b.id === binding.id)).toBe(false);
      });
    });
  });

  describe("E2E-2: Dry-Run (SampleLimit=25), Backfill (Limit=25) & Live Progress", () => {
    test("POST /dry-run with sampleLimit=25 completes without writing MinIO .cez or flipping DB rows", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const path = `healthy/dry_${ctx.runId}.pdf`;
        const payload = deterministicPayloadForPath(`/prod/e2e-synthetic/${path}`);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `dry_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: payload.byteLength,
          storageUri: canonicalAzureBlob1Url(path),
        });
        const binding = await createTrack3Binding(suite, ctx);

        const run = await suite.api.dryRun(binding.id, { sampleLimit: 25 }, false);
        expect(run.status).toBe(200);
        expect(run.data.mode).toBe("DRY_RUN");
        expect(run.data.status).toBe("COMPLETED");

        const dbRow = await suite.pg.getClinicAttachment(attId);
        expect(dbRow?.EncryptionAlgorithm).toBe("NONE");
        const r2Key = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        expect(await suite.s3.exists(suite.s3.clinicBucket, r2Key)).toBe(false);
      });
    });

    test("POST /dry-run?asyncMode=true returns 202 and completes in GET /bindings/{id}/runs", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const path = `healthy/async_dry_${ctx.runId}.pdf`;
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `async_dry_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 64,
          storageUri: canonicalAzureBlob1Url(path),
        });
        const binding = await createTrack3Binding(suite, ctx);

        const trigger = await suite.api.dryRun(binding.id, { sampleLimit: 25 }, true);
        expect(trigger.status).toBe(202);
        expect(trigger.data.id).toBeDefined();

        const completed = await suite.api.waitForRun(binding.id, trigger.data.id);
        expect(completed.status).toBe("COMPLETED");
        expect(completed.summary.percentComplete).toBe(100);
      });
    });

    test("POST /backfill with sampleLimit=25 populates bytesDownloaded, bytesUploaded, transferRateMbps, and copy counts", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const cPath = `healthy/bf_c_${ctx.runId}.pdf`;
        const pPath = `healthy/bf_p_${ctx.runId}.png`;
        const cBytes = deterministicPayloadForPath(`/prod/e2e-synthetic/${cPath}`);
        const pBytes = deterministicPayloadForPath(`/prod/e2e-synthetic/${pPath}`);

        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `bf_c_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: cBytes.byteLength,
          storageUri: canonicalAzureBlob1Url(cPath),
        });
        await suite.pg.seedPatientFile(ctx, {
          fileName: `bf_p_${ctx.runId}.png`,
          mimeType: "image/png",
          extension: "png",
          sizeBytes: pBytes.byteLength,
          storageKey: canonicalAzureBlob1Url(pPath),
        });
        const binding = await createTrack3Binding(suite, ctx);

        const run = await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);
        expect(run.status).toBe(200);
        expect(run.data.status).toBe("COMPLETED");
        expect(run.data.summary.bytesDownloaded ?? 0).toBeGreaterThanOrEqual(
          cBytes.byteLength + pBytes.byteLength,
        );
        expect(run.data.summary.bytesUploaded ?? 0).toBeGreaterThanOrEqual(
          cBytes.byteLength + pBytes.byteLength,
        );
        expect(typeof run.data.summary.transferRateMbps).toBe("number");
        expect(run.data.summary.clinicCopiesMigrated ?? 0).toBeGreaterThanOrEqual(1);
        expect(run.data.summary.patientCopiesMigrated ?? 0).toBeGreaterThanOrEqual(1);
      });
    });

    test("SyncRunRecord.summary.verboseLogs records non-empty progress entries with zero PHI", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const path = `healthy/vlog_${ctx.runId}.pdf`;
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `vlog_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(path),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);
        expect(run.status).toBe(200);
        const logs = run.data.summary.verboseLogs ?? [];
        expect(logs.length).toBeGreaterThan(0);
        assertZeroPhi(logs.join("\n"), "backfill verboseLogs");
      });
    });

    test("POST /final-sweep completes and returns run plus ParityReportResponse", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const path = `healthy/sweep_${ctx.runId}.pdf`;
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `sweep_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(path),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const res = await suite.api.finalSweep(binding.id, {}, false);
        expect(res.status).toBe(200);
        expect(res.data.run.mode).toBe("FINAL_SWEEP");
        expect(res.data.run.status).toBe("COMPLETED");
        expect(res.data.parity).toBeDefined();
        expect(res.data.parity?.readyToFreeze).toBe(true);
      });
    });
  });

  describe("E2E-3: /storage-objects Zero-PHI Ledger, /retry-failed & /parity", () => {
    test("GET /storage-objects returns ledger entries with zero PHI (no filenames or raw URLs)", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const path = `healthy/ledger_${ctx.runId}.pdf`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `secret_phi_filename_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(path),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);

        const ledger = await suite.api.getStorageObjects(binding.id);
        expect(ledger.status).toBe(200);
        expect(ledger.data.bindingId).toBe(binding.id);
        expect(ledger.data.totalCount).toBe(1);
        const item = ledger.data.items[0];
        expect(item?.targetEntityId).toBe(attId);
        expect(item?.targetPlane).toBe("CLINIC_ATTACHMENT");
        expect(item?.sourceProvider).toBe("AZURE_BLOB_1");
        expect(["MIGRATED", "VERIFIED"]).toContain(item?.status ?? "");
        expect(ledger.rawText).not.toContain(`secret_phi_filename_${ctx.runId}.pdf`);
        expect(ledger.rawText).not.toContain("clinicezstorage.blob.core.windows.net");
      });
    });

    test("GET /storage-objects filters accurately by status, plane, and provider", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ok_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/f_${ctx.runId}.pdf`),
        });
        await suite.pg.seedPatientFile(ctx, {
          fileName: `drv_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalGoogleDriveUrl(`drv_${ctx.runId}`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);

        const clinicOnly = await suite.api.getStorageObjects(binding.id, {
          plane: "CLINIC_ATTACHMENT",
          provider: "AZURE_BLOB_1",
        });
        expect(clinicOnly.status).toBe(200);
        expect(clinicOnly.data.items.every((i) => i.targetPlane === "CLINIC_ATTACHMENT")).toBe(true);

        const skippedOnly = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_LEGACY_UNSUPPORTED",
        });
        expect(skippedOnly.status).toBe(200);
        expect(skippedOnly.data.totalCount).toBe(1);
        expect(skippedOnly.data.items[0]?.sourceProvider).toBe("GOOGLE_DRIVE");
      });
    });

    test("POST /retry-failed?asyncMode=true resets FAILED_RETRYABLE and succeeds on transient 503 recovery", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const transientPath = `transient-503/retry_${ctx.runId}.pdf`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `retry_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 64,
          storageUri: canonicalAzureBlob1Url(`${transientPath}?fail=3`),
        });
        const binding = await createTrack3Binding(suite, ctx);

        const firstRun = await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);
        expect(firstRun.status).toBe(200);
        const beforeRetry = await suite.api.getStorageObjects(binding.id, { status: "FAILED_RETRYABLE" });
        expect(beforeRetry.data.totalCount).toBe(1);

        const retryRes = await suite.api.retryFailed(binding.id, { asyncMode: true });
        expect(retryRes.status).toBe(202);
        const completed = await suite.api.waitForRun(binding.id, retryRes.data.id);
        expect(completed.status).toBe("COMPLETED");

        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("GET /parity returns readyToFreeze=true once all reachable Azure Blob #1 rows are encrypted", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `par_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/par_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);

        const before = await suite.api.getParity(binding.id);
        expect(before.status).toBe(200);
        expect(before.data.readyToFreeze).toBe(false);

        await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);
        const after = await suite.api.getParity(binding.id);
        expect(after.status).toBe(200);
        expect(after.data.readyToFreeze).toBe(true);
      });
    });

    test("GET /parity treats SKIPPED_* rows as informational (isMatched=true) and readyToFreeze=true", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `ok_p_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/ok_p_${ctx.runId}.pdf`),
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `dead_p_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`dead-404/dead_p_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, { sampleLimit: 25 }, false);

        const parity = await suite.api.getParity(binding.id);
        expect(parity.status).toBe(200);
        expect(parity.data.readyToFreeze).toBe(true);
        expect(parity.data.checks.every((c) => c.isMatched)).toBe(true);
      });
    });
  });

  describe("E2E-4: Auto-Sync / Incremental Pickup & Freeze/Unfreeze", () => {
    test("POST /pull-now picks up newly inserted EncryptionAlgorithm='NONE' rows after initial backfill", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `inc1_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/inc1_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const att2 = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `inc2_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/inc2_${ctx.runId}.pdf`),
        });

        const pull = await suite.api.pullNow(binding.id, {});
        expect(pull.status).toBe(200);
        expect(pull.data.mode).toBe("INCREMENTAL");
        expect(pull.data.status).toBe("COMPLETED");

        const row2 = await suite.pg.getClinicAttachment(att2);
        expect(row2?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("POST /pull-now preserves already-migrated AES-256-GCM rows without re-uploading", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const urlPath = `healthy/idem_${ctx.runId}.pdf`;
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `idem_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(urlPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const beforeRow = await suite.pg.getClinicAttachment(attId);
        const hitsBefore = suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${urlPath}`) ?? 0;

        const pull = await suite.api.pullNow(binding.id, {});
        expect(pull.status).toBe(200);
        const afterRow = await suite.pg.getClinicAttachment(attId);
        const hitsAfter = suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${urlPath}`) ?? 0;

        expect(afterRow?.WrappedKeyJson).toBe(beforeRow?.WrappedKeyJson ?? null);
        expect(hitsAfter).toBe(hitsBefore);
      });
    });

    test("Auto-Sync enabled binding (pollIntervalSeconds=10) is picked up by background worker", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `auto_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/auto_${ctx.runId}.pdf`),
        });
        const statusRes = await suite.api.getStatus();

        if (statusRes.data.backgroundWorkerEnabled) {
          const binding = await createTrack3Binding(suite, ctx, {
            autoSyncEnabled: true,
            pollIntervalSeconds: 10,
          });

          const phHour = (new Date().getUTCHours() + 8) % 24;
          const waitMs = phHour >= 22 || phHour < 6 ? 75_000 : 45_000;
          const deadline = Date.now() + waitMs;
          let migrated = false;
          while (Date.now() < deadline) {
            const row = await suite.pg.getClinicAttachment(attId);
            if (row?.EncryptionAlgorithm === "AES-256-GCM") {
              migrated = true;
              break;
            }
            await Bun.sleep(500);
          }
          expect(migrated).toBe(true);

          const runs = await suite.api.listRuns(binding.id);
          expect(runs.data.some((r) => r.triggeredBy.toLowerCase().includes("autosync"))).toBe(true);
        } else {
          // When worker is explicitly disabled in env, verify PATCH autoSync + INCREMENTAL pull-now directly
          const binding = await createTrack3Binding(suite, ctx, {
            autoSyncEnabled: false,
            pollIntervalSeconds: 10,
          });
          const patched = await suite.api.patchBinding(binding.id, {
            autoSyncEnabled: true,
            pollIntervalSeconds: 10,
          });
          expect(patched.status).toBe(200);
          expect(patched.data.autoSyncEnabled).toBe(true);

          const pull = await suite.api.pullNow(binding.id, {});
          expect(pull.status).toBe(200);
          expect(pull.data.mode).toBe("INCREMENTAL");
          expect(pull.data.status).toBe("COMPLETED");
          expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("AES-256-GCM");
        }
      });
    }, { timeout: 90_000 });

    test("POST /freeze with FREEZE token locks binding, disables autoSync, and returns uninstallSqlHint", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `frz_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/frz_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx, { autoSyncEnabled: true });
        await suite.api.backfill(binding.id, {}, false);

        const freeze = await suite.api.freeze(binding.id, "FREEZE", "E2E cutover verified");
        expect(freeze.status).toBe(200);
        expect(freeze.data.binding.isFrozen).toBe(true);
        expect(freeze.data.binding.autoSyncEnabled).toBe(false);
        expect(freeze.data.uninstallSqlHint).toContain("02_uninstall_v1_sync_changelog.sql");
      });
    });

    test("POST /unfreeze clears isFrozen and re-enables pull-now", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `unfrz_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/unfrz_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.freeze(binding.id, "FREEZE");

        const unfreeze = await suite.api.unfreeze(binding.id);
        expect(unfreeze.status).toBe(200);
        expect(unfreeze.data.isFrozen).toBe(false);

        const pull = await suite.api.pullNow(binding.id, {});
        expect(pull.status).toBe(200);
      });
    });
  });

  describe("E2E-5: Prerequisite Unlock Gating, Filters & Concurrency Bounds", () => {
    test("Rejects Track 3 dry-run, backfill, pull-now, and final-sweep with 400 when 0 Clinic and 0 Patient rows exist in scope", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const emptyBinding = await createTrack3Binding(suite, ctx, {
          patientCohortMode: "SCOPED",
        });
        const dryRes = await suite.api.dryRun(emptyBinding.id, {}, false);
        expect(dryRes.status).toBe(400);

        const bfRes = await suite.api.backfill(emptyBinding.id, {}, false);
        expect(bfRes.status).toBe(400);

        const pullRes = await suite.api.pullNow(emptyBinding.id, {});
        expect(pullRes.status).toBe(400);

        const sweepRes = await suite.api.finalSweep(emptyBinding.id, {}, false);
        expect(sweepRes.status).toBe(400);
      });
    });

    test("Clinic-only rows unlock Track 3 without requiring Track 2 patient files", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `c_only_unlock_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/c_only_unlock_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx, { patientCohortMode: "SCOPED" });
        const run = await suite.api.backfill(binding.id, {}, false);
        expect(run.status).toBe(200);
        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("targetPlaneFilter=CLINIC_ONLY migrates Clinic attachments and leaves Patient files NONE", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `tp_c_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/tp_c_${ctx.runId}.pdf`),
        });
        const fileId = await suite.pg.seedPatientFile(ctx, {
          fileName: `tp_p_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/tp_p_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(
          binding.id,
          { targetPlaneFilter: "CLINIC_ONLY" },
          false,
        );
        expect(run.status).toBe(200);
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("AES-256-GCM");
        expect((await suite.pg.getPatientFile(fileId))?.encryption_algorithm).toBe("NONE");
      });
    });

    test("targetPlaneFilter=PATIENT_ONLY migrates Patient files and leaves Clinic attachments NONE", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `po_c_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/po_c_${ctx.runId}.pdf`),
        });
        const fileId = await suite.pg.seedPatientFile(ctx, {
          fileName: `po_p_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/po_p_${ctx.runId}.pdf`),
        });
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(
          binding.id,
          { targetPlaneFilter: "PATIENT_ONLY" },
          false,
        );
        expect(run.status).toBe(200);
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        expect((await suite.pg.getPatientFile(fileId))?.encryption_algorithm).toBe("AES-256-GCM");
      });
    });

    test("providerFilter=AZURE_BLOB_1 with maxConcurrency=4 migrates Azure Blob #1 rows cleanly", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          ids.push(
            await suite.pg.seedClinicAttachment(ctx, {
              fileName: `conc_${i}_${ctx.runId}.pdf`,
              contentType: "application/pdf",
              fileSizeBytes: 80,
              storageUri: canonicalAzureBlob1Url(`healthy/conc_${i}_${ctx.runId}.pdf`),
            }),
          );
        }
        const driveId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `conc_drv_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalGoogleDriveUrl(`conc_drv_${ctx.runId}`),
        });

        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(
          binding.id,
          { providerFilter: "AZURE_BLOB_1", maxConcurrency: 4 },
          false,
        );
        expect(run.status).toBe(200);
        for (const id of ids) {
          expect((await suite.pg.getClinicAttachment(id))?.EncryptionAlgorithm).toBe("AES-256-GCM");
        }
        expect((await suite.pg.getClinicAttachment(driveId))?.EncryptionAlgorithm).toBe("NONE");
      });
    });
  });

  describe("E2E-6: Resilient Skip Policy (404/410, 0-byte, 401/403/HTML, Drive, Azure #2)", () => {
    test("404 and 410 responses classify as SKIPPED_DEAD_LINK with NONE and original URL untouched", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const u404 = canonicalAzureBlob1Url(`dead-404/m1_${ctx.runId}.pdf`);
        const u410 = canonicalAzureBlob1Url(`dead-410/m2_${ctx.runId}.pdf`);
        const id404 = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `d404_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: u404,
        });
        const id410 = await suite.pg.seedPatientFile(ctx, {
          fileName: `d410_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: u410,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const ledger = await suite.api.getStorageObjects(binding.id, { status: "SKIPPED_DEAD_LINK" });
        expect(ledger.data.totalCount).toBe(2);
        expect((await suite.pg.getClinicAttachment(id404))?.EncryptionAlgorithm).toBe("NONE");
        expect((await suite.pg.getClinicAttachment(id404))?.StorageUri).toBe(u404);
        expect((await suite.pg.getPatientFile(id410))?.encryption_algorithm).toBe("NONE");
        expect((await suite.pg.getPatientFile(id410))?.storage_key).toBe(u410);
      });
    });

    test("0-byte 200 OK response classifies as SKIPPED_EMPTY_BLOB with zero R2 upload", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const u0 = canonicalAzureBlob1Url(`empty-0/z_${ctx.runId}.pdf`);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `z_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 0,
          storageUri: u0,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const ledger = await suite.api.getStorageObjects(binding.id, { status: "SKIPPED_EMPTY_BLOB" });
        expect(ledger.data.totalCount).toBe(1);
        expect((await suite.pg.getClinicAttachment(attId))?.EncryptionAlgorithm).toBe("NONE");
        expect(
          await suite.s3.exists(
            suite.s3.clinicBucket,
            clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId),
          ),
        ).toBe(false);
      });
    });

    test("401 and 403 responses classify as SKIPPED_AUTH_REQUIRED with DB preserved untouched", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const u401 = canonicalAzureBlob1Url(`auth-401/a1_${ctx.runId}.pdf`);
        const u403 = canonicalAzureBlob1Url(`auth-403/a2_${ctx.runId}.pdf`);
        const id1 = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `a401_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: u401,
        });
        const id2 = await suite.pg.seedPatientFile(ctx, {
          fileName: `a403_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: u403,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const ledger = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_AUTH_REQUIRED",
        });
        expect(ledger.data.totalCount).toBe(2);
        expect((await suite.pg.getClinicAttachment(id1))?.StorageUri).toBe(u401);
        expect((await suite.pg.getPatientFile(id2))?.storage_key).toBe(u403);
      });
    });

    test("HTML sign-in wall (text/html and <html> body) classifies as SKIPPED_AUTH_REQUIRED via anti-HTML guard", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const uHtmlHeader = canonicalAzureBlob1Url(`html-wall/login_${ctx.runId}.pdf`);
        const uHtmlBody = canonicalAzureBlob1Url(`html-body-only/login_${ctx.runId}.pdf`);
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `hw_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: uHtmlHeader,
        });
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `hb_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: uHtmlBody,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const ledger = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_AUTH_REQUIRED",
        });
        expect(ledger.data.totalCount).toBe(2);
      });
    });

    test("Google Drive and Azure Blob #2 classify directly as SKIPPED_LEGACY_UNSUPPORTED", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const gDriveUrl = canonicalGoogleDriveUrl(`gd_${ctx.runId}`, "file");
        const az2Url = canonicalAzureBlob2Url(`legacy_${ctx.runId}.pdf`);
        const idDrive = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `gd_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: gDriveUrl,
        });
        const idAz2 = await suite.pg.seedPatientFile(ctx, {
          fileName: `az2_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: az2Url,
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const ledger = await suite.api.getStorageObjects(binding.id, {
          status: "SKIPPED_LEGACY_UNSUPPORTED",
        });
        expect(ledger.data.totalCount).toBe(2);
        expect((await suite.pg.getClinicAttachment(idDrive))?.EncryptionAlgorithm).toBe("NONE");
        expect((await suite.pg.getClinicAttachment(idDrive))?.StorageUri).toBe(gDriveUrl);
        expect((await suite.pg.getPatientFile(idAz2))?.encryption_algorithm).toBe("NONE");
        expect((await suite.pg.getPatientFile(idAz2))?.storage_key).toBe(az2Url);
      });
    });
  });

  describe("E2E-7: Download-Once Encrypt-Twice Isolation, Patient Delete & CMK/PMK Decryption", () => {
    test("Clinic .cez uploads to clinicez-clinic-local with cmk-v1 metadata and decrypts via CMK", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `healthy/cmk_${ctx.runId}.pdf`;
        const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `cmk_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: expectedPlain.byteLength,
          storageUri: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
        expect(row?.EncryptionKeyId).toBe("cmk-v1");
        const expectedKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        expect(row?.StorageUri).toBe(expectedKey);

        const head = await suite.s3.headObjectMetadata(suite.s3.clinicBucket, expectedKey);
        expect(head.exists).toBe(true);
        expect(head.encryption).toBe("AES-256-GCM");
        expect(head.keyScheme).toBe("cmk-v1");

        const cipherBytes = await suite.s3.getBytes(suite.s3.clinicBucket, expectedKey);
        expect(sha256Hex(cipherBytes)).toBe(row?.EncryptedHash ?? "");
        const decrypted = decryptClinicPayload(
          cipherBytes,
          row?.EncryptionIvBase64 ?? "",
          row?.EncryptionTagBase64 ?? "",
          row?.WrappedKeyJson ?? "",
          ctx.v2TenantId,
          ctx.v2ClinicId,
          suite.config.clinicMasterSecret,
        );
        expect(decrypted.equals(Buffer.from(expectedPlain))).toBe(true);
      });
    });

    test("Patient .cez uploads to clinicez-patient-local with pmk-v1 metadata and decrypts via PMK", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `healthy/pmk_${ctx.runId}.png`;
        const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `pmk_${ctx.runId}.png`,
          mimeType: "image/png",
          extension: "png",
          sizeBytes: expectedPlain.byteLength,
          storageKey: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getPatientFile(fileId);
        expect(row?.encryption_algorithm).toBe("AES-256-GCM");
        expect(row?.encryption_key_id).toBe("pmk-v1");
        const expectedKey = patientObjectKey(patientId, fileId);
        expect(row?.storage_key).toBe(expectedKey);

        const head = await suite.s3.headObjectMetadata(suite.s3.patientBucket, expectedKey);
        expect(head.exists).toBe(true);
        expect(head.encryption).toBe("AES-256-GCM");
        expect(head.keyScheme).toBe("pmk-v1");

        const cipherBytes = await suite.s3.getBytes(suite.s3.patientBucket, expectedKey);
        expect(sha256Hex(cipherBytes)).toBe(row?.encrypted_hash ?? "");
        const decrypted = decryptPatientPayload(
          cipherBytes,
          row?.encryption_iv_base64 ?? "",
          row?.encryption_tag_base64 ?? "",
          row?.wrapped_key_json ?? "",
          patientId,
          suite.config.patientMasterSecret,
        );
        expect(decrypted.equals(Buffer.from(expectedPlain))).toBe(true);
      });
    });

    test("Shared source URL uses Download-Once Encrypt-Twice with independent DEKs, IVs, ciphertexts, and wrapped keys", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `shared/overlap_${ctx.runId}.pdf`;
        const fullUrl = canonicalAzureBlob1Url(subPath);
        const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `shared_c_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: expectedPlain.byteLength,
          storageUri: fullUrl,
        });
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `shared_p_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: expectedPlain.byteLength,
          storageKey: fullUrl,
        });

        suite.mockOrigin?.resetState();
        const binding = await createTrack3Binding(suite, ctx);
        const run = await suite.api.backfill(binding.id, {}, false);
        expect(run.status).toBe(200);
        expect(suite.mockOrigin?.getHitCount(`/prod/e2e-synthetic/${subPath}`)).toBe(1);
        expect(run.data.summary.overlapSavedDownloads ?? 0).toBeGreaterThanOrEqual(1);

        const cRow = await suite.pg.getClinicAttachment(attId);
        const pRow = await suite.pg.getPatientFile(fileId);
        expect(cRow?.StorageUri).not.toBe(pRow?.storage_key);
        expect(cRow?.EncryptionIvBase64).not.toBe(pRow?.encryption_iv_base64);
        expect(cRow?.WrappedKeyJson).not.toBe(pRow?.wrapped_key_json);
        expect(cRow?.EncryptedHash).not.toBe(pRow?.encrypted_hash);
      });
    });

    test("Deleting Patient .cez object from MinIO leaves Clinic .cez copy intact and decryptable", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `shared/del_isolation_${ctx.runId}.pdf`;
        const fullUrl = canonicalAzureBlob1Url(subPath);
        const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `del_c_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: expectedPlain.byteLength,
          storageUri: fullUrl,
        });
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `del_p_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: expectedPlain.byteLength,
          storageKey: fullUrl,
        });

        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const pKey = patientObjectKey(patientId, fileId);
        const cKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        await suite.s3.deleteObject(suite.s3.patientBucket, pKey);
        expect(await suite.s3.exists(suite.s3.patientBucket, pKey)).toBe(false);

        expect(await suite.s3.exists(suite.s3.clinicBucket, cKey)).toBe(true);
        const cRow = await suite.pg.getClinicAttachment(attId);
        const cCipher = await suite.s3.getBytes(suite.s3.clinicBucket, cKey);
        const plain = decryptClinicPayload(
          cCipher,
          cRow?.EncryptionIvBase64 ?? "",
          cRow?.EncryptionTagBase64 ?? "",
          cRow?.WrappedKeyJson ?? "",
          ctx.v2TenantId,
          ctx.v2ClinicId,
          suite.config.clinicMasterSecret,
        );
        expect(plain.equals(Buffer.from(expectedPlain))).toBe(true);
      });
    });

    test("PRIVATE / clinic-null patient file stays strictly in Patient R2 and never writes to Clinic R2", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const subPath = `healthy/priv_${ctx.runId}.pdf`;
        const expectedPlain = deterministicPayloadForPath(`/prod/e2e-synthetic/${subPath}`);
        const patientId = await suite.pg.seedPatientAccount(ctx);
        await suite.pg.seedPatientClinicMembership(ctx, patientId);
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          clinicId: null,
          fileName: `priv_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: expectedPlain.byteLength,
          storageKey: canonicalAzureBlob1Url(subPath),
        });
        const binding = await createTrack3Binding(suite, ctx, { patientCohortMode: "SCOPED" });
        const run = await suite.api.backfill(
          binding.id,
          { targetPlaneFilter: "PATIENT_ONLY" },
          false,
        );
        expect(run.status).toBe(200);
        expect(run.data.status).toBe("COMPLETED");

        const pRow = await suite.pg.getPatientFile(fileId);
        expect(pRow?.clinic_id).toBeNull();
        expect(pRow?.encryption_algorithm).toBe("AES-256-GCM");
        expect(pRow?.encryption_key_id).toBe("pmk-v1");

        const pKey = patientObjectKey(patientId, fileId);
        expect(pRow?.storage_key).toBe(pKey);
        expect(await suite.s3.exists(suite.s3.patientBucket, pKey)).toBe(true);

        const cipherBytes = await suite.s3.getBytes(suite.s3.patientBucket, pKey);
        const decrypted = decryptPatientPayload(
          cipherBytes,
          pRow?.encryption_iv_base64 ?? "",
          pRow?.encryption_tag_base64 ?? "",
          pRow?.wrapped_key_json ?? "",
          patientId,
          suite.config.patientMasterSecret,
        );
        expect(decrypted.equals(Buffer.from(expectedPlain))).toBe(true);

        const clinicKeys = await suite.s3.listKeys(suite.s3.clinicBucket, `tenants/${ctx.v2TenantId}/`);
        expect(clinicKeys).toHaveLength(0);
      });
    });
  });

  describe("E2E-8: Track 1 & Track 2 Non-Clobber Interop", () => {
    test("Track 1 dry-run after Track 3 migration produces 0 false V2_MODIFIED conflicts", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `t1nc_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/t1nc_${ctx.runId}.pdf`),
        });
        const t3 = await createTrack3Binding(suite, ctx);
        const bf = await suite.api.backfill(t3.id, {}, false);
        expect(bf.status).toBe(200);

        const t1Res = await suite.api.createBinding({
          track: "TRACK1_CLINIC",
          name: `E2E T1 NonClobber ${ctx.runId}`,
          v1ClinicId: 999901,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
        });
        expect(t1Res.status).toBe(201);
        ctx.bindingIds.push(t1Res.data.id);

        const statusRes = await suite.api.getStatus();
        const t1Dry = await suite.api.dryRun(t1Res.data.id, { sampleLimit: 5 }, false);
        expect(t1Dry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        if (t1Dry.status === 200) {
          expect(t1Dry.data.status).toBe("COMPLETED");
        }

        const expectedKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        const afterAtt = await suite.pg.getClinicAttachment(attId);
        expect(afterAtt?.EncryptionAlgorithm).toBe("AES-256-GCM");
        expect(afterAtt?.StorageUri).toBe(expectedKey);

        const conflicts = await suite.api.listConflicts(t1Res.data.id, "OPEN");
        expect(conflicts.status).toBe(200);
        expect(conflicts.data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
      });
    });

    test("Track 2 dry-run after Track 3 migration produces 0 false V2_MODIFIED conflicts", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `t2nc_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/t2nc_${ctx.runId}.pdf`),
        });
        const t3 = await createTrack3Binding(suite, ctx);
        const bf = await suite.api.backfill(t3.id, {}, false);
        expect(bf.status).toBe(200);

        const t2Res = await suite.api.createBinding({
          track: "TRACK2_PATIENT",
          name: `E2E T2 NonClobber ${ctx.runId}`,
          v1ClinicId: 999901,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          patientCohortMode: "SCOPED",
        });
        expect(t2Res.status).toBe(201);
        ctx.bindingIds.push(t2Res.data.id);

        const statusRes = await suite.api.getStatus();
        const t2Dry = await suite.api.dryRun(t2Res.data.id, { sampleLimit: 5 }, false);
        expect(t2Dry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
        if (t2Dry.status === 200) {
          expect(t2Dry.data.status).toBe("COMPLETED");
        }

        const expectedKey = patientObjectKey(patientId, fileId);
        const afterFile = await suite.pg.getPatientFile(fileId);
        expect(afterFile?.encryption_algorithm).toBe("AES-256-GCM");
        expect(afterFile?.storage_key).toBe(expectedKey);

        const conflicts = await suite.api.listConflicts(t2Res.data.id, "OPEN");
        expect(conflicts.status).toBe(200);
        expect(conflicts.data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
      });
    });

    test("Conditional WHERE EncryptionAlgorithm='NONE' prevents Track 3 from clobbering pre-encrypted native v2 uploads", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const plain = Buffer.from("NativeV2Upload", "utf8");
        const enc = encryptClinicPayload(plain, ctx.v2TenantId, ctx.v2ClinicId, suite.config.clinicMasterSecret);
        const attId = randomUUID();
        const nativeKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);
        await suite.s3.putBytes(suite.s3.clinicBucket, nativeKey, enc.ciphertext);
        ctx.s3Objects.push({ bucket: suite.s3.clinicBucket, key: nativeKey });

        await suite.pg.seedClinicAttachment(ctx, {
          id: attId,
          fileName: `native_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: plain.byteLength,
          storageUri: nativeKey,
          encryptionAlgorithm: "AES-256-GCM",
        });
        // Also seed one unmigrated row so prerequisite gate unlocks
        await suite.pg.seedClinicAttachment(ctx, {
          fileName: `unmig_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 64,
          storageUri: canonicalAzureBlob1Url(`healthy/unmig_${ctx.runId}.pdf`),
        });

        const binding = await createTrack3Binding(suite, ctx);
        await suite.api.backfill(binding.id, {}, false);

        const row = await suite.pg.getClinicAttachment(attId);
        expect(row?.StorageUri).toBe(nativeKey);
        expect(row?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("Existing Track 1 binding pull-now preserves migrated Clinic .cez pointers", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const attId = await suite.pg.seedClinicAttachment(ctx, {
          fileName: `t1_pres_${ctx.runId}.pdf`,
          contentType: "application/pdf",
          fileSizeBytes: 80,
          storageUri: canonicalAzureBlob1Url(`healthy/t1_pres_${ctx.runId}.pdf`),
        });
        const t3 = await createTrack3Binding(suite, ctx);
        expect((await suite.api.backfill(t3.id, {}, false)).status).toBe(200);
        const expectedKey = clinicObjectKey(ctx.v2TenantId, ctx.v2ClinicId, attId);

        const statusRes = await suite.api.getStatus();
        const bindings = await suite.api.listBindings();
        expect(bindings.ok).toBe(true);
        const t1 = bindings.data.find((b) => b.track === "TRACK1_CLINIC" && !b.isFrozen);

        if (t1) {
          const beforeSample = t1.v2ClinicId
            ? await suite.pg.clinicDb<{ Id: string; StorageUri: string }>`
                SELECT "Id"::text AS "Id", "StorageUri"
                FROM "RecordAttachments"
                WHERE "ClinicId" = ${t1.v2ClinicId}::uuid
                  AND "EncryptionAlgorithm" = 'AES-256-GCM'
                  AND "IsDeleted" = false
                LIMIT 5
              `
            : await suite.pg.clinicDb<{ Id: string; StorageUri: string }>`
                SELECT "Id"::text AS "Id", "StorageUri"
                FROM "RecordAttachments"
                WHERE "EncryptionAlgorithm" = 'AES-256-GCM' AND "IsDeleted" = false
                LIMIT 5
              `;
          const pull = await suite.api.pullNow(t1.id, {});
          expect(pull.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
          for (const sample of beforeSample) {
            const after = await suite.pg.getClinicAttachment(sample.Id);
            expect(after?.StorageUri).toBe(sample.StorageUri);
            expect(after?.EncryptionAlgorithm).toBe("AES-256-GCM");
          }
          const c1 = await suite.api.listConflicts(t1.id, "OPEN");
          expect(c1.data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
        }

        const synthT1 = await suite.api.createBinding({
          track: "TRACK1_CLINIC",
          name: `E2E T1 Preserve ${ctx.runId}`,
          v1ClinicId: 999903,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
        });
        expect(synthT1.status).toBe(201);
        ctx.bindingIds.push(synthT1.data.id);

        const synthDry = await suite.api.dryRun(synthT1.data.id, { sampleLimit: 5 }, false);
        expect(synthDry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);

        const afterSynthetic = await suite.pg.getClinicAttachment(attId);
        expect(afterSynthetic?.StorageUri).toBe(expectedKey);
        expect(afterSynthetic?.EncryptionAlgorithm).toBe("AES-256-GCM");
      });
    });

    test("Existing Track 2 binding pull-now preserves migrated Patient .cez pointers", async () => {
      await withSyntheticContext(suite, async (ctx) => {
        const patientId = await suite.pg.seedPatientAccount(ctx);
        const fileId = await suite.pg.seedPatientFile(ctx, {
          patientId,
          fileName: `t2_pres_${ctx.runId}.pdf`,
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 80,
          storageKey: canonicalAzureBlob1Url(`healthy/t2_pres_${ctx.runId}.pdf`),
        });
        const t3 = await createTrack3Binding(suite, ctx);
        expect((await suite.api.backfill(t3.id, {}, false)).status).toBe(200);
        const expectedKey = patientObjectKey(patientId, fileId);

        const statusRes = await suite.api.getStatus();
        const bindings = await suite.api.listBindings();
        expect(bindings.ok).toBe(true);
        const t2 = bindings.data.find((b) => b.track === "TRACK2_PATIENT" && !b.isFrozen);

        if (t2) {
          const beforeSample = await suite.pg.patientDb<{ id: string; storage_key: string }>`
            SELECT id::text AS id, storage_key
            FROM file_records
            WHERE encryption_algorithm = 'AES-256-GCM' AND is_deleted = false
            LIMIT 5
          `;
          const pull = await suite.api.pullNow(t2.id, {});
          expect(pull.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);
          for (const sample of beforeSample) {
            const after = await suite.pg.getPatientFile(sample.id);
            expect(after?.storage_key).toBe(sample.storage_key);
            expect(after?.encryption_algorithm).toBe("AES-256-GCM");
          }
          const c2 = await suite.api.listConflicts(t2.id, "OPEN");
          expect(c2.data.items.filter((c) => c.conflictType === "V2_MODIFIED")).toHaveLength(0);
        }

        const synthT2 = await suite.api.createBinding({
          track: "TRACK2_PATIENT",
          name: `E2E T2 Preserve ${ctx.runId}`,
          v1ClinicId: 999904,
          v2TenantId: ctx.v2TenantId,
          v2ClinicId: ctx.v2ClinicId,
          patientCohortMode: "SCOPED",
        });
        expect(synthT2.status).toBe(201);
        ctx.bindingIds.push(synthT2.data.id);

        const synthDry = await suite.api.dryRun(synthT2.data.id, { sampleLimit: 5 }, false);
        expect(synthDry.status).toBe(statusRes.data.v1SourceConnected ? 200 : 409);

        const afterSynthetic = await suite.pg.getPatientFile(fileId);
        expect(afterSynthetic?.storage_key).toBe(expectedKey);
        expect(afterSynthetic?.encryption_algorithm).toBe("AES-256-GCM");
      });
    });
  });

  describe("E2E-9: /v1-sync Admin Web UI Probe & Zero-Jargon Contract", () => {
    test("Headless Chrome loads ADMIN_WEB_URL/v1-sync with Clinic EZ branding and zero Vite error overlays", () => {
      const probe = probeChromeDom(suite.config, "/v1-sync");
      expect(probe.httpStatus).toBe(200);
      expect(probe.hasClinicEzBrand).toBe(true);
      expect(probe.hasViteErrorOverlay).toBe(false);
    }, { timeout: 30_000 });

    test("Vite dev server compiles and serves all /v1-sync Track 3 route, service, and component modules", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      expect(audit.fetchedPaths.length).toBeGreaterThanOrEqual(10);
    }, { timeout: 30_000 });

    test("Admin Web /v1-sync UI exposes required 3-track and Track 3 filter labels", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const requiredSubset = [
        "File Storage",
        "Both Copies",
        "Clinic Files Only",
        "Patient Files Only",
        "All Sources",
        "Primary Storage Only",
      ];
      for (const label of requiredSubset) {
        expect(audit.missingRequiredLabels).not.toContain(label);
      }
    }, { timeout: 30_000 });

    test("Admin Web /v1-sync UI exposes zero-jargon status chips and Retry Failed action", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      const statusSubset = [
        "Encrypted & Saved",
        "External Link (Kept As-Is)",
        "Unavailable (Kept As-Is)",
        "Needs Access (Kept As-Is)",
        "Transfer Failed",
        "Pending",
        "Retry Failed",
      ];
      for (const label of statusSubset) {
        expect(audit.missingRequiredLabels).not.toContain(label);
      }
    }, { timeout: 30_000 });

    test("Admin Web /v1-sync UI has zero forbidden jargon and zero raw UI primitive violations", async () => {
      const audit = await auditAdminWebTrack3Copy(suite.config);
      expect(audit.jargonViolations).toEqual([]);
      expect(audit.uiPrimitiveViolations).toEqual([]);
    }, { timeout: 30_000 });
  });
});
