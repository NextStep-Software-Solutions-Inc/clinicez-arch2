import * as SecureStore from "expo-secure-store";

const PROFILE_STATUS_KEY = "clinicez.profile.completed";

export const shouldCompleteProfile = async (): Promise<boolean> => {
  try {
    const storedValue = await SecureStore.getItemAsync(PROFILE_STATUS_KEY);
    return storedValue !== "true";
  } catch (error) {
    console.warn("[profile-status] unable to read profile completion status", error);
    return true;
  }
};

export const markProfileAsComplete = async (): Promise<void> => {
  try {
    await SecureStore.setItemAsync(PROFILE_STATUS_KEY, "true");
  } catch (error) {
    console.warn("[profile-status] unable to persist profile completion", error);
  }
};
