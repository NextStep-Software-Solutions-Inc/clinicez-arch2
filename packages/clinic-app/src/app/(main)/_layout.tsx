import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";

/**
 * Main Layout with Stack Navigator
 * 
 * This layout wraps all main app screens (tabs, profile, etc.) in a Stack navigator,
 * enabling iOS swipe-back gesture when navigating between different sections.
 * 
 * Navigation flow:
 * - Tabs (dashboard, patients, etc.) ← Stack manages this
 * - HP Profile ← Can swipe back to tabs
 * - Other screens ← All get swipe-back support
 */
const MainLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#F8FAFC",
        },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="hp/hp-profile" />
      <Stack.Screen name="complete-profile" />
    </Stack>
  );
};

MainLayout.displayName = "MainLayout";

export default MainLayout;