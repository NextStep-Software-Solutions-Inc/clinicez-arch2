import React from "react";
import { FlatList, View } from "react-native";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";

const NOTIFICATIONS = [
  {
    id: "notif-1",
    title: "Lab results ready",
    description: "Maria Santos has new bloodwork available for review.",
    icon: "beaker",
    badgeClass: "bg-emerald-100 dark:bg-emerald-900/30",
    textClass: "text-emerald-600 dark:text-emerald-300",
    iconColor: "#059669",
  },
  {
    id: "notif-2",
    title: "Appointment rescheduled",
    description: "James Lee moved his visit to Sep 20 at 10:00 AM.",
    icon: "calendar-check",
    badgeClass: "bg-amber-100 dark:bg-amber-900/30",
    textClass: "text-amber-600 dark:text-amber-300",
    iconColor: "#D97706",
  },
  {
    id: "notif-3",
    title: "Inventory alert",
    description: "Vaccination stock is below threshold. Restock soon.",
    icon: "package",
    badgeClass: "bg-rose-100 dark:bg-rose-900/30",
    textClass: "text-rose-600 dark:text-rose-300",
    iconColor: "#E11D48",
  },
];


const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);

  return (
    <View
      style={{
        paddingTop: 16,
        paddingBottom: 0,
      }}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <ThemedView variant="transparent" className="flex-1 px-6">
        <FlatList
          data={NOTIFICATIONS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="mb-4 rounded-2xl border border-border dark:border-border-dark bg-background/90 dark:bg-background-dark/70 p-4">
              <View className="flex-row items-center">
                <View className={`mr-3 rounded-full px-3 py-2 ${item.badgeClass}`}>
                  <ThemedIcon icon={item.icon} color={item.iconColor} size={18} />
                </View>
                <View className="flex-1">
                  <ThemedText variant="label" className={`font-semibold ${item.textClass}`}>
                    {item.title}
                  </ThemedText>
                  <Spacer size={4} />
                  <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                    {item.description}
                  </ThemedText>
                </View>
                <ThemedIcon icon="chevron-right" color="muted" size="default" />
              </View>
            </View>
          )}
          ListFooterComponent={null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomSpacing }}
        />
      </ThemedView>
    </View>
  );
};

NotificationsScreen.displayName = "NotificationsScreen";

export default NotificationsScreen;
