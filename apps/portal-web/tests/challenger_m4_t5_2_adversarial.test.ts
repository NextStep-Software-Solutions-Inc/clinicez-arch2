import { describe, expect, test } from "bun:test";
import {
  formatPhilHealthPin,
  validatePhilHealthPinMod11,
  PHILHEALTH_MOD11_WEIGHTS,
  type MemberType,
  type PrincipalRelationship,
} from "../src/lib/philhealth";
import {
  evaluateFieldVisibility,
  getCascadingChoices,
  sanitizeCustomFields,
  validateFileUpload,
  generateDigitalPass,
  validatePatientPinForSubmit,
  validatePrincipalPinForSubmit,
  type CustomFieldDefinition,
} from "../src/lib/join";
import {
  generateQrMatrix,
  buildQrPathData,
  buildQrSvgString,
} from "../src/components/join/qrGenerator";
import { INSTITUTIONAL_CUSTOM_FIELDS } from "../src/components/join/JoinClient";

describe("Adversarial Suite 1: PhilHealth Mod-11 Check Digit Exhaustion (All 11 Remainder Cases)", () => {
  /**
   * Weights: [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
   * Remainder mapping:
   * rem = 0 -> expected check digit 0
   * rem = 1 -> expected check digit 0
   * rem = 2 -> 11 - 2 = 9
   * rem = 3 -> 11 - 3 = 8
   * rem = 4 -> 11 - 4 = 7
   * rem = 5 -> 11 - 5 = 6
   * rem = 6 -> 11 - 6 = 5
   * rem = 7 -> 11 - 7 = 4
   * rem = 8 -> 11 - 8 = 3
   * rem = 9 -> 11 - 9 = 2
   * rem = 10 -> 11 - 10 = 1
   */
  const remainderTestCases = [
    { rem: 0, prefix: "00000000000", expectedCheckDigit: 0 },
    { rem: 1, prefix: "00000000006", expectedCheckDigit: 0 },
    { rem: 2, prefix: "00000000001", expectedCheckDigit: 9 },
    { rem: 3, prefix: "00000000007", expectedCheckDigit: 8 },
    { rem: 4, prefix: "00000000002", expectedCheckDigit: 7 },
    { rem: 5, prefix: "00000000008", expectedCheckDigit: 6 },
    { rem: 6, prefix: "00000000003", expectedCheckDigit: 5 },
    { rem: 7, prefix: "00000000009", expectedCheckDigit: 4 },
    { rem: 8, prefix: "00000000004", expectedCheckDigit: 3 },
    { rem: 9, prefix: "00000000030", expectedCheckDigit: 2 },
    { rem: 10, prefix: "00000000005", expectedCheckDigit: 1 },
  ];

  test("ADV1.1: Verify mathematical weighted sums for all 11 remainder cases", () => {
    for (const tc of remainderTestCases) {
      let sum = 0;
      for (let i = 0; i < 11; i++) {
        sum += parseInt(tc.prefix[i], 10) * PHILHEALTH_MOD11_WEIGHTS[i];
      }
      expect(sum % 11).toBe(tc.rem);
    }
  });

  test("ADV1.2: Exhaustive 110-permutation check digit test (11 remainders x 10 candidate digits)", () => {
    let testedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const tc of remainderTestCases) {
      for (let digit = 0; digit <= 9; digit++) {
        testedCount++;
        const candidatePin = `${tc.prefix}${digit}`;
        const result = validatePhilHealthPinMod11(candidatePin);

        if (digit === tc.expectedCheckDigit) {
          acceptedCount++;
          expect(result.isValid).toBe(true);
          expect(result.isComplete).toBe(true);
          expect(result.expectedCheckDigit).toBe(tc.expectedCheckDigit);
          expect(result.actualCheckDigit).toBe(digit);
          expect(result.errorMessage).toBeUndefined();
        } else {
          rejectedCount++;
          expect(result.isValid).toBe(false);
          expect(result.isComplete).toBe(true);
          expect(result.expectedCheckDigit).toBe(tc.expectedCheckDigit);
          expect(result.actualCheckDigit).toBe(digit);
          expect(result.errorMessage).toBeDefined();
          expect(result.errorMessage).toContain(
            `Check digit mismatch (expected ${tc.expectedCheckDigit}, got ${digit})`
          );
        }
      }
    }

    expect(testedCount).toBe(110);
    expect(acceptedCount).toBe(11); // Exactly 1 valid check digit per remainder
    expect(rejectedCount).toBe(99); // Exactly 9 rejected check digits per remainder
  });

  test("ADV1.3: Formatted hyphenated input across all 11 remainders (XX-XXXXXXXXX-X)", () => {
    for (const tc of remainderTestCases) {
      const raw = `${tc.prefix}${tc.expectedCheckDigit}`;
      const formatted = formatPhilHealthPin(raw);
      expect(formatted).toBe(
        `${raw.slice(0, 2)}-${raw.slice(2, 11)}-${raw.slice(11, 12)}`
      );

      const validation = validatePhilHealthPinMod11(formatted);
      expect(validation.isValid).toBe(true);
      expect(validation.isComplete).toBe(true);
    }
  });

  test("ADV1.4: Extreme corruption & dirty character injection in PIN", () => {
    // Non-numeric injections should be stripped
    const dirtyValid = "12-345678901-8";
    expect(validatePhilHealthPinMod11("12-345678901-8").isValid).toBe(true);
    expect(validatePhilHealthPinMod11("12 345678901 8").isValid).toBe(true);
    expect(validatePhilHealthPinMod11("12.345678901.8").isValid).toBe(true);
    expect(validatePhilHealthPinMod11("PH-12-345678901-8").isValid).toBe(true); // 'PH-' stripped -> 12 digits

    // Truncated & empty values
    expect(validatePhilHealthPinMod11("").isValid).toBe(false);
    expect(validatePhilHealthPinMod11("   ").isValid).toBe(false);
    expect(validatePhilHealthPinMod11("12345").isValid).toBe(false);
    expect(validatePhilHealthPinMod11("12345").errorMessage).toBe("Incomplete PIN (5/12 digits)");

    // Overflow values (>12 digits)
    expect(validatePhilHealthPinMod11("1234567890123").isValid).toBe(false);
    expect(validatePhilHealthPinMod11("1234567890123").errorMessage).toBe(
      "PIN must not exceed 12 digits (found 13)"
    );
  });
});

