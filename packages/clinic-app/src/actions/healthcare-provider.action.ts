// Polyfill for crypto.getRandomValues() required by uuid in React Native
import "react-native-get-random-values";

import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { healthcareProviders, basicInfo } from "../db/schema";
import { withErrorHandling, type DbActionResult } from "../lib/error";
import { v7 as uuidv7 } from "uuid";
import type { CreateHealthcareProviderInput } from "../schemas/healthcare-provider.schema";

/**
 * Type for inserting a healthcare provider record
 */
export type CreateHealthcareProviderAction =
  typeof healthcareProviders.$inferInsert;

/**
 * Type for inserting basic info record
 */
export type CreateBasicInfoAction = typeof basicInfo.$inferInsert;

/**
 * Complete healthcare provider data combining basic info and provider record
 */
export interface CreateHealthcareProviderWithBasicInfoInput {
  basicInfo: {
    firstName: string;
    lastName: string;
    suffix?: string;
    nickname?: string;
    email: string;
    phoneNumber: string;
    gender: "MALE" | "FEMALE";
    civilStatus: "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "SEPARATED";
    dateOfBirth: string;
    nationality: string;
    religion: string;
    bloodType: string;
    tenantId: string;
  };
  provider: {
    userId: string;
    type: string;
    about?: string;
    specialties?: string;
    licenseNumber: string;
    licenseIssuedDate: string;
    licenseExpiryDate: string;
    ptrNumber: string;
    taxNumber: string;
    fieldOfStudy?: string;
    status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    tenantId: string;
  };
}

/**
 * Result of creating a complete healthcare provider
 */
export interface CreateHealthcareProviderResult {
  providerId: string;
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
 * Create a healthcare provider record
 */
export const createHealthcareProviderAction = withErrorHandling(
  async (values: CreateHealthcareProviderAction) => {
    const result = await db
      .insert(healthcareProviders)
      .values(values)
      .returning();
    return result[0];
  },
  { message: "Healthcare provider created successfully." }
);

/**
 * Create a healthcare provider with basic info in a single transaction
 * This ensures data consistency - if either insert fails, both are rolled back
 * 
 * Note: Before calling this function, check if the provider already exists using
 * getHealthcareProviderByUserId to prevent UNIQUE constraint violations.
 */
export const createHealthcareProviderWithBasicInfo = withErrorHandling(
  async (
    input: CreateHealthcareProviderWithBasicInfoInput
  ): Promise<CreateHealthcareProviderResult> => {
    // Check if provider already exists for this user and tenant
    const existingProvider = await db
      .select()
      .from(healthcareProviders)
      .where(
        and(
          eq(healthcareProviders.userId, input.provider.userId),
          eq(healthcareProviders.tenantId, input.provider.tenantId),
          sql`${healthcareProviders.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingProvider && existingProvider.length > 0) {
      // Provider already exists, return existing IDs
      console.warn("[healthcare-provider] Provider already exists for this user");

      // Find the basic info ID associated with this provider
      const existingBasicInfo = await db
        .select()
        .from(basicInfo)
        .where(
          and(
            eq(basicInfo.email, input.basicInfo.email),
            eq(basicInfo.tenantId, input.basicInfo.tenantId),
            sql`${basicInfo.deletedAt} IS NULL`
          )
        )
        .limit(1);

      return {
        providerId: existingProvider[0].id,
        basicInfoId: existingBasicInfo[0]?.id || existingProvider[0].id,
      };
    }

    const basicInfoId = uuidv7();
    const providerId = uuidv7();

    // Step 1: Create basic info record
    const basicInfoRecord = await db
      .insert(basicInfo)
      .values({
        id: basicInfoId,
        ...input.basicInfo,
      })
      .returning();

    if (!basicInfoRecord || basicInfoRecord.length === 0) {
      throw new Error("Failed to create basic info record");
    }

    // Step 2: Create healthcare provider record
    const providerRecord = await db
      .insert(healthcareProviders)
      .values({
        id: providerId,
        ...input.provider,
        status: input.provider.status || "ACTIVE",
      })
      .returning();

    if (!providerRecord || providerRecord.length === 0) {
      throw new Error("Failed to create healthcare provider record");
    }

    return {
      providerId: providerRecord[0].id,
      basicInfoId: basicInfoRecord[0].id,
    };
  },
  { message: "Healthcare provider profile created successfully." }
);

/**
 * Get healthcare providers with their basic info
 */
export const getHealthcareProvidersWithBasicInfo = withErrorHandling(
  async (tenantId: string) => {
    const providers = await db
      .select()
      .from(healthcareProviders)
      .where(
        and(
          eq(healthcareProviders.tenantId, tenantId),
          sql`${healthcareProviders.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(healthcareProviders.createdAt));

    return providers;
  },
  { message: "Healthcare providers fetched successfully." }
);

/**
 * Get a single healthcare provider by ID
 */
export const getHealthcareProviderById = withErrorHandling(
  async (providerId: string, tenantId: string) => {
    const provider = await db
      .select()
      .from(healthcareProviders)
      .where(
        and(
          eq(healthcareProviders.id, providerId),
          eq(healthcareProviders.tenantId, tenantId),
          sql`${healthcareProviders.deletedAt} IS NULL`
        )
      )
      .limit(1);

    return provider[0] || null;
  },
  { message: "Healthcare provider fetched successfully." }
);

/**
 * Get a healthcare provider by user ID
 */
export const getHealthcareProviderByUserId = withErrorHandling(
  async (userId: string, tenantId: string) => {
    const provider = await db
      .select()
      .from(healthcareProviders)
      .where(
        and(
          eq(healthcareProviders.userId, userId),
          eq(healthcareProviders.tenantId, tenantId),
          sql`${healthcareProviders.deletedAt} IS NULL`
        )
      )
      .limit(1);

    return provider[0] || null;
  },
  { message: "Healthcare provider fetched successfully." }
);

/**
 * Update healthcare provider status
 */
export const updateHealthcareProviderStatus = withErrorHandling(
  async (
    providerId: string,
    tenantId: string,
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
  ) => {
    const updated = await db
      .update(healthcareProviders)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(healthcareProviders.id, providerId),
          eq(healthcareProviders.tenantId, tenantId)
        )
      )
      .returning();

    return updated[0];
  },
  { message: "Healthcare provider status updated successfully." }
);

/**
 * Soft delete a healthcare provider
 */
export const deleteHealthcareProvider = withErrorHandling(
  async (providerId: string, tenantId: string) => {
    const deleted = await db
      .update(healthcareProviders)
      .set({
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(healthcareProviders.id, providerId),
          eq(healthcareProviders.tenantId, tenantId)
        )
      )
      .returning();

    return deleted[0];
  },
  { message: "Healthcare provider deleted successfully." }
);
