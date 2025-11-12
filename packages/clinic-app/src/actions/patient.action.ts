// Polyfill for crypto.getRandomValues() required by uuid in React Native
import "react-native-get-random-values";

import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { patients, basicInfo } from "../db/schema";
import { withErrorHandling, type DbActionResult } from "../lib/error";
import { v7 as uuidv7 } from "uuid";
import type { CreateBasicInfoInput } from "../schemas/patient.schema";

/**
 * Type for inserting a patient record
 */
export type CreatePatientAction = typeof patients.$inferInsert;

/**
 * Type for inserting basic info record
 */
export type CreateBasicInfoAction = typeof basicInfo.$inferInsert;

/**
 * Complete patient data combining basic info and patient record
 * Note: firstName, lastName, email, and phoneNumber are required
 */
export interface CreatePatientWithBasicInfoInput {
  basicInfo: CreateBasicInfoInput;
  tenantId: string;
}

/**
 * Result of creating a complete patient
 */
export interface CreatePatientResult {
  patientId: string;
  basicInfoId: string;
}

/**
 * Create a basic info record
 */
export const createBasicInfoAction = withErrorHandling(
  async (values: CreateBasicInfoAction) => {
    const result = await db.insert(basicInfo).values(values).returning();
    return result[0];
  },
  { message: "Basic info created successfully." }
);

/**
 * Create a patient record
 */
export const createPatientAction = withErrorHandling(
  async (values: CreatePatientAction) => {
    const result = await db.insert(patients).values(values).returning();
    return result[0];
  },
  { message: "Patient created successfully." }
);

/**
 * Create a complete patient record with basic info
 * This performs a two-step insertion:
 * 1. Creates a basic_info record
 * 2. Creates a patient record referencing the basic_info
 * 
 * @param input - Patient data including basic info and tenant ID
 * @returns Result with patientId and basicInfoId, or error
 * 
 * @example
 * ```typescript
 * const result = await createPatientWithBasicInfo({
 *   basicInfo: {
 *     firstName: "John",
 *     lastName: "Doe",
 *     email: "john@example.com",
 *     phoneNumber: "+1234567890",
 *     gender: "MALE"
 *   },
 *   tenantId: "tenant-uuid"
 * });
 * 
 * if (result.ok) {
 *   console.log("Patient created:", result.data);
 * } else {
 *   console.error("Error:", result.error.userMessage);
 * }
 * ```
 */
