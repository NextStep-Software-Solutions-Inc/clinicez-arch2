import * as SecureStore from "expo-secure-store";
import { getHealthcareProviderByUserId } from "@actions/healthcare-provider.action";

const PROFILE_STATUS_KEY = "clinicez.profile.completed";
const TENANT_ID = "default-tenant"; // TODO: Get from context or auth

/**
 * Check if the user needs to complete their profile.
 * This function checks both SecureStore (for performance) and the database (for accuracy).
 * 
 * @param userId - The authenticated user's ID
 * @returns true if profile completion is needed, false otherwise
 */
export const shouldCompleteProfile = async (userId?: string): Promise<boolean> => {
  console.log("[profile-status] Checking profile completion status", { userId, hasUserId: !!userId });

  try {
    // First check SecureStore for quick response
    const storedValue = await SecureStore.getItemAsync(PROFILE_STATUS_KEY);
    console.log("[profile-status] SecureStore value:", storedValue);

    // If SecureStore says it's complete, verify with database
    if (storedValue === "true" && userId) {
      console.log("[profile-status] SecureStore indicates complete, verifying with database...");
      const providerResult = await getHealthcareProviderByUserId(userId, TENANT_ID);

      // If database check fails or returns no provider, clear SecureStore and require completion
      if (!providerResult.ok || !providerResult.data) {
        console.log("[profile-status] Database check failed or no provider found, clearing SecureStore");
        await SecureStore.deleteItemAsync(PROFILE_STATUS_KEY);
        return true;
      }

      console.log("[profile-status] Provider exists in database, profile is complete");
      // Both SecureStore and database confirm completion
      return false;
    }

    // If SecureStore says incomplete and we have a userId, check database as source of truth
    if (userId) {
      console.log("[profile-status] Checking database for existing provider...");
      const providerResult = await getHealthcareProviderByUserId(userId, TENANT_ID);

      // If provider exists in database, sync SecureStore
      if (providerResult.ok && providerResult.data) {
        console.log("[profile-status] Provider found in database, syncing SecureStore");
        await SecureStore.setItemAsync(PROFILE_STATUS_KEY, "true");
        return false;
      }

      console.log("[profile-status] No provider found in database");
    }

    // Default to requiring profile completion
    const needsCompletion = storedValue !== "true";
    console.log("[profile-status] Final decision: needsCompletion =", needsCompletion);
    return needsCompletion;
  } catch (error) {
    console.warn("[profile-status] unable to read profile completion status", error);
    // On error, check if we can verify via database
    if (userId) {
      try {
        const providerResult = await getHealthcareProviderByUserId(userId, TENANT_ID);
        return !providerResult.ok || !providerResult.data;
      } catch (dbError) {
        console.warn("[profile-status] database check failed", dbError);
      }
    }
    return true;
  }
};

/**
 * Mark the user's profile as complete in SecureStore.
 * This should only be called after successfully creating the healthcare provider in the database.
 */
export const markProfileAsComplete = async (): Promise<void> => {
  try {
    await SecureStore.setItemAsync(PROFILE_STATUS_KEY, "true");
  } catch (error) {
    console.warn("[profile-status] unable to persist profile completion", error);
  }
};

/**
 * Clear the profile completion status.
 * Useful for testing or if profile needs to be re-completed.
 */
export const clearProfileStatus = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(PROFILE_STATUS_KEY);
  } catch (error) {
    console.warn("[profile-status] unable to clear profile completion status", error);
  }
};
