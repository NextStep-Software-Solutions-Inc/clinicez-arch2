import { randomUUID } from "node:crypto";
import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { assertNonProductionEnvironment } from "./guardrails.ts";
import { V1SyncApiClient } from "./api-client.ts";
import { PgHarness, type SeededFixtureContext } from "./pg-client.ts";
import { Track3S3Harness } from "./s3-client.ts";
import { startMockOrigin, type MockOriginHandle } from "./mock-origin.ts";

export interface LiveSuiteContext {
  config: E2EConfig;
  api: V1SyncApiClient;
  pg: PgHarness;
  s3: Track3S3Harness;
  mockOrigin: MockOriginHandle | null;
  ownsMockOrigin: boolean;
}

export async function initLiveSuiteContext(): Promise<LiveSuiteContext> {
  const config = loadConfig();
  assertNonProductionEnvironment(config);

  const api = new V1SyncApiClient(config);
  const pg = new PgHarness(config);
  const s3 = new Track3S3Harness(config);

  await pg.pingAll();
  await s3.ensureBucketExists(s3.clinicBucket);
  await s3.ensureBucketExists(s3.patientBucket);

  // Check if run.ts already started mock-origin on mockOriginPort
  let mockOrigin: MockOriginHandle | null = null;
  let ownsMockOrigin = false;
  if (!config.useLiveAzureSample) {
    let alreadyRunning = false;
    try {
      const probe = await fetch(`http://127.0.0.1:${config.mockOriginPort}/healthz`);
      alreadyRunning = probe.ok;
    } catch {
      alreadyRunning = false;
    }

    if (!alreadyRunning) {
      mockOrigin = startMockOrigin(config.mockOriginPort, "0.0.0.0");
      ownsMockOrigin = true;
    }
  }

  return { config, api, pg, s3, mockOrigin, ownsMockOrigin };
}

export async function teardownLiveSuiteContext(suite: LiveSuiteContext): Promise<void> {
  if (suite.ownsMockOrigin && suite.mockOrigin) {
    suite.mockOrigin.stop();
  }
  await suite.pg.close();
}

export async function withSyntheticContext<T>(
  suite: LiveSuiteContext,
  fn: (ctx: SeededFixtureContext) => Promise<T>,
): Promise<T> {
  const runId = randomUUID().replace(/-/g, "").slice(0, 10);
  const ctx = suite.pg.createEmptyContext(runId);
  try {
    return await fn(ctx);
  } finally {
    await suite.pg.cleanupRunFixtures(ctx, suite.s3);
  }
}

export async function createTrack3Binding(
  suite: LiveSuiteContext,
  ctx: SeededFixtureContext,
  overrides: {
    name?: string;
    patientCohortMode?: "SCOPED" | "GLOBAL";
    autoSyncEnabled?: boolean;
    pollIntervalSeconds?: number;
    batchSize?: number;
    v1ClinicId?: number | null;
    v1OrgId?: number | null;
  } = {},
) {
  const res = await suite.api.createBinding({
    track: "TRACK3_STORAGE",
    name: overrides.name ?? `E2E Track3 ${ctx.runId}`,
    v1ClinicId: overrides.v1ClinicId ?? null,
    v1OrgId: overrides.v1OrgId ?? null,
    v2TenantId: ctx.v2TenantId,
    v2ClinicId: ctx.v2ClinicId,
    patientCohortMode: overrides.patientCohortMode ?? "SCOPED",
    autoSyncEnabled: overrides.autoSyncEnabled ?? false,
    pollIntervalSeconds: overrides.pollIntervalSeconds ?? 30,
    batchSize: overrides.batchSize ?? 200,
  });
  if (!res.ok || !res.data?.id) {
    throw new Error(`Failed to create TRACK3_STORAGE binding (${res.status}): ${res.rawText}`);
  }
  ctx.bindingIds.push(res.data.id);
  return res.data;
}