export async function createPatientWithBasicInfo(
  input: CreatePatientWithBasicInfoInput
): Promise<DbActionResult<CreatePatientResult>> {
  try {
    const { basicInfo: basicInfoData, tenantId } = input;

    // Generate IDs
    const basicInfoId = uuidv7();
    const patientId = uuidv7();
    const timestamp = new Date().toISOString();

    // Step 1: Create basic info record
    const basicInfoResult = await createBasicInfoAction({
      id: basicInfoId,
      tenantId,
      ...basicInfoData,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    if (!basicInfoResult.ok) {
      // Enhance error message for unique constraint violations
      if (
        basicInfoResult.error.kind.type === "constraint" &&
        basicInfoResult.error.kind.constraint === "unique"
      ) {
        const columns = basicInfoResult.error.meta?.columns;
        if (Array.isArray(columns)) {
          if (columns.some((col) => col.toLowerCase().includes("email"))) {
            basicInfoResult.error.userMessage = "A patient with this email address already exists.";
          } else if (columns.some((col) => col.toLowerCase().includes("phone"))) {
            basicInfoResult.error.userMessage = "A patient with this phone number already exists.";
          }
        }
      }
      return basicInfoResult as DbActionResult<CreatePatientResult>;
    }

    // Step 2: Create patient record referencing the basic info
    const patientResult = await createPatientAction({
      id: patientId,
      tenantId,
      basicInfo: basicInfoId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    if (!patientResult.ok) {
      // TODO: Consider rollback mechanism or compensation
      // For now, the basic info record will remain orphaned
      return patientResult as DbActionResult<CreatePatientResult>;
    }

    return {
      ok: true,
      data: {
        patientId,
        basicInfoId,
      },
      message: "Patient created successfully",
    };
  } catch (error) {
    // TODO: Implement proper error logging service (e.g., Sentry, LogRocket)
    // errorLogger.logError(error, { context: 'createPatientWithBasicInfo', tenantId: input.tenantId });

    return {
      ok: false,
      error: {
        kind: { type: "unknown" },
        message: error instanceof Error ? error.message : "Unknown error",
        userMessage: "Failed to create patient. Please try again.",
        original: error,
      },
    };
  }
}

/**
 * Result type for fetched patient with basic info
 */
export type PatientWithBasicInfo = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  nickname: string | null;
  email: string;
  phoneNumber: string;
  gender: "MALE" | "FEMALE" | null;
  civilStatus: "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "SEPARATED" | null;
  dateOfBirth: string | null;
  nationality: string | null;
  religion: string | null;
  bloodType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Fetch all patients with their basic info for a specific tenant
 */
export async function getPatientsWithBasicInfo(tenantId: string): Promise<DbActionResult<PatientWithBasicInfo[]>> {
  try {
    const result = await db
      .select({
        id: patients.id,
        firstName: basicInfo.firstName,
        middleName: basicInfo.middleName,
        lastName: basicInfo.lastName,
        suffix: basicInfo.suffix,
        nickname: basicInfo.nickname,
        email: basicInfo.email,
        phoneNumber: basicInfo.phoneNumber,
        gender: basicInfo.gender,
        civilStatus: basicInfo.civilStatus,
        dateOfBirth: basicInfo.dateOfBirth,
        nationality: basicInfo.nationality,
        religion: basicInfo.religion,
        bloodType: basicInfo.bloodType,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .innerJoin(
        basicInfo,
        and(
          eq(patients.basicInfo, basicInfo.id),
          eq(patients.tenantId, basicInfo.tenantId)
        )
      )
      .where(eq(patients.tenantId, tenantId))
      .orderBy(desc(patients.createdAt));

    return {
      ok: true,
      data: result,
      message: `Found ${result.length} patients`,
    };
  } catch (error) {
    // TODO: Implement proper error logging service (e.g., Sentry, LogRocket)
    // errorLogger.logError(error, { context: 'getPatientsWithBasicInfo', tenantId });

    return {
      ok: false,
      error: {
        kind: { type: "unknown" },
        message: error instanceof Error ? error.message : "Unknown error",
        userMessage: "Failed to fetch patients. Please try again.",
        original: error,
      },
    };
  }
}

/**
 * Fetch a single patient with basic info by patient ID and tenant ID
 */
export async function getPatientWithBasicInfo(patientId: string, tenantId: string): Promise<DbActionResult<PatientWithBasicInfo | null>> {
  try {
    const result = await db
      .select({
        id: patients.id,
        firstName: basicInfo.firstName,
        middleName: basicInfo.middleName,
        lastName: basicInfo.lastName,
        suffix: basicInfo.suffix,
        nickname: basicInfo.nickname,
        email: basicInfo.email,
        phoneNumber: basicInfo.phoneNumber,
        gender: basicInfo.gender,
        civilStatus: basicInfo.civilStatus,
        dateOfBirth: basicInfo.dateOfBirth,
        nationality: basicInfo.nationality,
        religion: basicInfo.religion,
        bloodType: basicInfo.bloodType,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .innerJoin(
        basicInfo,
        and(
          eq(patients.basicInfo, basicInfo.id),
          eq(patients.tenantId, basicInfo.tenantId)
        )
      )
      .where(
        and(
          eq(patients.id, patientId),
          eq(patients.tenantId, tenantId)
        )
      )
      .limit(1);

    const patient = result[0] || null;

    return {
      ok: true,
      data: patient,
      message: patient ? "Patient found" : "Patient not found",
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: { type: "unknown" },
        message: error instanceof Error ? error.message : "Unknown error",
        userMessage: "Failed to fetch patient. Please try again.",
        original: error,
      },
    };
  }
}
