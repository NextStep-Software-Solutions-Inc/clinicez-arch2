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
import { seedUserData } from "../db/seed-user";
import { db } from "../db/client";

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    console.log("Migration status:", { success, error });
    if (success) {
      console.log("Migrations successful, seeding data...");
      seedUserData(db);
    }
  }, [success]);

  return (
    <ClerkProvider
      publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
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
    </ClerkProvider>
  );
}