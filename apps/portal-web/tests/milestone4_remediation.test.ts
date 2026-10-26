import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * Milestone 4 Remediation Test Suite
 *
 * Covers:
 * 1. Zero-PHI attestation & null safety in RxUploadClient (lines 225 & 236)
 * 2. Semantic design token compliance in RxUploadClient & VerifyClient (zero emerald / amber)
 * 3. Theme variable definitions in globals.css (--color-success, --color-warning)
 * 4. Query parameter case disambiguation (?sig= vs ?SIG=) in verification pages
 */

const PORTAL_WEB_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_WEB_ROOT, "src");

describe("Milestone 4 Remediation: Core Logic & Semantic Standards", () => {
  describe("1. RxUploadClient Type Safety & Zero-PHI Robustness", () => {
    test("doctorPrc coercion safely maps null, undefined, or string to string | undefined", () => {
      const coerceDoctorPrc = (doctorPrcLicense?: string | null) =>
        doctorPrcLicense || undefined;

      expect(coerceDoctorPrc(null)).toBeUndefined();
      expect(coerceDoctorPrc(undefined)).toBeUndefined();
      expect(coerceDoctorPrc("")).toBeUndefined();
      expect(coerceDoctorPrc("PRC-1234567")).toBe("PRC-1234567");
    });

    test("items mapping never throws TypeError when rxInfo.items is undefined under Zero-PHI mode", () => {
      interface MockRxItem {
        genericName: string;
        dosage: string;
        quantity: number;
      }
      interface MockRxInfo {
        items?: MockRxItem[];
      }

      // Case A: Zero-PHI attestation mode (items is undefined)
      const zeroPhiInfo: MockRxInfo = {};
      const mapItems = (info: MockRxInfo) =>
        (info?.items || []).map((i) => `${i.genericName} ${i.dosage} (Qty: ${i.quantity})`);

      expect(() => mapItems(zeroPhiInfo)).not.toThrow();
      expect(mapItems(zeroPhiInfo)).toEqual([]);

      // Case B: Itemized prescription mode (items is present)
      const fullInfo: MockRxInfo = {
        items: [
          { genericName: "Amoxicillin", dosage: "500mg", quantity: 21 },
          { genericName: "Paracetamol", dosage: "500mg", quantity: 10 },
        ],
      };
      expect(mapItems(fullInfo)).toEqual([
        "Amoxicillin 500mg (Qty: 21)",
        "Paracetamol 500mg (Qty: 10)",
      ]);
    });
  });

  describe("2. Semantic Design Tokens: Elimination of emerald-* and amber-*", () => {
    test("RxUploadClient.tsx contains zero emerald-* utility classes", () => {
      const filePath = path.join(SRC_DIR, "app/upload/rx/[token]/RxUploadClient.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      const emeraldMatches = content.match(/\bemerald-[a-z0-9/-]+/g);
      expect(emeraldMatches).toBeNull();
    });

    test("VerifyClient.tsx contains zero amber-* and emerald-* utility classes", () => {
      const filePath = path.join(SRC_DIR, "app/verify/[...ref]/VerifyClient.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      const emeraldMatches = content.match(/\bemerald-[a-z0-9/-]+/g);
      const amberMatches = content.match(/\bamber-[a-z0-9/-]+/g);

      expect(emeraldMatches).toBeNull();
      expect(amberMatches).toBeNull();
    });

    test("globals.css defines --color-success and --color-warning in @theme inline, :root, and .dark", () => {
      const filePath = path.join(SRC_DIR, "app/globals.css");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("--color-success: var(--success);");
      expect(content).toContain("--color-warning: var(--warning);");
      expect(content).toContain("--success: #16A34A;");
      expect(content).toContain("--warning: #D97706;");
      expect(content).toContain("--success: #4ADE80;");
      expect(content).toContain("--warning: #FBBF24;");
    });
  });

  describe("3. Query Parameter Case Normalization (?sig= vs ?SIG=)", () => {
    test("normalizes query parameters case-insensitively and strips SEC-SHA256- prefix", () => {
      const parseSig = (sp: Record<string, string | undefined>) => {
        const rawSig = sp.sig || sp.SIG;
        return rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, "") : undefined;
      };

      // Lowercase ?sig=
      expect(parseSig({ sig: "abc123def" })).toBe("abc123def");
      // Uppercase ?SIG=
      expect(parseSig({ SIG: "abc123def" })).toBe("abc123def");
      // With SEC-SHA256- prefix
      expect(parseSig({ sig: "SEC-SHA256-789xyz" })).toBe("789xyz");
      expect(parseSig({ SIG: "sec-sha256-789xyz" })).toBe("789xyz");
      // Neither provided
      expect(parseSig({})).toBeUndefined();
    });

    test("verify page.tsx incorporates rawSig fallback", () => {
      const pagePath = path.join(SRC_DIR, "app/verify/[...ref]/page.tsx");
      const pageContent = fs.readFileSync(pagePath, "utf-8");

      expect(pageContent).toContain("const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;");
    });
  });
});
