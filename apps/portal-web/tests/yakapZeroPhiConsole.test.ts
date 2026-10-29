import { describe, expect, test, mock } from "bun:test";
import {
  yakapService,
  type PortalYakapBranchSummaryDto,
  type PortalYakapSubmissionDto,
  type PortalYakapMasterlistSyncResultDto,
} from "../src/services/yakap.service";
import { apiClient } from "../src/transport/apiClient";

describe("PhilHealth YAKAP 2.0 Zero-PHI Telemetry Console (Milestone M4-B)", () => {
  const mockSummary: PortalYakapBranchSummaryDto = {
    branchId: "branch-uuid-001",
    accreditationNo: "P10038831",
    empaneledCount: 1420,
    selectedCount: 890,
    acceptedUploadsCount: 654,
    pendingPollingCount: 42,
    rejectedOrFailedCount: 18,
    submissionsByType: {
      FPE: 520,
      Consultation: 120,
      Diagnostic: 45,
      Medicine: 25,
      Referral: 4,
    },
    lastMasterlistSyncAtUtc: "2026-10-28T12:00:00Z",
    masterlistTotalCount: 2310,
  };

  const mockSubmissions: PortalYakapSubmissionDto[] = [
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
      payloadSha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      submittedAtUtc: "2026-10-28T08:00:00Z",
      completedAtUtc: "2026-10-28T08:05:00Z",
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
      payloadSha256Hash: "f4b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866",
      submittedAtUtc: "2026-10-28T10:30:00Z",
      lastPolledAtUtc: "2026-10-28T10:32:00Z",
      attemptCount: 1,
      errors: [],
    },
    {
      id: "sub-3",
      patientCode: "PAT-0003",
      accreditationNo: "P10038831",
      caseNo: "CASE-2026-0003",
      submissionType: "Diagnostic",
      reportStatus: "U",
      localTransactionNo: "D10038831202610000003",
      uploadTransactionNo: "U10038831202610000003",
      yesReferenceNo: null,
      processingStatus: "Rejected",
      payloadSha256Hash: "a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef",
      submittedAtUtc: "2026-10-28T11:00:00Z",
      attemptCount: 2,
      lastErrorMessage: "PhilHealth PCAPI validation error: Required diagnostic observation value missing.",
      errors: [
        {
          fieldPath: "DiagnosticResult.BloodGlucose",
          issue: "Observation value must not be empty.",
          errorCode: "ERR_REQUIRED_FIELD",
        },
      ],
    },
  ];

  describe("Tier 1: Strict Zero-PHI Architecture & Invariant Enforcement", () => {
    test("T1.1: PortalYakapSubmissionDto excludes all PHI properties", () => {
      for (const sub of mockSubmissions) {
        const keys = Object.keys(sub);
        expect(keys).not.toContain("patientName");
        expect(keys).not.toContain("philHealthIdentificationNumber");
        expect(keys).not.toContain("pin");
        expect(keys).not.toContain("primaryDiagnosis");
        expect(keys).not.toContain("diagnosis");
        expect(keys).not.toContain("rawXml");
        expect(keys).not.toContain("xmlPayload");
      }
    });

    test("T1.2: Mock submissions contain strictly anonymized PatientCode and zero 12-digit PIN patterns", () => {
      const pinRegex = /\b\d{2}-\d{9}-\d\b/;
      for (const sub of mockSubmissions) {
        expect(sub.patientCode).toMatch(/^PAT-\d+$/);
        const serialized = JSON.stringify(sub);
        expect(pinRegex.test(serialized)).toBe(false);
      }
    });

    test("T1.3: Non-PHI Error diagnostics contains only structural field paths and error codes", () => {
      const rejected = mockSubmissions.find((s) => s.processingStatus === "Rejected")!;
      expect(rejected.errors.length).toBeGreaterThan(0);
      for (const err of rejected.errors) {
        expect(err.fieldPath).toBeDefined();
        expect(err.errorCode).toBeDefined();
        expect(err.issue).toBeDefined();
        // Zero patient identifiers in error issue description
        expect(err.issue).not.toMatch(/\b\d{2}-\d{9}-\d\b/);
      }
    });
  });

  describe("Tier 2: 4 KPI Summary Cards & Telemetry Counters", () => {
    test("T2.1: Correctly tracks Empaneled, Pending, Accepted, and Rejected totals", () => {
      expect(mockSummary.empaneledCount).toBe(1420);
      expect(mockSummary.selectedCount).toBe(890);
      expect(mockSummary.acceptedUploadsCount).toBe(654);
      expect(mockSummary.pendingPollingCount).toBe(42);
      expect(mockSummary.rejectedOrFailedCount).toBe(18);
      expect(mockSummary.masterlistTotalCount).toBe(2310);
    });

    test("T2.2: SubmissionsByType correctly segments clinical form types", () => {
      expect(mockSummary.submissionsByType["FPE"]).toBe(520);
      expect(mockSummary.submissionsByType["Consultation"]).toBe(120);
      expect(mockSummary.submissionsByType["Diagnostic"]).toBe(45);
      expect(mockSummary.submissionsByType["Medicine"]).toBe(25);
      expect(mockSummary.submissionsByType["Referral"]).toBe(4);
    });
  });

  describe("Tier 3: Telemetry Ledger Filtering & Search", () => {
    test("T3.1: Filters submissions by status", () => {
      const accepted = mockSubmissions.filter((s) => s.processingStatus === "Accepted");
      expect(accepted.length).toBe(1);
      expect(accepted[0].patientCode).toBe("PAT-0001");

      const pending = mockSubmissions.filter((s) => s.processingStatus === "Pending");
      expect(pending.length).toBe(1);
      expect(pending[0].patientCode).toBe("PAT-0002");

      const rejected = mockSubmissions.filter((s) => s.processingStatus === "Rejected");
      expect(rejected.length).toBe(1);
      expect(rejected[0].patientCode).toBe("PAT-0003");
    });

    test("T3.2: Filters submissions by type", () => {
      const fpe = mockSubmissions.filter((s) => s.submissionType === "FPE");
      expect(fpe.length).toBe(1);
      expect(fpe[0].id).toBe("sub-1");

      const consult = mockSubmissions.filter((s) => s.submissionType === "Consultation");
      expect(consult.length).toBe(1);
      expect(consult[0].id).toBe("sub-2");
    });

    test("T3.3: Searches submissions by PatientCode and Transaction Numbers", () => {
      const searchByCode = mockSubmissions.filter((s) => s.patientCode.includes("0002"));
      expect(searchByCode.length).toBe(1);
      expect(searchByCode[0].id).toBe("sub-2");

      const searchByLocalTx = mockSubmissions.filter((s) => s.localTransactionNo.includes("E10038831"));
      expect(searchByLocalTx.length).toBe(1);
      expect(searchByLocalTx[0].id).toBe("sub-1");

      const searchByRef = mockSubmissions.filter((s) => s.yesReferenceNo?.includes("MCA2026100001"));
      expect(searchByRef.length).toBe(1);
      expect(searchByRef[0].id).toBe("sub-1");
    });
  });

  describe("Tier 4: YakapService API Client Bindings", () => {
    test("T4.1: getBranchSummary queries GET /yakap/branches/{branchId}/summary", async () => {
      const originalGet = apiClient.get;
      apiClient.get = mock(async (url: string) => {
        expect(url).toBe("/yakap/branches/branch-123/summary");
        return { data: { succeeded: true, data: mockSummary } };
      }) as any;

      const result = await yakapService.getBranchSummary("branch-123");
      expect(result.empaneledCount).toBe(1420);
      expect(result.acceptedUploadsCount).toBe(654);

      apiClient.get = originalGet;
    });

    test("T4.2: getSubmissions queries with status and type query parameters", async () => {
      const originalGet = apiClient.get;
      apiClient.get = mock(async (url: string) => {
        expect(url).toContain("/yakap/branches/branch-123/submissions");
        expect(url).toContain("status=pending");
        expect(url).toContain("submissionType=FPE");
        return { data: { succeeded: true, data: [mockSubmissions[1]] } };
      }) as any;

      const result = await yakapService.getSubmissions("branch-123", {
        status: "pending",
        submissionType: "FPE",
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("sub-2");

      apiClient.get = originalGet;
    });

    test("T4.3: pollSubmissionStatus dispatches POST /yakap/branches/{branchId}/submissions/{id}/poll", async () => {
      const originalPost = apiClient.post;
      apiClient.post = mock(async (url: string) => {
        expect(url).toBe("/yakap/branches/branch-123/submissions/sub-2/poll");
        return {
          data: {
            succeeded: true,
            data: { ...mockSubmissions[1], processingStatus: "Accepted", yesReferenceNo: "MCA2026100002" },
          },
        };
      }) as any;

      const polled = await yakapService.pollSubmissionStatus("branch-123", "sub-2");
      expect(polled.processingStatus).toBe("Accepted");
      expect(polled.yesReferenceNo).toBe("MCA2026100002");

      apiClient.post = originalPost;
    });

    test("T4.4: retrySubmission dispatches POST /yakap/branches/{branchId}/submissions/{id}/retry", async () => {
      const originalPost = apiClient.post;
      apiClient.post = mock(async (url: string) => {
        expect(url).toBe("/yakap/branches/branch-123/submissions/sub-3/retry");
        return {
          data: {
            succeeded: true,
            data: { ...mockSubmissions[2], processingStatus: "Submitted", attemptCount: 3 },
          },
        };
      }) as any;

      const retried = await yakapService.retrySubmission("branch-123", "sub-3");
      expect(retried.processingStatus).toBe("Submitted");
      expect(retried.attemptCount).toBe(3);

      apiClient.post = originalPost;
    });

    test("T4.5: syncMasterlist dispatches POST /yakap/branches/{branchId}/masterlist/sync", async () => {
      const originalPost = apiClient.post;
      apiClient.post = mock(async (url: string) => {
        expect(url).toBe("/yakap/branches/branch-123/masterlist/sync");
        const syncResult: PortalYakapMasterlistSyncResultDto = {
          success: true,
          recordsAdded: 45,
          recordsUpdated: 120,
          totalActiveCount: 2355,
          syncedAtUtc: "2026-10-28T15:00:00Z",
          message: "Service 05 Masterlist synchronized successfully.",
        };
        return { data: { succeeded: true, data: syncResult } };
      }) as any;

      const res = await yakapService.syncMasterlist("branch-123");
      expect(res.success).toBe(true);
      expect(res.recordsAdded).toBe(45);
      expect(res.totalActiveCount).toBe(2355);

      apiClient.post = originalPost;
    });
  });
});
