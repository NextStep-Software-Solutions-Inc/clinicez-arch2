import { describe, expect, test } from "bun:test";
import {
  splitFullName,
  buildPhilHealthProfileData,
  extractPhilHealthProfileData,
  type MemberType,
  type PrincipalRelationship,
} from "../components/patient/memberType";
import {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionQrUrl,
  formatJoinCodeExpiration,
  reviewDocument,
  type QuarantinedDoc,
} from "../components/settings/joinLinkUtils";

describe("Clinic App Adversarial Suite 1: PhilHealth Member Type & Profile Assembly Edge Cases", () => {
  test("CLINIC1.1: splitFullName edge cases (single word, empty, multi-word, excess spaces)", () => {
    // Empty & whitespace
    expect(splitFullName("")).toEqual(["", ""]);
    expect(splitFullName("   ")).toEqual(["", ""]);
    expect(splitFullName(undefined)).toEqual(["", ""]);

    // Single word name (e.g. Cher, Madonna)
    expect(splitFullName("Cher")).toEqual(["Cher", ""]);
    expect(splitFullName("   Madonna   ")).toEqual(["Madonna", ""]);

    // Standard two-word name
    expect(splitFullName("Juan Rizal")).toEqual(["Juan", "Rizal"]);

    // Multi-part first name
    expect(splitFullName("Juan Maria Protacio Rizal")).toEqual([
      "Juan Maria Protacio",
      "Rizal",
    ]);

    // Name with title/honorific and multiple spaces
    expect(splitFullName("  Dr.   Jose   P.   Rizal   ")).toEqual([
      "Dr. Jose P.",
      "Rizal",
    ]);
  });

  test("CLINIC1.2: buildPhilHealthProfileData sanitization when toggling MM vs DD", () => {
    const baseParams = {
      patientFirstName: "Juan",
      patientLastName: "Dela Cruz",
      patientMiddleName: "Santos",
      patientDob: "2000-01-01",
      patientPin: "12-345678901-8",
      principalFullName: "Maria Santos Dela Cruz",
      principalRelationship: "S" as PrincipalRelationship,
      principalPin: "10-000000000-5",
      principalDob: "1975-05-20",
    };

    // When Member (MM): principal fields MUST NOT leak into profile
    const mmProfile = buildPhilHealthProfileData({
      ...baseParams,
      memberType: "MM",
    });

    expect(mmProfile.memberType).toBe("MM");
    expect(mmProfile.pin).toBe("12-345678901-8");
    expect(mmProfile.memberPin).toBe("12-345678901-8"); // Patient's own PIN
    expect(mmProfile.memberFirstName).toBe("Juan");
    expect(mmProfile.memberLastName).toBe("Dela Cruz");
    expect(mmProfile.memberMiddleName).toBe("Santos");
    expect(mmProfile.memberBirthDate).toBe("2000-01-01");
    expect(mmProfile.dependentRelationship).toBeUndefined(); // Stripped!

    // When Dependent (DD): principal credentials MUST be mapped
    const ddProfile = buildPhilHealthProfileData({
      ...baseParams,
      memberType: "DD",
    });

    expect(ddProfile.memberType).toBe("DD");
    expect(ddProfile.pin).toBe("12-345678901-8"); // Patient's own PIN if available
    expect(ddProfile.memberPin).toBe("10-000000000-5"); // Principal's PIN!
    expect(ddProfile.memberFirstName).toBe("Maria Santos Dela");
    expect(ddProfile.memberLastName).toBe("Cruz");
    expect(ddProfile.memberMiddleName).toBeUndefined();
    expect(ddProfile.memberBirthDate).toBe("1975-05-20");
    expect(ddProfile.dependentRelationship).toBe("S");
  });

  test("CLINIC1.3: extractPhilHealthProfileData fallback cascade and boundary defaults", () => {
    // Null/undefined customFields returns clean defaults
    const emptyExtracted = extractPhilHealthProfileData(null);
    expect(emptyExtracted.memberType).toBe("MM");
    expect(emptyExtracted.principalPin).toBe("");
    expect(emptyExtracted.principalFullName).toBe("");
    expect(emptyExtracted.principalRelationship).toBe("C");
    expect(emptyExtracted.principalDob).toBe("");

    // CustomFields with explicit member_type = 'DD'
    const ddExtracted = extractPhilHealthProfileData({
      member_type: "DD",
      principal_member_pin: "10-000000000-5",
      principal_full_name: "Pedro Penduko",
      principal_relationship: "P",
      principal_dob: "1960-01-01",
    });
    expect(ddExtracted.memberType).toBe("DD");
    expect(ddExtracted.principalPin).toBe("10-000000000-5");
    expect(ddExtracted.principalFullName).toBe("Pedro Penduko");
    expect(ddExtracted.principalRelationship).toBe("P");
    expect(ddExtracted.principalDob).toBe("1960-01-01");

    // 1NF relational patient.philHealthMembership fallback
    const relationalExtracted = extractPhilHealthProfileData(null, {
      philHealthMembership: {
        memberType: "DD",
        principalMemberPin: "01-025000001-0",
        principalFirstName: "Juana",
        principalLastName: "Change",
        dependentRelationship: "D",
        principalDateOfBirth: "1995-10-10",
      },
    });
    expect(relationalExtracted.memberType).toBe("DD");
    expect(relationalExtracted.principalPin).toBe("01-025000001-0");
    expect(relationalExtracted.principalFullName).toBe("Juana Change");
    expect(relationalExtracted.principalRelationship).toBe("D");
    expect(relationalExtracted.principalDob).toBe("1995-10-10");
  });
});

