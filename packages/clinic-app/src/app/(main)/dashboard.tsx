import React from "react";
import { View } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import ThemedView from "@components/ThemedView";
import ThemedText from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import Spacer from "@components/ui/Spacer";

const DashboardScreen = () => {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <ThemedView className="flex-1 justify-center items-center px-6 py-8">
      <View className="w-full max-w-md mx-auto text-center">
        <View className="items-center mb-8">
          <ThemedText
            variant="header"
            className="text-center mb-4 text-blue-600 dark:text-blue-400"
          >
            Welcome to Clinic EZ
          </ThemedText>
          <ThemedText
            variant="body"
            className="text-center text-gray-600 dark:text-gray-400 mb-2"
          >
            Hello, {user?.firstName || user?.emailAddresses?.[0]?.emailAddress}!
          </ThemedText>
          <ThemedText
            variant="body"
            className="text-center text-gray-600 dark:text-gray-400"
          >
            You have successfully signed in to your account.
          </ThemedText>
        </View>

        <View className="p-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <ThemedText
            variant="body"
            className="text-blue-700 dark:text-blue-300 text-center"
          >
            🎉 Authentication Setup Complete!
          </ThemedText>
          <ThemedText
            variant="caption"
            className="text-blue-600 dark:text-blue-400 text-center mt-2"
          >
            This is your main dashboard. You can now start building your app features here.
          </ThemedText>
        </View>

        <Spacer size={32} />

        <ThemedButton
          variant="outline"
          onPress={handleSignOut}
          className="w-full"
        >
          <ThemedText variant="button" className="text-primary">
            Sign Out
          </ThemedText>
        </ThemedButton>
      </View>
    </ThemedView>
  );
};

DashboardScreen.displayName = "DashboardScreen";

export default DashboardScreen;