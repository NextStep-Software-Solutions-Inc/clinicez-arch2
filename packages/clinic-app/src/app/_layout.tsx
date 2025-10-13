import { Slot } from "expo-router";
import "../../global.css";
import { env } from "@env";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ThemeProvider } from "@components/providers/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <SafeAreaProvider>
        <ThemeProvider>
          <Slot />
        </ThemeProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}