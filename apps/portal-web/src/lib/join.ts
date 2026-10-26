/**
 * Helper Models & Validation Logic for Portal Web Join Workstation
 */

import { validatePhilHealthPinMod11 } from "./philhealth";

export interface CustomFieldDefinition {
  fieldKey: string;
  label: string;
  isRequired: boolean;
  dataType?: "Text" | "Number" | "Date" | "Boolean" | "Select";
  placeholder?: string;
  options?: string[];
  visibilityCondition?: {
    parentKey: string;
    operator: "equals" | "not_equals" | "not_empty" | "in";
    value?: string | string[];
  };
  cascadingOptions?: Record<string, string[]>;
}

export const INSTITUTIONAL_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  {
    fieldKey: "affiliation",
    label: "Institutional Affiliation",
    isRequired: true,
    dataType: "Select",
    options: ["Student", "Faculty", "Employee", "Dependent", "Guest"],
  },
  {
    fieldKey: "student_id",
    label: "Student ID Number",
    isRequired: true,
    dataType: "Text",
    placeholder: "e.g. 2026-100234",
    visibilityCondition: {
      parentKey: "affiliation",
      operator: "equals",
      value: "Student",
    },
  },
  {
    fieldKey: "college",
    label: "College / Faculty Department",
    isRequired: true,
    dataType: "Select",
    visibilityCondition: {
      parentKey: "affiliation",
      operator: "equals",
      value: "Student",
    },
    options: [
      "College of Engineering",
      "College of Computer Studies",
      "College of Nursing & Allied Health",
      "College of Science & Mathematics",
      "College of Business Administration",
    ],
  },
  {
    fieldKey: "program",
    label: "Academic Degree Program",
    isRequired: true,
    dataType: "Select",
    visibilityCondition: {
      parentKey: "college",
      operator: "not_empty",
      value: "",
    },
    cascadingOptions: {
      "College of Engineering": [
        "BS Civil Engineering",
        "BS Electrical Engineering",
        "BS Mechanical Engineering",
        "BS Computer Engineering",
      ],
      "College of Computer Studies": [
        "BS Computer Science",
        "BS Information Technology",
        "BS Information Systems",
      ],
      "College of Nursing & Allied Health": [
        "BS Nursing",
        "BS Medical Technology",
        "BS Physical Therapy",
      ],
      "College of Science & Mathematics": [
        "BS Applied Physics",
        "BS Chemistry",
        "BS Mathematics",
      ],
      "College of Business Administration": [
        "BS Accountancy",
        "BS Business Administration",
      ],
    },
  },
  {
    fieldKey: "year_level",
    label: "Year Level",
    isRequired: false,
    dataType: "Select",
    options: ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "Postgraduate"],
    visibilityCondition: {
      parentKey: "affiliation",
      operator: "equals",
      value: "Student",
    },
  },
];

export function evaluateFieldVisibility(
  field: CustomFieldDefinition,
  formValues: Record<string, any>
): boolean {
  if (!field.visibilityCondition) return true;
  const parentVal = formValues[field.visibilityCondition.parentKey];
  const { operator, value } = field.visibilityCondition;

  if (operator === "equals") {
    return parentVal === value;
  }
  if (operator === "not_equals") {
    return parentVal !== value;
  }
  if (operator === "not_empty") {
    return parentVal !== null && parentVal !== undefined && String(parentVal).trim() !== "";
  }
  if (operator === "in") {
    if (Array.isArray(value)) {
      return value.includes(parentVal);
    }
    return false;
  }
  return true;
}

export function getCascadingChoices(
  field: CustomFieldDefinition,
  formValues: Record<string, any>
): string[] {
  if (!field.cascadingOptions || !field.visibilityCondition) return [];
  const parentVal = formValues[field.visibilityCondition.parentKey];
  return (parentVal && field.cascadingOptions[parentVal]) || [];
}

// Aliases for parity
export const evaluateFieldCondition = evaluateFieldVisibility;
export const resolveCascadingOptions = getCascadingChoices;

export interface PinValidationGuardResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates Patient PhilHealth PIN for form submission.
 * Patient PIN is optional, but if entered, must be 12 digits and pass Mod-11.
 */
export function validatePatientPinForSubmit(pin?: string): PinValidationGuardResult {
  const trimmed = (pin || "").trim();
  if (!trimmed) {
    return { isValid: true };
  }
  const result = validatePhilHealthPinMod11(trimmed);
  if (!result.isValid || !result.isComplete) {
    return {
      isValid: false,
      errorMessage: result.errorMessage
        ? `Patient PhilHealth PIN error: ${result.errorMessage}`
        : "Patient PhilHealth PIN is invalid (Mod-11 check digit verification failed).",
    };
  }
  return { isValid: true };
}

/**
 * Validates Principal Member PhilHealth PIN for form submission.
 * When memberType is 'DD', Principal PIN is mandatory and must pass Mod-11.
 */
export function validatePrincipalPinForSubmit(
  memberType: "MM" | "DD",
  pin?: string
): PinValidationGuardResult {
  if (memberType !== "DD") {
    return { isValid: true };
  }
  const trimmed = (pin || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      errorMessage: "Principal member PhilHealth PIN is required.",
    };
  }
  const result = validatePhilHealthPinMod11(trimmed);
  if (!result.isValid || !result.isComplete) {
    return {
      isValid: false,
      errorMessage: result.errorMessage
        ? `Principal PhilHealth PIN error: ${result.errorMessage}`
        : "Principal PhilHealth PIN is invalid (Mod-11 check digit verification failed).",
    };
  }
  return { isValid: true };
}


export function sanitizeCustomFields(
  fields: CustomFieldDefinition[],
  formValues: Record<string, any>
): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const field of fields) {
    if (evaluateFieldVisibility(field, formValues)) {
      if (formValues[field.fieldKey] !== undefined && formValues[field.fieldKey] !== "") {
        sanitized[field.fieldKey] = formValues[field.fieldKey];
      }
    }
  }
  return sanitized;
}

export function validateFileUpload(file: {
  name: string;
  sizeBytes: number;
  mimeType: string;
}): {
  isValid: boolean;
  errorMessage?: string;
} {
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB

  if (!allowedMimeTypes.includes(file.mimeType)) {
    return { isValid: false, errorMessage: "Only PDF, JPEG, and PNG files are accepted" };
  }
  if (file.sizeBytes > maxSizeBytes) {
    return { isValid: false, errorMessage: "File size exceeds maximum 10MB limit" };
  }
  return { isValid: true };
}

export interface GeneratedDigitalPass {
  queueToken: string;
  patientCode: string;
  patientName: string;
  issuedAt: string;
  qrDataString: string;
}

export function generateDigitalPass(
  patientCode: string,
  seq: number,
  fullName: string
): GeneratedDigitalPass {
  const queueToken = `Q-${seq.toString().padStart(3, "0")}`;
  const issuedAt = new Date().toISOString();
  const qrDataString = JSON.stringify({
    code: patientCode,
    queue: queueToken,
    issued: issuedAt,
  });

  return {
    queueToken,
    patientCode,
    patientName: fullName,
    issuedAt,
    qrDataString,
  };
}
