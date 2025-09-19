import Constants from "expo-constants";
import { z } from "zod";

const EnvSchema = z.object({
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
});

const envVars = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
    Constants.expoConfig?.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    "pk_test_placeholder_key",
};

const parsedEnv = EnvSchema.safeParse(envVars);

if (!parsedEnv.success) {
  console.warn("Environment variables not configured:", z.treeifyError(parsedEnv.error));
}

export const env = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: envVars.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
};