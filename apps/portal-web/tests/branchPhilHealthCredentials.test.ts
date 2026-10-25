import { describe, expect, test } from "bun:test";
import type { BranchDto, ConfigureBranchPhilHealthPayload, TestBranchPhilHealthPayload } from "../src/services/branch.service";

describe("Branch PhilHealth Credentials & Staging Support (Issue #70)", () => {
  // Helper simulating the credential resolution logic implemented in BranchManagementClient.tsx
  function resolveCredentialsPayload(
    branch: Partial<BranchDto> | null,
    phUsername: string,
    phPassword: string,
    useBlankStagingCredentials: boolean,
    phAccreditation: string = "P10038831",
    phPmcc: string = "Z15445",
    phCertId: string = "KON-DUMMYCERTS-Z15445",
    phEndpoint: string = "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
    phCipherKey: string = ""
  ) {
    const isConfiguredBranch = Boolean(
      branch?.isPhilHealthAccredited && branch?.philHealthAccreditationNumber
    );

    const resolvedUsername = isConfiguredBranch
      ? (useBlankStagingCredentials ? "" : (phUsername.trim() || undefined))
      : (phUsername ? phUsername.trim() : "");

    const resolvedPassword = isConfiguredBranch
      ? (useBlankStagingCredentials ? "" : (phPassword || undefined))
      : (phPassword ? phPassword : "");

    const testPayload: TestBranchPhilHealthPayload = {
      accreditationNumber: phAccreditation.trim(),
      pmccNumber: phPmcc.trim() || undefined,
      softwareCertificateId: phCertId.trim() || undefined,
      username: resolvedUsername,
      password: resolvedPassword,
      cipherKey: phCipherKey.trim() || undefined,
      konsultaEndpoint: phEndpoint.trim() || undefined,
    };

    const configurePayload: ConfigureBranchPhilHealthPayload = {
      accreditationNumber: phAccreditation.trim(),
      pmccNumber: phPmcc.trim() || undefined,
      softwareCertificateId: phCertId.trim() || undefined,
      username: resolvedUsername,
      password: resolvedPassword,
      cipherKey: phCipherKey.trim() || undefined,
      konsultaEndpoint: phEndpoint.trim() || undefined,
      isPhilHealthAccredited: true,
    };

    return { isConfiguredBranch, testPayload, configurePayload };
  }

  function getPlaceholders(isConfiguredBranch: boolean, useBlankStagingCredentials: boolean) {
    return {
      username: isConfiguredBranch
        ? (useBlankStagingCredentials ? "Blank credentials for staging" : "Leave blank to keep existing")
        : "Blank for staging / Enter username",
      password: isConfiguredBranch
        ? (useBlankStagingCredentials ? "Blank credentials for staging" : "Leave blank to keep existing")
        : "Blank for staging / Enter password",
    };
  }

  describe("Unconfigured Branch (Initial Setup)", () => {
    const unconfiguredBranch: Partial<BranchDto> = {
      id: "branch-new-123",
      name: "New Staging Branch",
      isPhilHealthAccredited: false,
      philHealthAccreditationNumber: undefined,
    };

    test("sends literal username: '' and password: '' when left blank (never undefined)", () => {
      const { isConfiguredBranch, testPayload, configurePayload } = resolveCredentialsPayload(
        unconfiguredBranch,
        "", // blank username
        "", // blank password
        false
      );

      expect(isConfiguredBranch).toBe(false);

      // Must be literal empty string "" so JSON.stringify serializes {"username":"","password":""}
      expect(testPayload.username).toBe("");
      expect(testPayload.password).toBe("");
      expect(configurePayload.username).toBe("");
      expect(configurePayload.password).toBe("");

      // Verifying JSON serialization preserves the keys
      const json = JSON.stringify(testPayload);
      expect(json).toContain('"username":""');
      expect(json).toContain('"password":""');
    });

    test("renders context-aware 'Blank for staging' placeholders on unconfigured branch", () => {
      const placeholders = getPlaceholders(false, false);
      expect(placeholders.username).toBe("Blank for staging / Enter username");
      expect(placeholders.password).toBe("Blank for staging / Enter password");
    });

    test("sends trimmed credentials when user explicitly types them", () => {
      const { testPayload, configurePayload } = resolveCredentialsPayload(
        unconfiguredBranch,
        "  custom_user  ",
        "custom_pass",
        false
      );

      expect(testPayload.username).toBe("custom_user");
      expect(testPayload.password).toBe("custom_pass");
      expect(configurePayload.username).toBe("custom_user");
      expect(configurePayload.password).toBe("custom_pass");
    });
  });

  describe("Configured Branch (Editing Existing Credentials)", () => {
    const configuredBranch: Partial<BranchDto> = {
      id: "branch-existing-456",
      name: "Accredited Branch",
      isPhilHealthAccredited: true,
      philHealthAccreditationNumber: "P10038831",
      philHealthPmccNumber: "Z15445",
      philHealthSoftwareCertificateId: "KON-DUMMYCERTS-Z15445",
    };

    test("sends undefined when inputs are empty to preserve existing stored secrets", () => {
      const { isConfiguredBranch, testPayload, configurePayload } = resolveCredentialsPayload(
        configuredBranch,
        "",
        "",
        false // toggle not checked
      );

      expect(isConfiguredBranch).toBe(true);
      expect(testPayload.username).toBeUndefined();
      expect(testPayload.password).toBeUndefined();
      expect(configurePayload.username).toBeUndefined();
      expect(configurePayload.password).toBeUndefined();

      // JSON.stringify will drop undefined keys, preserving existing DB values on backend
      const json = JSON.stringify(configurePayload);
      expect(json).not.toContain('"username"');
      expect(json).not.toContain('"password"');
    });

    test("renders 'Leave blank to keep existing' placeholder when not toggled", () => {
      const placeholders = getPlaceholders(true, false);
      expect(placeholders.username).toBe("Leave blank to keep existing");
      expect(placeholders.password).toBe("Leave blank to keep existing");
    });

    test("sends literal '' when explicitly switching to blank staging credentials", () => {
      const { testPayload, configurePayload } = resolveCredentialsPayload(
        configuredBranch,
        "",
        "",
        true // useBlankStagingCredentials toggled to true
      );

      expect(testPayload.username).toBe("");
      expect(testPayload.password).toBe("");
      expect(configurePayload.username).toBe("");
      expect(configurePayload.password).toBe("");

      const json = JSON.stringify(configurePayload);
      expect(json).toContain('"username":""');
      expect(json).toContain('"password":""');
    });

    test("renders 'Blank credentials for staging' placeholder when toggle is active", () => {
      const placeholders = getPlaceholders(true, true);
      expect(placeholders.username).toBe("Blank credentials for staging");
      expect(placeholders.password).toBe("Blank credentials for staging");
    });

    test("sends new non-empty credentials when user updates them", () => {
      const { configurePayload } = resolveCredentialsPayload(
        configuredBranch,
        "new_admin_user",
        "new_secret_pwd",
        false
      );

      expect(configurePayload.username).toBe("new_admin_user");
      expect(configurePayload.password).toBe("new_secret_pwd");
    });
  });
});
