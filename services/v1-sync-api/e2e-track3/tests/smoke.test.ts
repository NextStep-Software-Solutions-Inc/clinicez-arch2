import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, hkdfSync, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../lib/config.ts";
import {
  assertNonProductionConnectionString,
  assertNonProductionEnvironment,
  assertNonProductionTargetUrl,
  assertZeroPhi,
  GuardrailViolationError,
  redactSecrets,
} from "../lib/guardrails.ts";
import {
  clinicObjectKey,
  computeKeyId,
  decryptClinicPayload,
  decryptPatientPayload,
  deriveCmk,
  derivePmk,
  encryptClinicPayload,
  encryptPatientPayload,
  formatUuidNoHyphens,
  parseWrappedKeyJson,
  patientObjectKey,
  sha256Hex,
} from "../lib/crypto-parity.ts";
import {
  canonicalAzureBlob1Url,
  canonicalAzureBlob2Url,
  canonicalGoogleDriveUrl,
  deterministicPayloadForPath,
  startMockOrigin,
  type MockOriginHandle,
} from "../lib/mock-origin.ts";
import {
  extractUserFacingUiStrings,
  findUiPrimitiveViolations,
  FORBIDDEN_UI_JARGON_PATTERNS,
} from "../lib/ui-probe.ts";

