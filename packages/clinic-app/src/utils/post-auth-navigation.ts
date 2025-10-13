import { shouldCompleteProfile } from "./profile-status";
import { shouldShowOnboarding } from "./onboarding-status";

export type PostAuthRoute =
  | "/(main)/complete-profile"
  | "/onboarding"
  | "/(main)/(tabs)";

export const determinePostAuthRoute = async (): Promise<PostAuthRoute> => {
  const needsProfile = await shouldCompleteProfile();
  if (needsProfile) {
    return "/(main)/complete-profile";
  }

  const needsOnboarding = await shouldShowOnboarding();
  if (needsOnboarding) {
    return "/onboarding";
  }

  return "/(main)/(tabs)";
};