describe("Clinic App Adversarial Suite 2: Join Link Settings & Expiration Utilities", () => {
  test("CLINIC2.1: Join code generator avoids ambiguous characters across 1,000 samples", () => {
    const ambiguousChars = ["0", "O", "1", "I"];
    for (let i = 0; i < 1000; i++) {
      const code = generateRandomJoinCode(8);
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Z0-9]+$/);
      for (const char of ambiguousChars) {
        expect(code).not.toContain(char);
      }
    }
  });

  test("CLINIC2.2: computeJoinCodeExpiration and boundary check", () => {
    const before = Date.now();

    const exp24h = computeJoinCodeExpiration("24h")!;
    expect(exp24h.getTime() - before).toBeGreaterThanOrEqual(23 * 3600 * 1000);
    expect(exp24h.getTime() - before).toBeLessThanOrEqual(25 * 3600 * 1000);

    const exp7d = computeJoinCodeExpiration("7d")!;
    expect(exp7d.getTime() - before).toBeGreaterThanOrEqual(6 * 24 * 3600 * 1000);

    const exp30d = computeJoinCodeExpiration("30d")!;
    expect(exp30d.getTime() - before).toBeGreaterThanOrEqual(29 * 24 * 3600 * 1000);

    const expNever = computeJoinCodeExpiration("never");
    expect(expNever).toBeNull();

    const customDate = new Date("2028-12-31T23:59:59Z");
    const expCustom = computeJoinCodeExpiration("custom", customDate);
    expect(expCustom).toEqual(customDate);
  });

  test("CLINIC2.3: isJoinCodeActive precision boundary checks", () => {
    // Disabled link is always inactive regardless of expiry
    expect(isJoinCodeActive(false, new Date(Date.now() + 100000))).toBe(false);
    expect(isJoinCodeActive(false, null)).toBe(false);

    // Enabled with null expiry is permanent active
    expect(isJoinCodeActive(true, null)).toBe(true);
    expect(isJoinCodeActive(true, undefined)).toBe(true);

    // Enabled with future date
    expect(isJoinCodeActive(true, new Date(Date.now() + 60000))).toBe(true);

    // Enabled with past date
    expect(isJoinCodeActive(true, new Date(Date.now() - 1000))).toBe(false);

    // String date handling
    const pastStr = new Date(Date.now() - 5000).toISOString();
    expect(isJoinCodeActive(true, pastStr)).toBe(false);

    const futureStr = new Date(Date.now() + 50000).toISOString();
    expect(isJoinCodeActive(true, futureStr)).toBe(true);
  });

  test("CLINIC2.4: formatReceptionQrUrl encoding and edge parameters", () => {
    const url = formatReceptionQrUrl(
      "https://portal.clinicez.ph/",
      "test-tenant",
      "main-clinic",
      "JOIN123"
    );
    expect(url).toBe("https://portal.clinicez.ph/join/test-tenant/main-clinic?code=JOIN123");

    // Trailing slashes stripped
    const url2 = formatReceptionQrUrl(
      "https://portal.clinicez.ph///",
      "tenant",
      "facility"
    );
    expect(url2).toBe("https://portal.clinicez.ph/join/tenant/facility");

    // Special characters in join code encoded
    const urlSpecial = formatReceptionQrUrl(
      "https://portal.clinicez.ph",
      "tenant",
      "facility",
      "CODE 123 & 456"
    );
    expect(urlSpecial).toBe(
      "https://portal.clinicez.ph/join/tenant/facility?code=CODE%20123%20%26%20456"
    );
  });

  test("CLINIC2.5: Document quarantine review workflow (reviewDocument)", () => {
    const sampleDoc: QuarantinedDoc = {
      id: "doc-1",
      title: "Outside Chest X-Ray",
      verificationStatus: "PendingVerification",
    };

    // Approval sets Verified and clears reason
    const approved = reviewDocument(sampleDoc, true);
    expect(approved.verificationStatus).toBe("Verified");
    expect(approved.rejectionReason).toBeUndefined();

    // Rejection without reason MUST throw
    expect(() => reviewDocument(sampleDoc, false, "")).toThrow(
      "A rejection reason is mandatory when rejecting outside documents"
    );
    expect(() => reviewDocument(sampleDoc, false, "   ")).toThrow(
      "A rejection reason is mandatory when rejecting outside documents"
    );
    expect(() => reviewDocument(sampleDoc, false, undefined)).toThrow(
      "A rejection reason is mandatory when rejecting outside documents"
    );

    // Rejection with reason sets Rejected and trims reason
    const rejected = reviewDocument(
      sampleDoc,
      false,
      "   Illegible radiologist signature and missing patient name   "
    );
    expect(rejected.verificationStatus).toBe("Rejected");
    expect(rejected.rejectionReason).toBe(
      "Illegible radiologist signature and missing patient name"
    );
  });
});