describe("Adversarial Suite 2: Rapid Toggling between MM and DD with Dirty Inputs", () => {
  const dirtyPrincipal = {
    principalPin: "12-345678901-8",
    principalFullName: "Maria Santos Dela Cruz",
    principalRelationship: "S" as PrincipalRelationship,
    principalDob: "1980-05-15",
  };

  test("ADV2.1: Under MM, dirty principal inputs are fully ignored during submission validation", () => {
    // Dirty, invalid, or missing principal PIN should not block MM
    expect(validatePrincipalPinForSubmit("MM", "").isValid).toBe(true);
    expect(validatePrincipalPinForSubmit("MM", "INVALID-PIN").isValid).toBe(true);
    expect(validatePrincipalPinForSubmit("MM", "00-000000000-9").isValid).toBe(true);
  });

  test("ADV2.2: Under DD, principal PIN is strictly validated and enforced", () => {
    expect(validatePrincipalPinForSubmit("DD", "").isValid).toBe(false);
    expect(validatePrincipalPinForSubmit("DD", "").errorMessage).toBe(
      "Principal member PhilHealth PIN is required."
    );

    // Incomplete PIN
    expect(validatePrincipalPinForSubmit("DD", "12345").isValid).toBe(false);

    // Corrupted PIN
    expect(validatePrincipalPinForSubmit("DD", "12-345678901-0").isValid).toBe(false);

    // Valid PIN
    expect(validatePrincipalPinForSubmit("DD", "12-345678901-8").isValid).toBe(true);
  });

  test("ADV2.3: Rapid 500-cycle toggling between MM and DD preserves state isolation", () => {
    let currentMemberType: MemberType = "MM";
    let storedPrincipalPin = dirtyPrincipal.principalPin;
    let storedPrincipalName = dirtyPrincipal.principalFullName;

    for (let cycle = 0; cycle < 500; cycle++) {
      currentMemberType = currentMemberType === "MM" ? "DD" : "MM";

      if (currentMemberType === "MM") {
        // When MM, synthesized submission payload MUST NOT contain principal credentials
        const payloadPrincipalPin = currentMemberType === "DD" ? storedPrincipalPin : undefined;
        const payloadPrincipalName = currentMemberType === "DD" ? storedPrincipalName : undefined;

        expect(payloadPrincipalPin).toBeUndefined();
        expect(payloadPrincipalName).toBeUndefined();
        expect(validatePrincipalPinForSubmit(currentMemberType, storedPrincipalPin).isValid).toBe(true);
      } else {
        // When DD, synthesized submission payload MUST contain principal credentials
        const payloadPrincipalPin = currentMemberType === "DD" ? storedPrincipalPin : undefined;
        const payloadPrincipalName = currentMemberType === "DD" ? storedPrincipalName : undefined;

        expect(payloadPrincipalPin).toBe(dirtyPrincipal.principalPin);
        expect(payloadPrincipalName).toBe(dirtyPrincipal.principalFullName);
        expect(validatePrincipalPinForSubmit(currentMemberType, storedPrincipalPin).isValid).toBe(true);
      }
    }
  });

  test("ADV2.4: Patient PIN optionality vs integrity", () => {
    // Patient PIN is optional for both MM and DD
    expect(validatePatientPinForSubmit("").isValid).toBe(true);
    expect(validatePatientPinForSubmit("   ").isValid).toBe(true);
    expect(validatePatientPinForSubmit(undefined).isValid).toBe(true);

    // If provided, MUST pass Mod-11
    expect(validatePatientPinForSubmit("12345").isValid).toBe(false);
    expect(validatePatientPinForSubmit("12-345678901-0").isValid).toBe(false);
    expect(validatePatientPinForSubmit("12-345678901-8").isValid).toBe(true);
  });
});

