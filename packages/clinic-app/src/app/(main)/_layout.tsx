
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Slot } from "expo-router";

const MainLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Slot />;
};

MainLayout.displayName = "MainLayout";

export default MainLayout;