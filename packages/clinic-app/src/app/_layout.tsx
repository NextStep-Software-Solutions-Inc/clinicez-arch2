import { Slot } from "expo-router";
import "../../global.css";
import { env } from "@env";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ThemeProvider } from "@components/providers/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Suspense, useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
// Run `pnpm generate` to create the `drizzle` directory and its contents
import migrations from "@drizzle/migrations";
import { db } from "../db/client";
import { Provider as JotaiProvider } from "jotai";
import Toast from "react-native-toast-message";

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    console.log("Migration status:", { success, error });
    if (success) {
      console.log("Migrations applied successfully.");
    }
  }, [success]);

  return (
    <>
      <ClerkProvider
        publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
        tokenCache={tokenCache}
      >
        <JotaiProvider>
          <Suspense fallback={<ActivityIndicator size={"large"} />}>
            <SQLiteProvider
              databaseName={env.EXPO_PUBLIC_DATABASE_NAME}
              options={{ enableChangeListener: true }}
              useSuspense
            >
              <SafeAreaProvider>
                <ThemeProvider>
                  <Slot />
                </ThemeProvider>
              </SafeAreaProvider>
            </SQLiteProvider>
          </Suspense>
        </JotaiProvider>
      </ClerkProvider>

      {/* Toast - positioned to appear above everything including modals */}
      <Toast
        topOffset={60}
      />
    </>
  );
}