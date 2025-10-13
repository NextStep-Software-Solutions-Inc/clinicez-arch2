import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";

export default function RootIndex() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href="/(main)/(tabs)" />;
}