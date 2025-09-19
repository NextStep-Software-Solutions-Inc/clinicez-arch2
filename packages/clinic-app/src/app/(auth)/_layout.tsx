import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { ImageBackground } from "react-native";

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  // Wait for auth to load
  if (!isLoaded) {
    return null;
  }

  // Redirect to main app if already authenticated
  if (isSignedIn) {
    return <Redirect href="/(main)" />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <ImageBackground
        source={require("../../../assets/public/image/background-3d-1.png")}
        className="flex-1"
        resizeMode="cover"
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "transparent",
            },
          }}
        >
          <Stack.Screen
            name="sign-in"
            options={{
              title: "Sign In",
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="verify"
            options={{
              title: "Verify",
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="reset-password"
            options={{
              title: "Reset Password",
              presentation: "card",
            }}
          />
        </Stack>
      </ImageBackground>
    </>
  );
}