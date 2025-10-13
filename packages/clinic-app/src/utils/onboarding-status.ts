import * as SecureStore from "expo-secure-store";

import { shouldCompleteProfile } from "./profile-status";

const ONBOARDING_STATUS_KEY = "clinicez.onboarding.completed";

export const shouldShowOnboarding = async (): Promise<boolean> => {
  try {
    const storedValue = await SecureStore.getItemAsync(ONBOARDING_STATUS_KEY);
    if (storedValue === "true") {
      return false;
    }

    const needsProfile = await shouldCompleteProfile();
    if (needsProfile) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[onboarding-status] unable to read onboarding status", error);
    return false;
  }
};

export const markOnboardingAsComplete = async (): Promise<void> => {
  try {
    await SecureStore.setItemAsync(ONBOARDING_STATUS_KEY, "true");
  } catch (error) {
    console.warn("[onboarding-status] unable to persist onboarding completion", error);
  }
};