describe("Track 3 E2E Offline Smoke Suite", () => {
  let mockOrigin: MockOriginHandle;

  beforeAll(() => {
    mockOrigin = startMockOrigin(0, "127.0.0.1");
  });

  afterAll(() => {
    mockOrigin.stop();
  });

  describe("Non-Production Guardrails & Zero-PHI Scanner", () => {
    test("allows default loopback environment configuration", () => {
      const cfg = loadConfig({});
      expect(() => assertNonProductionEnvironment(cfg, {})).not.toThrow();
    });

    test("blocks Neon hostnames and project IDs in URLs and connection strings", () => {
      expect(() =>
        assertNonProductionTargetUrl("https://ep-long-violet.ap-southeast-1.aws.neon.tech", "TEST_URL"),
      ).toThrow(GuardrailViolationError);

      expect(() =>
        assertNonProductionConnectionString(
          "Host=lucky-hall-22094621.ap-southeast-1.aws.neon.tech;Database=neondb;Username=u;Password=p",
          "V1_SOURCE_CONNECTION_STRING",
        ),
      ).toThrow(GuardrailViolationError);
    });

    test("blocks production/dev VPS domains and non-loopback hosts", () => {
      for (const bad of [
        "https://api.clinicez.com",
        "https://admin.clinicez.ph",
        "https://sync.clinicez.net",
        "https://abc123.r2.cloudflarestorage.com",
        "http://10.0.1.45:5099",
      ]) {
        expect(() => assertNonProductionTargetUrl(bad, "BAD_TARGET")).toThrow(GuardrailViolationError);
      }
    });

    test("allows host.docker.internal only when container callback flag is enabled", () => {
      expect(() =>
        assertNonProductionTargetUrl("http://host.docker.internal:5199", "V1_SYNC_URL", false),
      ).toThrow(GuardrailViolationError);
      expect(() =>
        assertNonProductionTargetUrl("http://host.docker.internal:5199", "E2E_MOCK_ORIGIN_CONTAINER_URL", true),
      ).not.toThrow();
    });

    test("scans process env connection strings and blocks remote DB hosts", () => {
      const cfg = loadConfig({});
      expect(() =>
        assertNonProductionEnvironment(cfg, {
          ConnectionStrings__ClinicDb: "Host=prod-db.clinicez.com;Database=CLINIC",
        }),
      ).toThrow(GuardrailViolationError);

      // Challenger env-var bypass vectors must all throw GuardrailViolationError
      const envBypasses: Array<Record<string, string>> = [
        { V1Sync__SourceConnectionString: "Host=10.0.0.1;Database=db" },
        { V1Sync__ClinicDbConnectionString: "Host=192.168.1.10;Database=db" },
        { PG_HOST: "10.0.0.1" },
        { PGHOSTADDR: "10.0.0.1" },
        { POSTGRES_URL: "postgres://u:p@10.0.0.1:5432/db" },
        { DB_DSN: "dbname=db host=10.0.0.1" },
        { Track3Storage__ClinicR2__ServiceUrl: "https://abc.r2.cloudflarestorage.com" },
        { Track3Storage__AzureBlob1OriginOverride: "https://evil.clinicez.com" },
      ];
      for (const envMap of envBypasses) {
        expect(() => assertNonProductionEnvironment(cfg, envMap)).toThrow(GuardrailViolationError);
      }

      // Libpq space-separated host= and URL-encoded neon%2Etech are blocked
      expect(() => assertNonProductionConnectionString("dbname=db host=10.0.0.1", "LIBPQ")).toThrow(
        GuardrailViolationError,
      );
      expect(() =>
        assertNonProductionConnectionString("postgres://u:p@ep-abc.neon%2Etech/db", "ENC"),
      ).toThrow(GuardrailViolationError);

      // GAP-3 multi-Host=, HostAddr=, comma-separated hosts, postgres:// ?host= / ?hostaddr=, AccountId, and PortalApi__BaseUrl bypasses
      for (const multiHostBypass of [
        "Host=127.0.0.1;Host=10.0.1.50;Database=db",
        "Host=127.0.0.1;HostAddr=10.0.1.50;Database=db",
        "Host=127.0.0.1;Server=prod-db.internal;Database=db",
        "Host=127.0.0.1,10.0.1.50;Database=db",
        "postgres://u:p@127.0.0.1:5439/db?host=10.0.1.50",
        "postgresql://u:p@127.0.0.1:5439/db?hostaddr=10.0.1.50",
      ]) {
        expect(() => assertNonProductionConnectionString(multiHostBypass, "BYPASS")).toThrow(
          GuardrailViolationError,
        );
      }

      for (const envBypass of [
        { Track3Storage__ClinicR2__AccountId: "prod_acct" },
        { Track3Storage__PatientR2__AccountId: "prod_patient_acct" },
        { PortalApi__BaseUrl: "https://api.clinicez.com" },
        { CUSTOM_API_BASEURL: "https://10.0.1.50:8080" },
        { REMOTE_SERVICE_URL: "https://10.0.1.50:9000" },
      ] as Array<Record<string, string>>) {
        expect(() => assertNonProductionEnvironment(cfg, envBypass)).toThrow(
          GuardrailViolationError,
        );
      }

      // Container callback override on host.docker.internal is explicitly allowed, and empty AccountId is allowed
      expect(() =>
        assertNonProductionEnvironment(cfg, {
          Track3Storage__AzureBlob1OriginOverride: "http://host.docker.internal:5199",
          Track3Storage__ClinicR2__ServiceUrl: "http://host.docker.internal:9000",
          Track3Storage__ClinicR2__AccountId: "",
          PortalApi__BaseUrl: "http://127.0.0.1:8080",
        }),
      ).not.toThrow();
    });

    test("Zero-PHI scanner rejects real emails, PH mobile numbers, SSNs, addresses, names, SAS sigs, and JWTs", () => {
      expect(() => assertZeroPhi("patient.real@example.org", "email")).toThrow(GuardrailViolationError);
      expect(() => assertZeroPhi("Contact +639171234567", "phone")).toThrow(GuardrailViolationError);
      expect(() => assertZeroPhi("Contact +63 917 123 4567", "spaced-phone")).toThrow(
        GuardrailViolationError,
      );
      expect(() => assertZeroPhi("Contact 0917-123-4567", "dashed-phone")).toThrow(
        GuardrailViolationError,
      );
      expect(() => assertZeroPhi("SSN 123-45-6789", "ssn")).toThrow(GuardrailViolationError);
      expect(() =>
        assertZeroPhi("Patient Maria Santos, 123 Rizal St, Makati", "name-address"),
      ).toThrow(GuardrailViolationError);
      expect(() => assertZeroPhi("https://blob/x?sv=2023-01-01&sig=abc123", "sas")).toThrow(
        GuardrailViolationError,
      );
      expect(() => assertZeroPhi("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig", "jwt")).toThrow(
        GuardrailViolationError,
      );
      expect(() =>
        assertZeroPhi(
          "Synthetic E2E user e2e@synthetic.e2e.invalid E2E-CL-101 e2e_t3_abc Synthetic Patient E2E-123 Patient Files Only",
          "safe",
        ),
      ).not.toThrow();
    });

    test("redactSecrets masks SAS tokens, Bearer tokens, admin keys, and passwords", () => {
      const redacted = redactSecrets(
        "url=https://b/p?sv=2024&sig=SECRET123 Bearer tok_abc Password=pw_secret X-V1-Sync-Admin-Key: key123",
      );
      expect(redacted).not.toContain("SECRET123");
      expect(redacted).not.toContain("tok_abc");
      expect(redacted).not.toContain("pw_secret");
      expect(redacted).not.toContain("key123");
      expect(redacted).toContain("[REDACTED]");
    });
  });

  describe("CMK & PMK Envelope Crypto Parity", () => {
    const clinicSecret = "dev-only-clinic-encryption-secret-never-use-in-production";
    const patientSecret = "dev-patient-encryption-master-secret-32chars-min-ok!";

    test("computes exact 8-char lower-hex KeyId matching SHA256(MasterSecret)[0..4]", () => {
      const expectedClinicKid = createHash("sha256")
        .update(Buffer.from(clinicSecret, "utf8"))
        .digest()
        .subarray(0, 4)
        .toString("hex")
        .toLowerCase();
      expect(computeKeyId(clinicSecret)).toBe(expectedClinicKid);
      expect(computeKeyId(clinicSecret)).toHaveLength(8);
    });

    test("derives exact Clinic CMK via HKDF-SHA256 with trimmed lowercase tenantId and :N clinicId", () => {
      const clinicId = "A1B2C3D4-E5F6-4789-ABCD-0123456789EF";
      const derived1 = deriveCmk(clinicSecret, "  Tenant_Alpha  ", clinicId);
      const derived2 = deriveCmk(clinicSecret, "tenant_alpha", clinicId.toLowerCase());
      const reference = Buffer.from(
        hkdfSync(
          "sha256",
          Buffer.from(clinicSecret, "utf8"),
          Buffer.from("tenant_alpha", "utf8"),
          Buffer.from(`${formatUuidNoHyphens(clinicId)}:ClinicEz:ClinicEncryption:v1`, "utf8"),
          32,
        ),
      );
      expect(derived1.equals(reference)).toBe(true);
      expect(derived2.equals(reference)).toBe(true);
    });

    test("derives exact Patient PMK via HKDF-SHA256 with hyphenated lowercase patientId", () => {
      const patientId = "F1E2D3C4-B5A6-4987-8123-ABCDEF012345";
      const derived = derivePmk(patientSecret, patientId);
      const reference = Buffer.from(
        hkdfSync(
          "sha256",
          Buffer.from(patientSecret, "utf8"),
          Buffer.from(patientId.toLowerCase(), "utf8"),
          Buffer.from("clinicez-pmk-v1", "utf8"),
          32,
        ),
      );
      expect(derived.equals(reference)).toBe(true);
    });

    test("Clinic CMK encrypts raw ciphertext (.cez) + PascalCase WrappedKeyModel and decrypts identically", () => {
      const tenantId = "e2e_t3_smoke";
      const clinicId = randomUUID();
      const plaintext = Buffer.from("%PDF-1.4\nSynthetic Clinic Binary Payload 12345\n", "utf8");

      const enc = encryptClinicPayload(plaintext, tenantId, clinicId, clinicSecret);
      expect(enc.ciphertext.byteLength).toBe(plaintext.byteLength);
      expect(enc.encryptedSizeBytes).toBe(plaintext.byteLength);
      expect(enc.encryptedHash).toBe(sha256Hex(enc.ciphertext));
      expect(enc.encryptionAlgorithm).toBe("AES-256-GCM");
      expect(enc.keyScheme).toBe("cmk-v1");

      const model = parseWrappedKeyJson(enc.wrappedKeyJson);
      expect(model.Alg).toBe("AES-256-GCM");
      expect(model.Kid).toBe(computeKeyId(clinicSecret));
      expect(Buffer.from(model.Iv, "base64").byteLength).toBe(12);
      expect(Buffer.from(model.Tag, "base64").byteLength).toBe(16);
      expect(Buffer.from(model.CipherText, "base64").byteLength).toBe(32);

      const decrypted = decryptClinicPayload(
        enc.ciphertext,
        enc.ivBase64,
        enc.tagBase64,
        enc.wrappedKeyJson,
        tenantId,
        clinicId,
        clinicSecret,
      );
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("Patient PMK encrypts raw ciphertext (.cez) + PascalCase WrappedKeyModel and decrypts identically", () => {
      const patientId = randomUUID();
      const plaintext = Buffer.from("Synthetic Patient Binary Payload 67890", "utf8");

      const enc = encryptPatientPayload(plaintext, patientId, patientSecret);
      expect(enc.ciphertext.byteLength).toBe(plaintext.byteLength);
      expect(enc.keyScheme).toBe("pmk-v1");
      const decrypted = decryptPatientPayload(
        enc.ciphertext,
        enc.ivBase64,
        enc.tagBase64,
        enc.wrappedKeyJson,
        patientId,
        patientSecret,
      );
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test("rejects wrong tenant, wrong clinic, wrong patient, wrong secret, and tampered ciphertext", () => {
      const tenantId = "e2e_t3_iso";
      const clinicId = randomUUID();
      const patientId = randomUUID();
      const payload = Buffer.from("IsolationCheckPayload", "utf8");

      const cEnc = encryptClinicPayload(payload, tenantId, clinicId, clinicSecret);
      expect(() =>
        decryptClinicPayload(
          cEnc.ciphertext,
          cEnc.ivBase64,
          cEnc.tagBase64,
          cEnc.wrappedKeyJson,
          "wrong_tenant",
          clinicId,
          clinicSecret,
        ),
      ).toThrow();

      expect(() =>
        decryptClinicPayload(
          cEnc.ciphertext,
          cEnc.ivBase64,
          cEnc.tagBase64,
          cEnc.wrappedKeyJson,
          tenantId,
          randomUUID(),
          clinicSecret,
        ),
      ).toThrow();

      const tampered = Buffer.from(cEnc.ciphertext);
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;
      expect(() =>
        decryptClinicPayload(
          tampered,
          cEnc.ivBase64,
          cEnc.tagBase64,
          cEnc.wrappedKeyJson,
          tenantId,
          clinicId,
          clinicSecret,
        ),
      ).toThrow();

      const pEnc = encryptPatientPayload(payload, patientId, patientSecret);
      expect(() =>
        decryptPatientPayload(
          pEnc.ciphertext,
          pEnc.ivBase64,
          pEnc.tagBase64,
          pEnc.wrappedKeyJson,
          randomUUID(),
          patientSecret,
        ),
      ).toThrow();
    });

    test("formats deterministic Clinic and Patient .cez R2 keys", () => {
      const clinicId = "ABCDEF01-2345-6789-ABCD-EF0123456789";
      const attId = "11111111-2222-3333-4444-555555555555";
      const patientId = "99999999-8888-7777-6666-555555555555";
      const fileId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

      expect(clinicObjectKey("tenant-1", clinicId, attId)).toBe(
        "tenants/tenant-1/clinics/abcdef01-2345-6789-abcd-ef0123456789/records/11111111-2222-3333-4444-555555555555.cez",
      );
      expect(patientObjectKey(patientId, fileId)).toBe(
        "patients/99999999-8888-7777-6666-555555555555/records/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.cez",
      );
    });
  });

  describe("Mock Origin HTTP Server & UI Copy Audit Self-Checks", () => {
    test("serves deterministic healthy, shared, custom-size, and canonical URL fixtures", async () => {
      const path = "/prod/e2e-synthetic/healthy/sample.pdf";
      const res = await fetch(`${mockOrigin.baseUrl}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/pdf");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Buffer.from(bytes).equals(Buffer.from(deterministicPayloadForPath(path)))).toBe(true);
      expect(mockOrigin.getHitCount(path)).toBe(1);

      const sized = await fetch(`${mockOrigin.baseUrl}/prod/e2e-synthetic/custom-size/128/data.bin`);
      expect(sized.status).toBe(200);
      expect((await sized.arrayBuffer()).byteLength).toBe(128);

      expect(canonicalAzureBlob1Url("healthy/a.pdf")).toBe(
        "https://clinicezstorage.blob.core.windows.net/prod/e2e-synthetic/healthy/a.pdf",
      );
      expect(canonicalAzureBlob2Url("old/a.pdf")).toBe(
        "https://clinicez.blob.core.windows.net/clinicez/e2e-synthetic/old/a.pdf",
      );
      expect(canonicalGoogleDriveUrl("doc123", "file")).toBe(
        "https://drive.google.com/file/d/doc123/view",
      );
      expect(canonicalGoogleDriveUrl("doc123", "open")).toBe(
        "https://drive.google.com/open?id=doc123",
      );
    });

    test("simulates 404, 410, 0-byte, 401, 403, HTML interstitials, and stateful 503/429 retries", async () => {
      const cases: Array<[string, number]> = [
        ["/prod/e2e-synthetic/dead-404/a.pdf", 404],
        ["/prod/e2e-synthetic/dead-410/a.pdf", 410],
        ["/prod/e2e-synthetic/empty-0/a.pdf", 200],
        ["/prod/e2e-synthetic/auth-401/a.pdf", 401],
        ["/prod/e2e-synthetic/auth-403/a.pdf", 403],
        ["/prod/e2e-synthetic/html-wall/a.pdf", 200],
        ["/prod/e2e-synthetic/html-body-only/a.pdf", 200],
      ];

      for (const [path, status] of cases) {
        const res = await fetch(`${mockOrigin.baseUrl}${path}`);
        expect(res.status).toBe(status);
        const buf = await res.arrayBuffer();
        if (path.includes("empty-0")) {
          expect(buf.byteLength).toBe(0);
        }
        if (path.includes("html-wall")) {
          expect(res.headers.get("content-type")).toContain("text/html");
          expect(Buffer.from(buf).toString("utf8")).toContain("<!DOCTYPE html>");
        }
        if (path.includes("html-body-only")) {
          expect(Buffer.from(buf).toString("utf8")).toContain("<html>");
        }
      }

      // Transient 503 (default 1 failure -> 200)
      const p503 = "/prod/e2e-synthetic/transient-503/r1.pdf";
      expect((await fetch(`${mockOrigin.baseUrl}${p503}`)).status).toBe(503);
      expect((await fetch(`${mockOrigin.baseUrl}${p503}`)).status).toBe(200);

      // Transient 429 (?fail=2 -> 429, 429, 200)
      const p429 = "/prod/e2e-synthetic/transient-429/r2.pdf?fail=2";
      expect((await fetch(`${mockOrigin.baseUrl}${p429}`)).status).toBe(429);
      expect((await fetch(`${mockOrigin.baseUrl}${p429}`)).status).toBe(429);
      expect((await fetch(`${mockOrigin.baseUrl}${p429}`)).status).toBe(200);

      // Bounded ?delayMs= support for deterministic concurrency lock tests
      const t0 = Date.now();
      const delayed = await fetch(`${mockOrigin.baseUrl}/prod/e2e-synthetic/healthy/delay.pdf?delayMs=120`);
      const elapsed = Date.now() - t0;
      expect(delayed.status).toBe(200);
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    test("extractUserFacingUiStrings and findUiPrimitiveViolations catch leaky JSX/hex and allow API query option values", () => {
      const sampleJs = `
        const STORAGE_ATTENTION_STATUS_OPTIONS = [
          { value: "SKIPPED_DEAD_LINK,SKIPPED_EMPTY_BLOB", label: "Unavailable (Kept As-Is)" },
          { value: "SKIPPED_AUTH_REQUIRED", label: "Needs Access (Kept As-Is)" },
        ];
        function labelForStatus(status) {
          switch (status) {
            case "SKIPPED_DEAD_LINK": return "Unavailable (Kept As-Is)";
            case "SKIPPED_AUTH_REQUIRED": return "Needs Access (Kept As-Is)";
            default: return "Pending";
          }
        }
        jsxDEV("span", { children: "File Storage", "aria-label": "Storage status" });
      `;
      const extracted = extractUserFacingUiStrings(sampleJs, false);
      expect(extracted).toContain("Unavailable (Kept As-Is)");
      expect(extracted).toContain("Needs Access (Kept As-Is)");
      expect(extracted).toContain("File Storage");
      expect(extracted).toContain("Storage status");
      expect(extracted).not.toContain("SKIPPED_DEAD_LINK");
      expect(extracted).not.toContain("SKIPPED_DEAD_LINK,SKIPPED_EMPTY_BLOB");
      expect(extracted).not.toContain("SKIPPED_AUTH_REQUIRED");
      for (const str of extracted) {
        for (const rule of FORBIDDEN_UI_JARGON_PATTERNS) {
          expect(rule.regex.test(str)).toBe(false);
        }
      }

      // Variable-bound template literal leak must be detected
      const leakyCopyJs = `
        const banner = \`Encrypted via CMK in R2 (.cez)\`;
        jsxDEV("div", { children: banner });
      `;
      const leakyExtracted = extractUserFacingUiStrings(leakyCopyJs, false);
      expect(leakyExtracted.some((s) => /\bCMK\b/.test(s) && /\bR2\b/.test(s) && /\.cez\b/.test(s))).toBe(true);

      // Production jsx("button"), backgroundColor hex, role: "tab" must be flagged
      const leakyPrimitivesJs = `
        jsx("button", { children: "Click" });
        jsxs("select", { children: [] });
        jsx("div", { role: "tab", style: { backgroundColor: "#ff0000" }, className: "bg-[#123456]" });
      `;
      const primViolations = findUiPrimitiveViolations("/src/Test.tsx", leakyPrimitivesJs);
      expect(primViolations.some((v) => v.issue.includes("<button>"))).toBe(true);
      expect(primViolations.some((v) => v.issue.includes("<select>"))).toBe(true);
      expect(primViolations.some((v) => v.issue.includes('role="tab"'))).toBe(true);
      expect(primViolations.some((v) => v.issue.includes("backgroundColor"))).toBe(true);
      expect(primViolations.some((v) => v.issue.includes("bg-[#123456]"))).toBe(true);
    });
  });

  describe("Static Tier 1–4 Suite Structure & Safety Audit", () => {
    const suiteDir = resolve(import.meta.dir);

    test("Tier 1–4 test files exist and satisfy minimum test case counts", () => {
      const requirements: Array<[string, number]> = [
        ["tier1_features.test.ts", 45],
        ["tier2_boundaries.test.ts", 45],
        ["tier3_combinations.test.ts", 9],
        ["tier4_scenarios.test.ts", 5],
      ];

      for (const [file, minTests] of requirements) {
        const fullPath = resolve(suiteDir, file);
        expect(existsSync(fullPath)).toBe(true);
        const content = readFileSync(fullPath, "utf8");
        const testMatches = content.match(/\b(?:test|it)\s*\(/g) ?? [];
        expect(testMatches.length).toBeGreaterThanOrEqual(minTests);
        assertZeroPhi(content, file);
        expect(content.toLowerCase()).not.toContain("neon.tech");
        expect(content.toLowerCase()).not.toContain("lucky-hall-22094621");
        expect(content.toLowerCase()).not.toContain("clinicez.com");
      }
    });
  });
});
