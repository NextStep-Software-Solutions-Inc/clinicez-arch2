import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./lib/config.ts";
import { assertNonProductionEnvironment, assertZeroPhi, redactSecrets } from "./lib/guardrails.ts";
import { V1SyncApiClient } from "./lib/api-client.ts";
import { PgHarness } from "./lib/pg-client.ts";
import { Track3S3Harness } from "./lib/s3-client.ts";

function parseMode(argv: string[]): "smoke" | "live" {
  if (argv.includes("--live")) return "live";
  if (argv.includes("--smoke")) return "smoke";
  return (process.env.E2E_MODE ?? "").trim().toLowerCase() === "live" ? "live" : "smoke";
}

function runCommandOrThrow(cmd: string[], cwd: string, label: string): void {
  const proc = Bun.spawnSync({
    cmd,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${proc.exitCode}.`);
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const suiteRoot = resolve(import.meta.dir);
  const repoRoot = resolve(suiteRoot, "../../..");
  const config = loadConfig();

  console.log(`[e2e-track3] Starting Track 3 E2E runner in --${mode} mode`);
  assertNonProductionEnvironment(config);
  console.log("[e2e-track3] Non-production guardrails passed (zero Neon/VPS targets).");

  // 1. Static TypeScript check
  const tscBin = resolve(repoRoot, "node_modules/.bin/tsc");
  const tsconfigPath = resolve(suiteRoot, "tsconfig.json");
  if (existsSync(tscBin)) {
    console.log("[e2e-track3] Running TypeScript typecheck...");
    runCommandOrThrow([tscBin, "--noEmit", "-p", tsconfigPath], repoRoot, "TypeScript typecheck");
  } else {
    console.log("[e2e-track3] tsc binary not found; running bun build --no-bundle syntax check...");
    runCommandOrThrow(
      ["bun", "build", "--no-bundle", resolve(suiteRoot, "run.ts")],
      repoRoot,
      "Bun syntax check",
    );
  }

  if (mode === "smoke") {
    console.log("[e2e-track3] Running offline smoke test suite...");
    runCommandOrThrow(
      ["bun", "test", resolve(suiteRoot, "tests/smoke.test.ts")],
      repoRoot,
      "Offline smoke tests",
    );
    console.log("[e2e-track3] --smoke PASSED.");
    return;
  }

  // 2. Live mode preflight checks
  const api = new V1SyncApiClient(config);
  const health = await api.health();
  if (!health.ok) {
    throw new Error(
      `v1-sync-api /health probe failed at ${config.v1SyncUrl}/health (${health.status}). Ensure clinicez-v1-sync-api is running.`,
    );
  }

  const status = await api.getStatus();
  if (status.status === 401 || status.status === 403) {
    throw new Error(
      `v1-sync-api /api/v1/v1-sync/status returned ${status.status}. Set V1_SYNC_ADMIN_KEY (matching V1Sync__LocalAdminKey), V1_SYNC_BEARER_TOKEN, or enable V1Sync__AllowUnauthenticatedLocalDev=true in local Development.`,
    );
  }
  if (!status.ok) {
    throw new Error(`v1-sync-api /status failed (${status.status}): ${redactSecrets(status.rawText)}`);
  }

  const pg = new PgHarness(config);
  try {
    await pg.pingAll();
    console.log("[e2e-track3] Local PG17 databases verified (CLINIC, PATIENT, V1_SYNC).");
  } finally {
    await pg.close();
  }

  const s3 = new Track3S3Harness(config);
  await s3.ensureBucketExists(s3.clinicBucket);
  await s3.ensureBucketExists(s3.patientBucket);
  console.log(`[e2e-track3] MinIO buckets verified (${s3.clinicBucket}, ${s3.patientBucket}).`);

  const webProbe = await fetch(config.adminWebUrl);
  if (!webProbe.ok) {
    throw new Error(`admin-web is not reachable at ${config.adminWebUrl} (${webProbe.status}).`);
  }

  if (!config.useLiveAzureSample) {
    let portOccupied = false;
    try {
      await fetch(`http://127.0.0.1:${config.mockOriginPort}/healthz`, {
        signal: AbortSignal.timeout(500),
      });
      portOccupied = true;
    } catch {
      portOccupied = false;
    }
    if (portOccupied) {
      throw new Error(
        `Mock origin port ${config.mockOriginPort} is already in use. Stop the existing listener so each isolated test file can manage mockOrigin in-process.`,
      );
    }
    console.log(
      `[e2e-track3] Mock Azure Blob #1 origin port ${config.mockOriginPort} is free; each isolated test file will manage mockOrigin in-process (container callback ${config.mockOriginContainerUrl}).`,
    );
  }

  const testFiles = [
    resolve(suiteRoot, "tests/tier1_features.test.ts"),
    resolve(suiteRoot, "tests/tier2_boundaries.test.ts"),
    resolve(suiteRoot, "tests/tier3_combinations.test.ts"),
    resolve(suiteRoot, "tests/tier4_scenarios.test.ts"),
  ];
  console.log("[e2e-track3] Executing Tiers 1–4 opaque-box test suites...");
  runCommandOrThrow(["bun", "test", ...testFiles], repoRoot, "Tiers 1–4 E2E suite");
  const doneMsg = "[e2e-track3] --live PASSED (Tiers 1–4).";
  assertZeroPhi(doneMsg, "runner summary");
  console.log(doneMsg);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[e2e-track3] FAILED: ${redactSecrets(message)}`);
  process.exit(1);
});
