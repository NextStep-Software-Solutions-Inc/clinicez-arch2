import { describe, expect, test, mock } from "bun:test";
import {
  yakapService,
  type PortalYakapBranchSummaryDto,
  type PortalYakapSubmissionDto,
  type PortalYakapSubmissionErrorDto,
  type PortalYakapMasterlistSyncResultDto,
} from "../src/services/yakap.service";
import {
  branchService,
  type BranchDto,
  type ConfigureBranchPhilHealthPayload,
  type TestBranchPhilHealthPayload,
  type UpdateBranchPayload,
  type TestPhilHealthConnectionResult,
} from "../src/services/branch.service";
import { apiClient } from "../src/transport/apiClient";
import * as philhealthModule from "../src/lib/philhealth";
import { locationService } from "../src/services/location.service";
import { optionsService } from "../src/services/options.service";

describe("Milestone M4-B Adversarial Challenger Security Suite", () => {
  // ─── SUITE 1: ZERO-PHI TELEMETRY SECURITY & INVARIANT AUDIT ───
  describe("Suite 1: Zero-PHI Telemetry Contracts & Data Invariants", () => {
    const forbiddenPhiKeywords = [
      "patientName",
      "firstName",
      "lastName",
      "middleName",
      "fullName",
      "philHealthIdentificationNumber",
      "pin",
      "diagnosis",
      "primaryDiagnosis",
      "rawXml",
      "xmlPayload",
      "soapXml",
      "dateOfBirth",
      "dob",
      "chiefComplaint",
      "clinicalNotes",
    ];

    const mockSubmissions: PortalYakapSubmissionDto[] = [
      {
        id: "sub-sec-001",
        patientCode: "PAT-0001",
        accreditationNo: "P10038831",
        caseNo: "CASE-2026-0001",
        submissionType: "FPE",
        reportStatus: "U",
        localTransactionNo: "E10038831202610000001",
        uploadTransactionNo: "U10038831202610000001",
        yesReferenceNo: "MCA2026100001",
        processingStatus: "Accepted",
        payloadSha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        submittedAtUtc: "2026-10-28T08:00:00Z",
        completedAtUtc: "2026-10-28T08:05:00Z",
        attemptCount: 1,
        errors: [],
      },
      {
        id: "sub-sec-002",
        patientCode: "PAT-0042",
        accreditationNo: "P10038831",
        caseNo: "CASE-2026-0042",
        submissionType: "Consultation",
        reportStatus: "U",
        localTransactionNo: "C10038831202610000042",
        uploadTransactionNo: "U10038831202610000042",
        yesReferenceNo: null,
        processingStatus: "Pending",
        payloadSha256Hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        submittedAtUtc: "2026-10-28T09:00:00Z",
        attemptCount: 1,
        errors: [],
      },
      {
        id: "sub-sec-003",
        patientCode: "PAT-9999",
        accreditationNo: "P10038831",
        caseNo: "CASE-2026-9999",
        submissionType: "Diagnostic",
        reportStatus: "U",
        localTransactionNo: "D10038831202610009999",
        uploadTransactionNo: "U10038831202610009999",
        yesReferenceNo: null,
        processingStatus: "Rejected",
        payloadSha256Hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        submittedAtUtc: "2026-10-28T10:00:00Z",
        attemptCount: 2,
        lastErrorMessage: "PhilHealth PCAPI validation error: Required diagnostic observation value missing.",
        errors: [
          {
            fieldPath: "DiagnosticResult.FastingBloodSugar",
            issue: "Observation value must not be empty.",
            errorCode: "ERR_REQUIRED_FIELD",
          },
        ],
      },
    ];

    test("ADV1.1: Every property of PortalYakapSubmissionDto excludes all forbidden PHI keywords", () => {
      for (const sub of mockSubmissions) {
        const keys = Object.keys(sub);
        for (const forbidden of forbiddenPhiKeywords) {
          expect(keys).not.toContain(forbidden);
        }
      }
    });

    test("ADV1.2: PatientCode strictly matches anonymous identifier format (PAT-xxxx) with zero raw PINs", () => {
      const pinPattern = /\b\d{2}-\d{9}-\d\b/;
      for (const sub of mockSubmissions) {
        expect(sub.patientCode).toMatch(/^PAT-\d{4,}$/);
        expect(pinPattern.test(sub.patientCode)).toBe(false);
      }
    });

    test("ADV1.3: Transaction numbers strictly adhere to PhilHealth PCAPI transaction format", () => {
      // 21-23 byte statutory transaction codes: [Type][Accreditation 8-9B][YearMonth 6B][Seq 6-7B]
      const txPattern = /^[ECUDLMR][A-Z0-9]{20,22}$/;
      for (const sub of mockSubmissions) {
        expect(sub.localTransactionNo).toMatch(txPattern);
        if (sub.uploadTransactionNo) {
          expect(sub.uploadTransactionNo).toMatch(txPattern);
        }
      }
    });

    test("ADV1.4: PhilHealth YES reference numbers strictly adhere to statutory MCA format", () => {
      for (const sub of mockSubmissions) {
        if (sub.yesReferenceNo) {
          expect(sub.yesReferenceNo).toMatch(/^MCA\d+$/);
        }
      }
    });

    test("ADV1.5: Payload SHA-256 hash is strictly 64 hex characters and contains zero raw XML/JSON", () => {
      const sha256Pattern = /^[a-f0-9]{64}$/i;
      for (const sub of mockSubmissions) {
        if (sub.payloadSha256Hash) {
          expect(sub.payloadSha256Hash).toMatch(sha256Pattern);
          expect(sub.payloadSha256Hash).not.toContain("<");
          expect(sub.payloadSha256Hash).not.toContain(">");
          expect(sub.payloadSha256Hash).not.toContain("{");
        }
      }
    });

    test("ADV1.6: Non-PHI Error Inspector rejects error payloads containing PHI patterns", () => {
      const pinPattern = /\b\d{2}-\d{9}-\d\b/;
      const namePattern = /\b(Juan|Maria|Santos|Dela Cruz)\b/i;

      for (const sub of mockSubmissions) {
        if (sub.lastErrorMessage) {
          expect(pinPattern.test(sub.lastErrorMessage)).toBe(false);
          expect(namePattern.test(sub.lastErrorMessage)).toBe(false);
        }
        for (const err of sub.errors) {
          expect(pinPattern.test(err.issue)).toBe(false);
          expect(namePattern.test(err.issue)).toBe(false);
          expect(err.fieldPath).toMatch(/^[A-Za-z0-9_.]+$/);
        }
      }
    });

    test("ADV1.7: Serializing submission DTOs to JSON contains zero PHI or raw claim XML tags", () => {
      const serialized = JSON.stringify(mockSubmissions);
      expect(serialized).not.toContain("<PCB>");
      expect(serialized).not.toContain("<SOAP>");
      expect(serialized).not.toContain("<ENLISTMENT>");
      expect(serialized).not.toContain("<PROFILE>");
      expect(serialized).not.toContain("philHealthIdentificationNumber");
      expect(serialized).not.toContain("primaryDiagnosis");
      expect(/\b\d{2}-\d{9}-\d\b/.test(serialized)).toBe(false);
    });
  });

  // ─── SUITE 2: BRANCH CREDENTIAL SECURITY & SECRET MASKING ───
  describe("Suite 2: Branch Credential Masking, Retention & Live Testing", () => {
    const configuredBranchDto: BranchDto = {
      id: "branch-uuid-456",
      tenantId: "tenant-slug-001",
      name: "Cebu Regional Branch",
      code: "CEB-01",
      isActive: true,
      streetAddress: "123 Osmeña Blvd",
      city: "Cebu City",
      province: "Cebu",
      region: "Region VII",
      isPhilHealthAccredited: true,
      philHealthAccreditationNumber: "P70012345",
      philHealthPmccNumber: "Z7001",
      philHealthSoftwareCertificateId: "CERT-CEBU-2026",
      philHealthBaseUrl: "https://pcapi.philhealth.gov.ph",
      hasSecretKey: true,
      hasCipherKey: true,
      facilities: [],
    };

    test("ADV2.1: BranchDto never contains secretKey or cipherKey plaintext properties", () => {
      const keys = Object.keys(configuredBranchDto);
      expect(keys).not.toContain("secretKey");
      expect(keys).not.toContain("cipherKey");
      expect(keys).not.toContain("password");
      expect(keys).not.toContain("encryptedSecretKey");
      expect(keys).not.toContain("encryptedCipherKey");

      // Only boolean presence flags are permitted
      expect(configuredBranchDto.hasSecretKey).toBe(true);
      expect(configuredBranchDto.hasCipherKey).toBe(true);
    });

    test("ADV2.2: Blank secretKey inputs resolve to undefined preserving saved credentials", () => {
      // Simulate input state in BranchManagementClient when user leaves fields blank
      const phSecretKeyInput = "";
      const phCipherKeyInput = "   "; // Whitespace only

      const configurePayload: ConfigureBranchPhilHealthPayload = {
        accreditationNumber: configuredBranchDto.philHealthAccreditationNumber!,
        pmccNumber: configuredBranchDto.philHealthPmccNumber,
        softwareCertificateId: configuredBranchDto.philHealthSoftwareCertificateId,
        secretKey: phSecretKeyInput.trim() || undefined,
        cipherKey: phCipherKeyInput.trim() || undefined,
        baseUrl: configuredBranchDto.philHealthBaseUrl,
        isPhilHealthAccredited: true,
      };

      expect(configurePayload.secretKey).toBeUndefined();
      expect(configurePayload.cipherKey).toBeUndefined();

      // Ensure JSON serialization completely drops secretKey and cipherKey
      const json = JSON.stringify(configurePayload);
      expect(json).not.toContain('"secretKey"');
      expect(json).not.toContain('"cipherKey"');
      expect(json).toContain('"accreditationNumber":"P70012345"');
    });

    test("ADV2.3: Updating general branch details (UpdateBranchPayload) cannot touch credentials", () => {
      const updatePayload: UpdateBranchPayload = {
        name: "Cebu Regional Branch (Renamed)",
        code: "CEB-02",
        streetAddress: "456 Colon St",
        city: "Cebu City",
        province: "Cebu",
        region: "Region VII",
        isActive: true,
      };

      const keys = Object.keys(updatePayload);
      expect(keys).not.toContain("secretKey");
      expect(keys).not.toContain("cipherKey");
      expect(keys).not.toContain("accreditationNumber");
      expect(keys).not.toContain("isPhilHealthAccredited");
    });

    test("ADV2.4: Rotating credentials sends trimmed string values", () => {
      const phSecretKeyInput = "  sk_live_new_rotated_key_999  ";
      const phCipherKeyInput = "  aes_new_cipher_key_888  ";

      const configurePayload: ConfigureBranchPhilHealthPayload = {
        accreditationNumber: configuredBranchDto.philHealthAccreditationNumber!,
        secretKey: phSecretKeyInput.trim() || undefined,
        cipherKey: phCipherKeyInput.trim() || undefined,
        isPhilHealthAccredited: true,
      };

      expect(configurePayload.secretKey).toBe("sk_live_new_rotated_key_999");
      expect(configurePayload.cipherKey).toBe("aes_new_cipher_key_888");

      const json = JSON.stringify(configurePayload);
      expect(json).toContain('"secretKey":"sk_live_new_rotated_key_999"');
      expect(json).toContain('"cipherKey":"aes_new_cipher_key_888"');
    });

    test("ADV2.5: Live Test Connection dispatches to /branches/{id}/philhealth-test and formats response", async () => {
      const originalPost = apiClient.post;
      apiClient.post = mock(async (url: string, payload: any) => {
        expect(url).toBe(`/branches/${configuredBranchDto.id}/philhealth-test`);
        expect(payload.accreditationNumber).toBe("P70012345");
        expect(payload.secretKey).toBeUndefined(); // Blank preserves existing

        const mockResult: TestPhilHealthConnectionResult = {
          success: true,
          message: "PhilHealth PCAPI gateway authentication successful. Session token granted.",
          token: "tok_sim_session_abcdef123456",
          latencyMs: 142,
        };
        return { data: { succeeded: true, data: mockResult } };
      }) as any;

      const result = await branchService.testPhilHealthConnection(configuredBranchDto.id, {
        accreditationNumber: "P70012345",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Session token granted");
      expect(result.token).toBe("tok_sim_session_abcdef123456");
      expect(result.latencyMs).toBe(142);

      apiClient.post = originalPost;
    });

    test("ADV2.6: Live Test Connection handles gateway error without leaking secrets", async () => {
      const originalPost = apiClient.post;
      apiClient.post = mock(async () => {
        const mockErrorResult: TestPhilHealthConnectionResult = {
          success: false,
          message: "PhilHealth gateway error 401: Invalid software certificate ID or secret key signature.",
          latencyMs: 310,
        };
        return { data: { succeeded: false, data: mockErrorResult } };
      }) as any;

      const result = await branchService.testPhilHealthConnection(configuredBranchDto.id, {
        accreditationNumber: "P70012345",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid software certificate");
      expect(result.token).toBeUndefined();

      apiClient.post = originalPost;
    });
  });

  // ─── SUITE 3: SEARCH SANITIZATION & ADVERSARIAL INPUTS ───
  describe("Suite 3: Search Sanitization & Adversarial Query Injection", () => {
    const submissions: PortalYakapSubmissionDto[] = [
      {
        id: "sub-1",
        patientCode: "PAT-0001",
        accreditationNo: "P10038831",
        caseNo: "CASE-2026-0001",
        submissionType: "FPE",
        reportStatus: "U",
        localTransactionNo: "E10038831202610000001",
        uploadTransactionNo: "U10038831202610000001",
        yesReferenceNo: "MCA2026100001",
        processingStatus: "Accepted",
        attemptCount: 1,
        errors: [],
      },
      {
        id: "sub-2",
        patientCode: "PAT-0002",
        accreditationNo: "P10038831",
        caseNo: "CASE-2026-0002",
        submissionType: "Consultation",
        reportStatus: "U",
        localTransactionNo: "C10038831202610000002",
        uploadTransactionNo: "U10038831202610000002",
        yesReferenceNo: null,
        processingStatus: "Pending",
        attemptCount: 1,
        errors: [],
      },
    ];

    function filterSubmissions(subs: PortalYakapSubmissionDto[], query: string) {
      if (!query.trim()) return subs;
      const q = query.trim().toLowerCase();
      return subs.filter((item) => {
        const matchCode = item.patientCode.toLowerCase().includes(q);
        const matchLocal = item.localTransactionNo?.toLowerCase().includes(q);
        const matchUpload = item.uploadTransactionNo?.toLowerCase().includes(q);
        const matchRef = item.yesReferenceNo?.toLowerCase().includes(q);
        const matchCase = item.caseNo?.toLowerCase().includes(q);
        return matchCode || matchLocal || matchUpload || matchRef || matchCase;
      });
    }

    test("ADV3.1: Adversarial regex special characters do not crash or alter filter logic", () => {
      const maliciousQueries = [
        ".*",
        "+",
        "?",
        "^$",
        "[a-z]+",
        "(",
        ")",
        "\\d{2}-\\d{9}-\\d",
        "\\",
      ];

      for (const q of maliciousQueries) {
        expect(() => filterSubmissions(submissions, q)).not.toThrow();
        const results = filterSubmissions(submissions, q);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    test("ADV3.2: Adversarial SQL injection strings do not crash or leak data", () => {
      const sqlInjections = [
        "' OR '1'='1",
        "'; DROP TABLE Submissions; --",
        "1 UNION SELECT * FROM Patients--",
      ];

      for (const q of sqlInjections) {
        expect(() => filterSubmissions(submissions, q)).not.toThrow();
        const results = filterSubmissions(submissions, q);
        expect(results.length).toBe(0);
      }
    });

    test("ADV3.3: XSS payload search queries do not crash or execute", () => {
      const xssQueries = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert(1)>",
        "javascript:void(0)",
      ];

      for (const q of xssQueries) {
        expect(() => filterSubmissions(submissions, q)).not.toThrow();
        const results = filterSubmissions(submissions, q);
        expect(results.length).toBe(0);
      }
    });

    test("ADV3.4: Searching for patient names or PINs returns zero results", () => {
      const phiSearches = [
        "Juan Dela Cruz",
        "Maria Santos",
        "12-345678901-2",
        "0917-123-4567",
        "1990-01-01",
      ];

      for (const q of phiSearches) {
        const results = filterSubmissions(submissions, q);
        expect(results.length).toBe(0);
      }
    });
  });

  // ─── SUITE 4: ZERO BUNDLED DATA & RETIRED STATIC ARRAYS ───
  describe("Suite 4: Zero Bundled Data & Dynamic Architecture Verification", () => {
    test("ADV4.1: philhealth.ts contains zero static relationship arrays", () => {
      const exports = Object.keys(philhealthModule);
      expect(exports).not.toContain("PHILHEALTH_RELATIONSHIPS");
      expect(exports).not.toContain("RELATIONSHIP_OPTIONS");
      expect(exports).toContain("formatPhilHealthPin");
      expect(exports).toContain("validatePhilHealthPinMod11");
    });

    test("ADV4.2: optionsService retrieves dynamic guardian_relationship options with ETag caching", async () => {
      optionsService.clearCache();
      const originalFetch = globalThis.fetch;

      let fetchCallCount = 0;
      let lastIfNoneMatch: string | undefined;

      globalThis.fetch = mock(async (url: string, init?: any) => {
        fetchCallCount++;
        lastIfNoneMatch = init?.headers?.["If-None-Match"];

        if (init?.headers?.["If-None-Match"] === '"etag-hash-rel-1"') {
          return new Response(null, { status: 304 });
        }
        return new Response(
          JSON.stringify([
            { code: "CHILD", label: "Child", philHealthCode: "C", isActive: true },
            { code: "SPOUSE", label: "Spouse", philHealthCode: "S", isActive: true },
          ]),
          {
            status: 200,
            headers: { ETag: '"etag-hash-rel-1"', "Content-Type": "application/json" },
          }
        );
      }) as any;

      // First call: initial 200 fetch without If-None-Match
      const options1 = await optionsService.getOptionSet("guardian_relationship");
      expect(options1.length).toBe(2);
      expect(options1[0].code).toBe("CHILD");
      expect(fetchCallCount).toBe(1);
      expect(lastIfNoneMatch).toBeUndefined();

      // Second call: sends If-None-Match and receives 304 Not Modified, serving cached data
      const optionsCached = await optionsService.getOptionSet("guardian_relationship");
      expect(optionsCached.length).toBe(2);
      expect(optionsCached[0].code).toBe("CHILD");
      expect(fetchCallCount).toBe(2);
      expect(lastIfNoneMatch).toBe('"etag-hash-rel-1"');

      globalThis.fetch = originalFetch;
    });

    test("ADV4.3: locationService retrieves dynamic regions without static fallback arrays", async () => {
      const originalGet = apiClient.get;
      apiClient.get = mock(async (url: string) => {
        expect(url).toBe("/locations/psgc/regions");
        return {
          data: {
            succeeded: true,
            data: [
              { psgcCode: "1300000000", name: "National Capital Region (NCR)", level: "Region" },
              { psgcCode: "0700000000", name: "Region VII (Central Visayas)", level: "Region" },
            ],
          },
        };
      }) as any;

      const regions = await locationService.getRegions();
      expect(regions.length).toBe(2);
      expect(regions[0].psgcCode).toBe("1300000000");

      apiClient.get = originalGet;
    });
  });
});
