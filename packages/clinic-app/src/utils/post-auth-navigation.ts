import { shouldCompleteProfile } from "./profile-status";
import { shouldShowOnboarding } from "./onboarding-status";

export type PostAuthRoute =
  | "/(main)/complete-profile"
  | "/onboarding"
  | "/(main)/(tabs)";

/**
 * Determine the appropriate route after authentication based on user's profile and onboarding status.
 * 
 * @param userId - The authenticated user's ID (optional, but recommended for accurate checks)
 * @returns The route path to navigate to
 */
export const determinePostAuthRoute = async (userId?: string): Promise<PostAuthRoute> => {
  const needsProfile = await shouldCompleteProfile(userId);
  if (needsProfile) {
    return "/(main)/complete-profile";
  }

  const needsOnboarding = await shouldShowOnboarding();
  if (needsOnboarding) {
    return "/onboarding";
  }

  return "/(main)/(tabs)";
};
