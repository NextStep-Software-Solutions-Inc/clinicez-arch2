import { Platform } from "react-native";

export type ScheduleAvailabilityPayload = {
  days: string[];
  startTime: string;
  endTime: string;
  timezone?: string;
};

export type ScheduleAvailabilityResult = {
  success: boolean;
  message: string;
  timestamp: string;
};

const simulateNetworkLatency = (minimum = 500, maximum = 1200) => {
  const duration = Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), duration);
  });
};

export const submitScheduleAvailability = async (
  payload: ScheduleAvailabilityPayload
): Promise<ScheduleAvailabilityResult> => {
  await simulateNetworkLatency();

  console.info("[onboarding] schedule preferences", {
    ...payload,
    platform: Platform.OS,
  });

  return {
    success: true,
    message: "Schedule preferences stored locally",
    timestamp: new Date().toISOString(),
  };
};
