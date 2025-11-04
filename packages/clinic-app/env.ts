import { z } from "zod";

/**
 * Environment Variables Schema
 * 
 * Define all required environment variables here.
 * The app will not start if any required variables are missing or invalid.
 * 
 * Note: Variables prefixed with EXPO_PUBLIC_ are automatically loaded from .env files
 * by Expo CLI and inlined into your JavaScript bundle at build time.
 */
const EnvSchema = z.object({
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  EXPO_PUBLIC_DATABASE_NAME: z
    .string()
    .min(1, "EXPO_PUBLIC_DATABASE_NAME is required"),
});

/**
 * Read environment variables directly from process.env
 * Expo CLI automatically replaces process.env.EXPO_PUBLIC_* references
 * with the actual values from your .env files
 */
const envVars = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  EXPO_PUBLIC_DATABASE_NAME: process.env.EXPO_PUBLIC_DATABASE_NAME,
};

/**
 * Validate environment variables
 * This will throw an error if validation fails, preventing the app from starting
 */
const parsedEnv = EnvSchema.safeParse(envVars);

if (!parsedEnv.success) {
  // Format error messages for better readability
  const errorMessages = parsedEnv.error.issues
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join('\n');

  const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENT VARIABLES VALIDATION FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following environment variables are missing or invalid:

${errorMessages}

Please ensure you have a valid .env file with all required variables.
You can copy .env.example to create your local environment file:

  cp .env.example .env.development.local

Then fill in the required values:
  - EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
  - EXPO_PUBLIC_DATABASE_NAME

After updating your .env file, restart the dev server:

  yarn start --clear

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  console.error(errorMessage);

  // Throw an error to prevent the app from starting
  throw new Error("Environment variables validation failed. Check the console for details.");
}

/**
 * Validated and type-safe environment variables
 * Use this throughout your app to access environment variables
 */
export const env = parsedEnv.data;