describe("Adversarial Suite 3: Cascading Custom Field Condition Mutations Across All 5 Colleges", () => {
  const engineeringPrograms = [
    "BS Civil Engineering",
    "BS Electrical Engineering",
    "BS Mechanical Engineering",
    "BS Computer Engineering",
  ];
  const ccsPrograms = [
    "BS Computer Science",
    "BS Information Technology",
    "BS Information Systems",
  ];
  const nursingPrograms = [
    "BS Nursing",
    "BS Medical Technology",
    "BS Physical Therapy",
  ];
  const sciencePrograms = [
    "BS Applied Physics",
    "BS Chemistry",
    "BS Mathematics",
  ];
  const baPrograms = [
    "BS Accountancy",
    "BS Business Administration",
  ];

  const collegeMap: Record<string, string[]> = {
    "College of Engineering": engineeringPrograms,
    "College of Computer Studies": ccsPrograms,
    "College of Nursing & Allied Health": nursingPrograms,
    "College of Science & Mathematics": sciencePrograms,
    "College of Business Administration": baPrograms,
  };

  const collegeField = INSTITUTIONAL_CUSTOM_FIELDS.find((f) => f.fieldKey === "college")!;
  const programField = INSTITUTIONAL_CUSTOM_FIELDS.find((f) => f.fieldKey === "program")!;
  const studentIdField = INSTITUTIONAL_CUSTOM_FIELDS.find((f) => f.fieldKey === "student_id")!;
  const yearLevelField = INSTITUTIONAL_CUSTOM_FIELDS.find((f) => f.fieldKey === "year_level")!;

  test("ADV3.1: Verify exhaustive cascading options across all 5 institutional colleges", () => {
    expect(collegeField.options).toHaveLength(5);

    for (const [collegeName, expectedPrograms] of Object.entries(collegeMap)) {
      const choices = getCascadingChoices(programField, { college: collegeName });
      expect(choices).toEqual(expectedPrograms);
      expect(choices.length).toBe(expectedPrograms.length);

      // Verify no empty or duplicate program names
      const uniqueChoices = new Set(choices);
      expect(uniqueChoices.size).toBe(choices.length);
      for (const choice of choices) {
        expect(choice.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("ADV3.2: Edge parent values for cascading dropdown resolution", () => {
    // Nonexistent college returns empty choices
    expect(getCascadingChoices(programField, { college: "School of Architecture" })).toEqual([]);
    expect(getCascadingChoices(programField, { college: "" })).toEqual([]);
    expect(getCascadingChoices(programField, { college: null })).toEqual([]);
    expect(getCascadingChoices(programField, { college: undefined })).toEqual([]);
    expect(getCascadingChoices(programField, {})).toEqual([]);

    // Custom field without cascadingOptions returns empty choices
    expect(getCascadingChoices(studentIdField, { affiliation: "Student" })).toEqual([]);
  });

  test("ADV3.3: Dynamic field visibility condition operators (equals, not_equals, not_empty, in)", () => {
    // equals
    const equalsField: CustomFieldDefinition = {
      fieldKey: "test_eq",
      label: "Test Equals",
      isRequired: false,
      visibilityCondition: { parentKey: "role", operator: "equals", value: "Admin" },
    };
    expect(evaluateFieldVisibility(equalsField, { role: "Admin" })).toBe(true);
    expect(evaluateFieldVisibility(equalsField, { role: "User" })).toBe(false);

    // not_equals
    const notEqualsField: CustomFieldDefinition = {
      fieldKey: "test_neq",
      label: "Test Not Equals",
      isRequired: false,
      visibilityCondition: { parentKey: "role", operator: "not_equals", value: "Guest" },
    };
    expect(evaluateFieldVisibility(notEqualsField, { role: "Student" })).toBe(true);
    expect(evaluateFieldVisibility(notEqualsField, { role: "Guest" })).toBe(false);

    // not_empty
    const notEmptyField: CustomFieldDefinition = {
      fieldKey: "test_ne",
      label: "Test Not Empty",
      isRequired: false,
      visibilityCondition: { parentKey: "department", operator: "not_empty" },
    };
    expect(evaluateFieldVisibility(notEmptyField, { department: "Engineering" })).toBe(true);
    expect(evaluateFieldVisibility(notEmptyField, { department: "" })).toBe(false);
    expect(evaluateFieldVisibility(notEmptyField, { department: "   " })).toBe(false); // whitespace treated as empty
    expect(evaluateFieldVisibility(notEmptyField, { department: null })).toBe(false);
    expect(evaluateFieldVisibility(notEmptyField, { department: undefined })).toBe(false);

    // in
    const inField: CustomFieldDefinition = {
      fieldKey: "test_in",
      label: "Test In",
      isRequired: false,
      visibilityCondition: { parentKey: "category", operator: "in", value: ["A", "B", "C"] },
    };
    expect(evaluateFieldVisibility(inField, { category: "B" })).toBe(true);
    expect(evaluateFieldVisibility(inField, { category: "Z" })).toBe(false);
    expect(evaluateFieldVisibility(inField, { category: null })).toBe(false);

    // No condition returns true
    const unconditionalField: CustomFieldDefinition = {
      fieldKey: "unconditional",
      label: "Unconditional",
      isRequired: false,
    };
    expect(evaluateFieldVisibility(unconditionalField, {})).toBe(true);
  });

  test("ADV3.4: Custom field sanitization strips hidden fields when switching from Student to Guest/Employee", () => {
    const dirtyFormValues = {
      affiliation: "Guest",
      student_id: "2026-99999",
      college: "College of Engineering",
      year_level: "3rd Year",
    };

    const sanitized = sanitizeCustomFields(INSTITUTIONAL_CUSTOM_FIELDS, dirtyFormValues);

    expect(sanitized.affiliation).toBe("Guest");
    expect(sanitized.student_id).toBeUndefined();
    expect(sanitized.college).toBeUndefined();
    expect(sanitized.year_level).toBeUndefined();
  });
});

describe("Adversarial Suite 4: File Upload Dropzone Boundary & MIME Testing", () => {
  const TEN_MB = 10 * 1024 * 1024; // 10,485,760 bytes

  test("ADV4.1: File size boundary limits (exact 10MB vs 10MB + 1 byte)", () => {
    // Exact 10MB should pass
    const exact10Mb = validateFileUpload({
      name: "chest_xray.pdf",
      sizeBytes: TEN_MB,
      mimeType: "application/pdf",
    });
    expect(exact10Mb.isValid).toBe(true);

    // 10MB - 1 byte should pass
    const under10Mb = validateFileUpload({
      name: "chest_xray.pdf",
      sizeBytes: TEN_MB - 1,
      mimeType: "application/pdf",
    });
    expect(under10Mb.isValid).toBe(true);

    // 10MB + 1 byte should fail
    const over10Mb = validateFileUpload({
      name: "chest_xray.pdf",
      sizeBytes: TEN_MB + 1,
      mimeType: "application/pdf",
    });
    expect(over10Mb.isValid).toBe(false);
    expect(over10Mb.errorMessage).toBe("File size exceeds maximum 10MB limit");

    // Extremely large file (100MB) should fail
    const hugeFile = validateFileUpload({
      name: "scan.png",
      sizeBytes: 100 * 1024 * 1024,
      mimeType: "image/png",
    });
    expect(hugeFile.isValid).toBe(false);
    expect(hugeFile.errorMessage).toBe("File size exceeds maximum 10MB limit");
  });

  test("ADV4.2: MIME type whitelist enforcement and extension spoofing", () => {
    // Valid MIME types
    expect(
      validateFileUpload({ name: "doc.pdf", sizeBytes: 1024, mimeType: "application/pdf" }).isValid
    ).toBe(true);
    expect(
      validateFileUpload({ name: "photo.jpg", sizeBytes: 1024, mimeType: "image/jpeg" }).isValid
    ).toBe(true);
    expect(
      validateFileUpload({ name: "photo.png", sizeBytes: 1024, mimeType: "image/png" }).isValid
    ).toBe(true);

    // Prohibited MIME types (executables, scripts, archives, docs)
    const dangerousMimeTypes = [
      "application/x-msdownload", // .exe
      "application/x-sh",         // .sh
      "application/javascript",   // .js
      "text/html",                // .html
      "application/zip",          // .zip
      "application/msword",       // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/octet-stream", // generic binary
    ];

    for (const mime of dangerousMimeTypes) {
      const res = validateFileUpload({ name: "file.ext", sizeBytes: 1024, mimeType: mime });
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toBe("Only PDF, JPEG, and PNG files are accepted");
    }
  });

  test("ADV4.3: Multi-extension and special character filename handling", () => {
    // Multi-extension file with legitimate MIME type
    const multiExt = validateFileUpload({
      name: "medical_report.pdf.exe",
      sizeBytes: 2048,
      mimeType: "application/x-msdownload",
    });
    expect(multiExt.isValid).toBe(false);

    // Empty filename with valid MIME
    const emptyName = validateFileUpload({
      name: "",
      sizeBytes: 1024,
      mimeType: "application/pdf",
    });
    // Size and MIME valid
    expect(emptyName.isValid).toBe(true);

    // Zero-byte file
    const zeroByte = validateFileUpload({
      name: "empty.pdf",
      sizeBytes: 0,
      mimeType: "application/pdf",
    });
    expect(zeroByte.isValid).toBe(true);
  });
});

describe("Adversarial Suite 5: Digital Pass QR Payload Encoding, Unicode, and XSS Resiliency", () => {
  test("ADV5.1: Special characters and apostrophes in Digital Pass payload", () => {
    const pass = generateDigitalPass(
      "PAT-2026-O'Connor",
      105,
      "Dr. Jose P. O'Connor & Sons"
    );

    expect(pass.queueToken).toBe("Q-105");
    expect(pass.patientCode).toBe("PAT-2026-O'Connor");
    expect(pass.patientName).toBe("Dr. Jose P. O'Connor & Sons");

    // QR Data String must be valid JSON
    const parsed = JSON.parse(pass.qrDataString);
    expect(parsed.code).toBe("PAT-2026-O'Connor");
    expect(parsed.queue).toBe("Q-105");
    expect(typeof parsed.issued).toBe("string");
  });

  test("ADV5.2: Unicode and Philippine local characters in Digital Pass payload", () => {
    const unicodeNames = [
      "José Protacio Rizal-Mercado y Alonso Realonda",
      "Juan Dela Peña Ñoño Jr.",
      "Maria Kristina Sto. Niño",
      "李小龙 (Bruce Lee)",
      "Dr. 🏥 Healthcare 🩺 Specialist",
    ];

    for (let idx = 0; idx < unicodeNames.length; idx++) {
      const name = unicodeNames[idx];
      const code = `PAT-2026-${idx.toString().padStart(5, "0")}`;
      const pass = generateDigitalPass(code, idx + 1, name);

      expect(pass.patientName).toBe(name);
      expect(pass.queueToken).toBe(`Q-${(idx + 1).toString().padStart(3, "0")}`);

      const parsed = JSON.parse(pass.qrDataString);
      expect(parsed.code).toBe(code);

      // Verify QR matrix generation succeeds without exception
      const qrMatrix = generateQrMatrix(pass.qrDataString);
      expect(qrMatrix.size).toBeGreaterThanOrEqual(33);
      expect(qrMatrix.modules.length).toBe(qrMatrix.size);

      // Verify SVG path string contains valid SVG path commands
      const pathData = buildQrPathData(qrMatrix.modules);
      expect(pathData.length).toBeGreaterThan(0);
      expect(pathData).toMatch(/^M\d+,\d+h1v1h-1Z/);

      // Verify full SVG string generation
      const svgString = buildQrSvgString(qrMatrix);
      expect(svgString).toContain("<svg");
      expect(svgString).toContain("</svg>");
      expect(svgString).toContain("<path");
    }
  });

  test("ADV5.3: QR Matrix structural integrity (Finder Patterns at corners)", () => {
    const matrix = generateQrMatrix("TEST_QR_PAYLOAD_STRING_FOR_VERIFICATION");
    const { size, modules } = matrix;

    // Top-left finder center (at row 3, col 3) must be black (true)
    expect(modules[3][3]).toBe(true);

    // Top-right finder center (at row 3, col size - 4) must be black (true)
    expect(modules[3][size - 4]).toBe(true);

    // Bottom-left finder center (at row size - 4, col 3) must be black (true)
    expect(modules[size - 4][3]).toBe(true);

    // Quiet zone and path generation verification
    const pathData = buildQrPathData(modules);
    expect(pathData.split(" ").length).toBeGreaterThan(50);
  });

  test("ADV5.4: XSS payload in patient code or queue token renders inertly in QR SVG path", () => {
    const maliciousPayload = '<script>alert("XSS")</script>';
    const matrix = generateQrMatrix(maliciousPayload);

    // buildQrPathData should only output coordinate commands, zero raw text
    const pathData = buildQrPathData(matrix.modules);
    expect(pathData).not.toContain("<script>");
    expect(pathData).not.toContain("alert");
    expect(pathData).not.toContain("XSS");

    const svg = buildQrSvgString(matrix);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("alert");
  });
});
