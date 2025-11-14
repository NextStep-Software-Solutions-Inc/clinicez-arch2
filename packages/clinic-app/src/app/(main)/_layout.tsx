import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";

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
      <Stack.Screen name="complete-profile" />
      <Stack.Screen name="patients/[patientId]" />
    </Stack>
  );
};

MainLayout.displayName = "MainLayout";

export default MainLayout;