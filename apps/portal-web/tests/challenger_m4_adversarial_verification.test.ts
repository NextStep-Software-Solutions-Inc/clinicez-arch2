import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * Challenger Adversarial Verification Suite - Milestone 4 Remediation
 *
 * Probes:
 * 1. Edge-case payload testing for RxUploadClient (Zero-PHI undefined items, null doctorPrcLicense)
 * 2. Client-side 80% JPEG canvas compression (<= 5 MiB ceiling) in RxUploadClient & RxVerifyClient
 * 3. Case-insensitive query parameter handling (?sig= vs ?SIG=) and prefix stripping
 * 4. Source code AST/contract verification for exact remediation patterns
 */

const PORTAL_WEB_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_WEB_ROOT, "src");

describe("Challenger Adversarial Verification: Milestone 4 Remediation", () => {
  describe("Probe 1: RxUploadClient Edge-Case Payloads & Zero-PHI Robustness", () => {
    interface ReceiptItemMapInput {
      genericName: string;
      dosage: string;
      quantity: number;
    }

    interface MockRxUploadInfo {
      prescriptionNumber?: string;
      clinicName?: string;
      doctorName?: string;
      doctorPrcLicense?: string | null;
      patientInitials?: string;
      patientAge?: number;
      patientGender?: string;
      items?: ReceiptItemMapInput[];
    }

    // Exact logic from RxUploadClient.tsx handleSubmit (lines 225 & 236)
    const constructReceiptData = (rxInfo: MockRxUploadInfo | null | undefined, file: { name: string; type: string } | null, pharmacyName: string) => {
      const isPdf = file ? file.type === "application/pdf" : true;
      return {
        type: "rx" as const,
        referenceNumber: `REF-RX-123456`,
        orderNumber: rxInfo?.prescriptionNumber || "RX-000",
        facilityName: rxInfo?.clinicName || "Prescribing Clinic",
        doctorName: rxInfo?.doctorName || "Prescribing Physician",
        doctorPrc: rxInfo?.doctorPrcLicense || undefined,
        patientInitials: rxInfo?.patientInitials || "P***",
        patientAge: rxInfo?.patientAge || 0,
        patientGender: rxInfo?.patientGender || "Unknown",
        externalFacilityName: pharmacyName.trim(),
        externalContact: undefined,
        professionalName: undefined,
        professionalPrc: undefined,
        notes: undefined,
        documentType: isPdf ? "PDF" : "Image",
        fileName: file?.name || "Official-Dispense-Receipt.pdf",
        items: (rxInfo?.items || []).map((i) => `${i.genericName} ${i.dosage} (Qty: ${i.quantity})`),
        submittedAt: new Date().toISOString(),
      };
    };

    test("Edge-Case A: rxInfo.items is undefined (Zero-PHI Attestation) produces empty array without TypeError", () => {
      const zeroPhiPayload: MockRxUploadInfo = {
        prescriptionNumber: "RX-2026-9999",
        clinicName: "Manila Family Health",
        doctorName: "Dr. Maria Santos",
        doctorPrcLicense: "PRC-0098765",
        items: undefined, // Zero-PHI mode: items omitted
      };

      expect(() => constructReceiptData(zeroPhiPayload, null, "Mercury Drug")).not.toThrow();
      const receipt = constructReceiptData(zeroPhiPayload, null, "Mercury Drug");
      expect(receipt.items).toEqual([]);
      expect(receipt.items.length).toBe(0);
    });

    test("Edge-Case B: rxInfo.items is null (raw API JSON deserialization edge case) produces empty array", () => {
      const payloadWithNullItems = {
        prescriptionNumber: "RX-2026-9999",
        items: null as unknown as ReceiptItemMapInput[] | undefined,
      };

      expect(() => constructReceiptData(payloadWithNullItems, null, "Mercury Drug")).not.toThrow();
      const receipt = constructReceiptData(payloadWithNullItems, null, "Mercury Drug");
      expect(receipt.items).toEqual([]);
    });

    test("Edge-Case C: rxInfo itself is null or undefined (premature form submit edge case)", () => {
      expect(() => constructReceiptData(null, null, "Mercury Drug")).not.toThrow();
      const receiptNull = constructReceiptData(null, null, "Mercury Drug");
      expect(receiptNull.items).toEqual([]);
      expect(receiptNull.doctorPrc).toBeUndefined();

      expect(() => constructReceiptData(undefined, null, "Mercury Drug")).not.toThrow();
      const receiptUndef = constructReceiptData(undefined, null, "Mercury Drug");
      expect(receiptUndef.items).toEqual([]);
      expect(receiptUndef.doctorPrc).toBeUndefined();
    });

    test("Edge-Case D: rxInfo.doctorPrcLicense is null coerces strictly to undefined", () => {
      const nullDoctorPrcPayload: MockRxUploadInfo = {
        prescriptionNumber: "RX-2026-1234",
        doctorName: "Dr. Jose Rizal",
        doctorPrcLicense: null,
      };

      const receipt = constructReceiptData(nullDoctorPrcPayload, null, "Watsons");
      expect(receipt.doctorPrc).toBeUndefined();
      expect(receipt.doctorPrc).not.toBeNull();
    });

    test("Edge-Case E: rxInfo.doctorPrcLicense is empty string coerces to undefined", () => {
      const emptyDoctorPrcPayload: MockRxUploadInfo = {
        prescriptionNumber: "RX-2026-1234",
        doctorPrcLicense: "",
      };

      const receipt = constructReceiptData(emptyDoctorPrcPayload, null, "Watsons");
      expect(receipt.doctorPrc).toBeUndefined();
    });

    test("Edge-Case F: rxInfo.doctorPrcLicense valid PRC string is preserved verbatim", () => {
      const validDoctorPrcPayload: MockRxUploadInfo = {
        prescriptionNumber: "RX-2026-1234",
        doctorPrcLicense: "PRC-99112233",
      };

      const receipt = constructReceiptData(validDoctorPrcPayload, null, "Watsons");
      expect(receipt.doctorPrc).toBe("PRC-99112233");
    });

    test("Source Code Audit: RxUploadClient.tsx contains exact null-coercion and empty array fallback", () => {
      const filePath = path.join(SRC_DIR, "app/upload/rx/[token]/RxUploadClient.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("doctorPrc: rxInfo?.doctorPrcLicense || undefined,");
      expect(content).toContain("items: (rxInfo?.items || []).map((i) => `${i.genericName} ${i.dosage} (Qty: ${i.quantity})`),");
    });
  });

  describe("Probe 2: Client-Side 80% JPEG Canvas Compression & 5 MiB Ceiling", () => {
    test("RxUploadClient.tsx specifies 5 MiB limit, image MIME filter, and 80% JPEG canvas quality", () => {
      const filePath = path.join(SRC_DIR, "app/upload/rx/[token]/RxUploadClient.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      // 5 MiB ceiling constants
      expect(content).toContain("const MAX_FILE_SIZE_MB = 5;");
      expect(content).toContain("const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;");

      // Allowed MIME types
      expect(content).toContain('"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"');

      // Image MIME gate bypasses compression for PDFs
      expect(content).toContain('if (!file.type.startsWith("image/")) return file;');

      // 2048px maximum dimension downscaling
      expect(content).toContain("const maxDim = 2048;");

      // Canvas export at 0.8 quality JPEG
      expect(content).toMatch(/canvas\.toBlob\(\s*\(blob\)\s*=>\s*\{[\s\S]*?\},\s*["']image\/jpeg["'],\s*0\.8\s*\)/);

      // Post-compression file size enforcement
      expect(content).toContain("if (processed.size > MAX_FILE_SIZE_BYTES)");
    });

    test("RxVerifyClient.tsx specifies 5 MiB ceiling, 2048px max dimension, and 80% JPEG canvas quality", () => {
      const filePath = path.join(SRC_DIR, "app/rx-verify/[token]/RxVerifyClient.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      // 5 MiB ceiling constant
      expect(content).toContain("const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB ceiling");

      // PDF vs Image size check
      expect(content).toContain("if (file.size > MAX_RECEIPT_SIZE_BYTES && !file.type.startsWith('image/'))");

      // 2048px maximum dimension downscaling
      expect(content).toContain("const maxDim = 2048;");

      // Canvas export at 0.8 quality JPEG
      expect(content).toMatch(/canvas\.toBlob\(\s*\(blob\)\s*=>\s*\{[\s\S]*?\},\s*['"]image\/jpeg['"],\s*0\.8\s*\)/);

      // Post-compression enforcement
      expect(content).toContain("if (processed.size > MAX_RECEIPT_SIZE_BYTES)");
    });

    test("Dimension scaling math preserves aspect ratio under adversarial dimensions", () => {
      const scaleDimensions = (width: number, height: number, maxDim: number = 2048) => {
        let w = width;
        let h = height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        return { width: w, height: h };
      };

      // Standard small image (no scaling)
      expect(scaleDimensions(800, 600)).toEqual({ width: 800, height: 600 });

      // Landscape high-res (4096 x 2048) -> should scale to (2048 x 1024)
      expect(scaleDimensions(4096, 2048)).toEqual({ width: 2048, height: 1024 });

      // Portrait ultra-tall (1080 x 3840) -> should scale to (576 x 2048)
      expect(scaleDimensions(1080, 3840)).toEqual({ width: 576, height: 2048 });

      // Exact square high-res (3000 x 3000) -> should scale to (2048 x 2048)
      expect(scaleDimensions(3000, 3000)).toEqual({ width: 2048, height: 2048 });
    });
  });

  describe("Probe 3: Case-Insensitive Query Parameter Handling (?sig= vs ?SIG=)", () => {
    const parseSearchParamSig = (sp: Record<string, string | undefined>) => {
      const rawSig = sp.sig || sp.SIG;
      return rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, "") : undefined;
    };

    test("handles ?sig= in lowercase", () => {
      expect(parseSearchParamSig({ sig: "fedcba9876543210" })).toBe("fedcba9876543210");
    });

    test("handles ?SIG= in uppercase", () => {
      expect(parseSearchParamSig({ SIG: "fedcba9876543210" })).toBe("fedcba9876543210");
    });

    test("prefers lowercase sig if both ?sig= and ?SIG= are passed", () => {
      expect(parseSearchParamSig({ sig: "primary_sig", SIG: "fallback_sig" })).toBe("primary_sig");
    });

    test("strips case-insensitive prefix variations", () => {
      expect(parseSearchParamSig({ sig: "SEC-SHA256-abcdef123" })).toBe("abcdef123");
      expect(parseSearchParamSig({ SIG: "sec-sha256-abcdef123" })).toBe("abcdef123");
      expect(parseSearchParamSig({ sig: "Sec-Sha256-abcdef123" })).toBe("abcdef123");
      expect(parseSearchParamSig({ SIG: "sEc-ShA256-abcdef123" })).toBe("abcdef123");
    });

    test("trims leading and trailing whitespace", () => {
      expect(parseSearchParamSig({ sig: "   SEC-SHA256-hash123   " })).toBe("hash123");
      expect(parseSearchParamSig({ SIG: " \t SEC-SHA256-hash456 \n " })).toBe("hash456");
    });

    test("handles missing / empty / whitespace-only sig gracefully", () => {
      expect(parseSearchParamSig({})).toBeUndefined();
      expect(parseSearchParamSig({ sig: "" })).toBeUndefined();
      expect(parseSearchParamSig({ SIG: "" })).toBeUndefined();
      expect(parseSearchParamSig({ sig: "   " })).toBe("");
    });

    test("Source Code Audit: verify/[token]/page.tsx and verify/[kind]/[token]/page.tsx contain rawSig fallback", () => {
      const page1Path = path.join(SRC_DIR, "app/verify/[token]/page.tsx");
      const page2Path = path.join(SRC_DIR, "app/verify/[kind]/[token]/page.tsx");

      const page1 = fs.readFileSync(page1Path, "utf-8");
      const page2 = fs.readFileSync(page2Path, "utf-8");

      expect(page1).toContain("const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;");
      expect(page1).toContain("const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;");

      expect(page2).toContain("const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;");
      expect(page2).toContain("const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;");
    });
  });
});
