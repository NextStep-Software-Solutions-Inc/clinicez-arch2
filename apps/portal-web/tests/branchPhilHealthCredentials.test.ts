import { describe, expect, test } from "bun:test";
import type {
  BranchDto,
  ConfigureBranchPhilHealthPayload,
  TestBranchPhilHealthPayload,
} from "../src/services/branch.service";

describe("Branch PhilHealth PCAPI v2.0 Credentials & Secret Masking", () => {
  // Helper simulating the credential resolution logic implemented in BranchManagementClient.tsx
  function resolveCredentialsPayload(
    branch: Partial<BranchDto> | null,
    phAccreditation: string,
    phPmcc: string,
    phCertId: string,
    phSecretKey: string,
    phCipherKey: string,
    phBaseUrl: string
  ) {
    const isConfiguredBranch = Boolean(
      branch?.isPhilHealthAccredited && branch?.philHealthAccreditationNumber
    );

    const testPayload: TestBranchPhilHealthPayload = {
      accreditationNumber: phAccreditation.trim() || undefined,
      pmccNumber: phPmcc.trim() || undefined,
      softwareCertificateId: phCertId.trim() || undefined,
      secretKey: phSecretKey.trim() || undefined, // undefined uses saved protected secret
      cipherKey: phCipherKey.trim() || undefined,
      baseUrl: phBaseUrl.trim() || undefined,
    };

    const configurePayload: ConfigureBranchPhilHealthPayload = {
      accreditationNumber: phAccreditation.trim(),
      pmccNumber: phPmcc.trim() || undefined,
      softwareCertificateId: phCertId.trim() || undefined,
      secretKey: phSecretKey.trim() || undefined, // undefined preserves existing saved secret
      cipherKey: phCipherKey.trim() || undefined, // undefined preserves existing saved cipher key
      baseUrl: phBaseUrl.trim() || undefined,
      isPhilHealthAccredited: true,
    };

    return { isConfiguredBranch, testPayload, configurePayload };
  }

  function getPlaceholders(branch: Partial<BranchDto> | null) {
    return {
      secretKey: branch?.hasSecretKey
        ? "•••••••••••••••• (Leave blank to keep existing)"
        : "Enter PCAPI Secret Key",
      cipherKey: branch?.hasCipherKey
        ? "•••••••••••••••• (Leave blank to keep existing)"
        : "Enter AES-256-CBC Cipher Key",
    };
  }

  describe("Unconfigured Branch (Initial PCAPI Setup)", () => {
    const unconfiguredBranch: Partial<BranchDto> = {
      id: "branch-new-123",
      name: "New Regional Branch",
      isPhilHealthAccredited: false,
      philHealthAccreditationNumber: undefined,
      hasSecretKey: false,
      hasCipherKey: false,
    };

    test("renders 'Enter PCAPI Secret Key' and 'Enter AES-256-CBC Cipher Key' placeholders", () => {
      const placeholders = getPlaceholders(unconfiguredBranch);
      expect(placeholders.secretKey).toBe("Enter PCAPI Secret Key");
      expect(placeholders.cipherKey).toBe("Enter AES-256-CBC Cipher Key");
    });

    test("sends trimmed secretKey and cipherKey when explicitly entered", () => {
      const { testPayload, configurePayload } = resolveCredentialsPayload(
        unconfiguredBranch,
        "P10038831",
        "Z15445",
        "CERT-YAKAP-2026",
        "  sk_live_secret_key_12345  ",
        "  aes_cipher_key_67890  ",
        "https://pcapi.philhealth.gov.ph"
      );

      expect(testPayload.accreditationNumber).toBe("P10038831");
      expect(testPayload.secretKey).toBe("sk_live_secret_key_12345");
      expect(testPayload.cipherKey).toBe("aes_cipher_key_67890");
      expect(testPayload.baseUrl).toBe("https://pcapi.philhealth.gov.ph");

      expect(configurePayload.secretKey).toBe("sk_live_secret_key_12345");
      expect(configurePayload.cipherKey).toBe("aes_cipher_key_67890");
      expect(configurePayload.isPhilHealthAccredited).toBe(true);
    });

    test("supports simulation sandbox endpoints and PKA-SIM credentials", () => {
      const { testPayload } = resolveCredentialsPayload(
        unconfiguredBranch,
        "PKA-SIM-0001",
        "Z15445",
        "CERT-SIM",
        "sim_secret",
        "",
        "https://pcapi-sandbox.philhealth.gov.ph"
      );

      expect(testPayload.accreditationNumber).toBe("PKA-SIM-0001");
      expect(testPayload.baseUrl).toBe("https://pcapi-sandbox.philhealth.gov.ph");
      expect(testPayload.cipherKey).toBeUndefined();
    });
  });

  describe("Configured Branch (Editing & Secret Masking)", () => {
    const configuredBranch: Partial<BranchDto> = {
      id: "branch-existing-456",
      name: "Accredited Main Branch",
      isPhilHealthAccredited: true,
      philHealthAccreditationNumber: "P10038831",
      philHealthPmccNumber: "Z15445",
      philHealthSoftwareCertificateId: "CERT-YAKAP-2026",
      philHealthBaseUrl: "https://pcapi.philhealth.gov.ph",
      hasSecretKey: true,
      hasCipherKey: true,
    };

    test("renders masked 'Leave blank to keep existing' placeholders when secrets are configured", () => {
      const placeholders = getPlaceholders(configuredBranch);
      expect(placeholders.secretKey).toBe("•••••••••••••••• (Leave blank to keep existing)");
      expect(placeholders.cipherKey).toBe("•••••••••••••••• (Leave blank to keep existing)");
    });

    test("sends undefined when inputs are left blank to preserve existing protected secrets", () => {
      const { isConfiguredBranch, testPayload, configurePayload } = resolveCredentialsPayload(
        configuredBranch,
        "P10038831",
        "Z15445",
        "CERT-YAKAP-2026",
        "", // left blank
        "", // left blank
        "https://pcapi.philhealth.gov.ph"
      );

      expect(isConfiguredBranch).toBe(true);
      expect(testPayload.secretKey).toBeUndefined();
      expect(testPayload.cipherKey).toBeUndefined();
      expect(configurePayload.secretKey).toBeUndefined();
      expect(configurePayload.cipherKey).toBeUndefined();

      // JSON serialization drops undefined properties so backend does not overwrite
      const json = JSON.stringify(configurePayload);
      expect(json).not.toContain('"secretKey"');
      expect(json).not.toContain('"cipherKey"');
      expect(json).toContain('"accreditationNumber":"P10038831"');
    });

    test("sends new non-empty secret when rotating credentials", () => {
      const { configurePayload, testPayload } = resolveCredentialsPayload(
        configuredBranch,
        "P10038831",
        "Z15445",
        "CERT-YAKAP-2026",
        "new_rotated_secret_999",
        "",
        "https://pcapi.philhealth.gov.ph"
      );

      expect(configurePayload.secretKey).toBe("new_rotated_secret_999");
      expect(configurePayload.cipherKey).toBeUndefined();
      expect(testPayload.secretKey).toBe("new_rotated_secret_999");
      expect(testPayload.cipherKey).toBeUndefined();
    });

    test("handles branch with secretKey configured but cipherKey not configured", () => {
      const partialBranch: Partial<BranchDto> = {
        ...configuredBranch,
        hasSecretKey: true,
        hasCipherKey: false,
      };

      const placeholders = getPlaceholders(partialBranch);
      expect(placeholders.secretKey).toBe("•••••••••••••••• (Leave blank to keep existing)");
      expect(placeholders.cipherKey).toBe("Enter AES-256-CBC Cipher Key");
    });
  });
});
