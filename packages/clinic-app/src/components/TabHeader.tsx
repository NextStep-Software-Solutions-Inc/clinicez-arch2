/**
 * The TabHeader component displays the ClinicEZ logo and the authenticated user's avatar.
 * It is intended for use across the main tab screens.
 */

import React from "react";
import { View } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedText from "@components/ThemedText";
import UserAvatar from "@components/UserAvatar";

type TabHeaderProps = {
  onAvatarPress: () => void;
  title: string;
};

const TabHeader: React.FC<TabHeaderProps> = ({ onAvatarPress, title }) => {
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const displayName = user?.fullName ?? user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Clinician";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? undefined;
  const avatarUrl = user?.imageUrl ?? null;

  return (
    <View
      style={{ paddingTop: Math.max(insets.top, 16) }}
      className="px-6 pb-3 flex-row items-center justify-between"
    >
      <ThemedText variant="header" className="text-primary dark:text-primary-dark">
        {title}
      </ThemedText>
      <UserAvatar
        size={40}
        imageUrl={avatarUrl}
        name={displayName}
        email={email}
        onPress={onAvatarPress}
        className="border border-primary/60 dark:border-primary-dark/60"
      />
    </View>
  );
};

TabHeader.displayName = "TabHeader";

export default TabHeader;
