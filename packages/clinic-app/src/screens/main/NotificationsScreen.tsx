import React, { useMemo } from "react";
import { SectionList, View, Pressable } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";
import { getThemeColor } from "@theme/colors";

type NotificationType = "appointment" | "lab_result" | "inventory" | "message" | "reminder";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
};

type NotificationSection = {
  title: string;
  data: Notification[];
};

// Mock notifications data with various timestamps
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    type: "lab_result",
    title: "Lab results ready",
    description: "Maria Santos has new bloodwork available for review.",
    timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    read: false,
  },
  {
    id: "notif-2",
    type: "appointment",
    title: "Appointment rescheduled",
    description: "James Lee moved his visit to Sep 20 at 10:00 AM.",
    timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
    read: false,
  },
  {
    id: "notif-3",
    type: "message",
    title: "New patient message",
    description: "Sarah Chen sent you a message regarding her prescription.",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    read: true,
  },
  {
    id: "notif-4",
    type: "reminder",
    title: "Upcoming appointment",
    description: "You have 3 appointments scheduled for tomorrow.",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
    read: true,
  },
  {
    id: "notif-5",
    type: "inventory",
    title: "Inventory alert",
    description: "Vaccination stock is below threshold. Restock soon.",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000), // Yesterday
    read: false,
  },
  {
    id: "notif-6",
    type: "lab_result",
    title: "Test results uploaded",
    description: "David Kim's X-ray results are now available.",
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    read: true,
  },
  {
    id: "notif-7",
    type: "appointment",
    title: "New appointment booked",
    description: "Emma Wilson scheduled a consultation for next week.",
    timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago
    read: true,
  },
];

/**
 * Get icon name based on notification type
 */
const getNotificationIcon = (type: NotificationType): string => {
  const iconMap: Record<NotificationType, string> = {
    appointment: "calendar-clock",
    lab_result: "flask-conical",
    inventory: "package",
    message: "message-circle",
    reminder: "bell",
  };
  return iconMap[type];
};

/**
 * Format time as relative string (e.g., "3m ago", "2h ago", "5d ago")
 */
const formatRelativeTime = (timestamp: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "Just now";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
};

/**
 * Get section title based on timestamp
 */
const getSectionTitle = (timestamp: Date): string => {
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 24) {
    return "Today";
  }

  if (diffInHours < 48) {
    return "Yesterday";
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return "This Week";
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks === 1) {
    return "Last Week";
  }

  if (diffInWeeks < 4) {
    return `${diffInWeeks} Weeks Ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths === 1) {
    return "Last Month";
  }

  if (diffInMonths < 12) {
    return `${diffInMonths} Months Ago`;
  }

  return "Earlier";
};

/**
 * Group notifications by time sections
 */
const groupNotificationsByTime = (notifications: Notification[]): NotificationSection[] => {
  const sections: Map<string, Notification[]> = new Map();

  // Sort notifications by timestamp (newest first)
  const sortedNotifications = [...notifications].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Group by section title
  sortedNotifications.forEach((notification) => {
    const sectionTitle = getSectionTitle(notification.timestamp);
    const existing = sections.get(sectionTitle) ?? [];
    sections.set(sectionTitle, [...existing, notification]);
  });

  // Convert map to array of sections
  return Array.from(sections.entries()).map(([title, data]) => ({
    title,
    data,
  }));
};

type NotificationItemProps = {
  notification: Notification;
  primaryColor: string;
  onPress: (notification: Notification) => void;
};

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  primaryColor,
  onPress,
}) => {
  const icon = getNotificationIcon(notification.type);
  const relativeTime = formatRelativeTime(notification.timestamp);

  return (
    <Pressable
      onPress={() => onPress(notification)}
      className="mb-3 rounded-2xl bg-base dark:bg-surface-dark p-4 active:opacity-80"
    >
      <View className="flex-row items-center">
        {/* Icon */}
        <View className="mr-3 rounded-full bg-primary-soft dark:bg-primary-soft-dark px-3 py-2">
          <ThemedIcon icon={icon} color={primaryColor} size={20} />
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-start justify-between mb-1">
            <ThemedText
              variant="label"
              className="font-semibold text-primary dark:text-primary-dark flex-1"
            >
              {notification.title}
            </ThemedText>
            <ThemedText variant="caption" className="text-muted dark:text-muted-dark ml-2">
              {relativeTime}
            </ThemedText>
          </View>
          <ThemedText variant="body" className="text-text-secondary dark:text-text-secondary-dark">
            {notification.description}
          </ThemedText>
          {!notification.read && (
            <View className="mt-2">
              <View className="self-end">
                <View className="h-2 w-2 rounded-full bg-primary dark:bg-primary-dark" />
              </View>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const primaryColor = getThemeColor("primary", isDark ? "dark" : "light");

  // Group notifications into sections
  const sections = useMemo(() => groupNotificationsByTime(MOCK_NOTIFICATIONS), []);

  const handleNotificationPress = (notification: Notification) => {
    console.log("Notification pressed:", notification.id);
    // TODO: Handle notification press (mark as read, navigate to detail, etc.)
  };

  return (
    <View
      style={{
        paddingTop: 16,
        paddingBottom: 0,
      }}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <ThemedView variant="transparent" className="flex-1 px-6">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              primaryColor={primaryColor}
              onPress={handleNotificationPress}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="py-3">
              <ThemedText variant="subheader" className="font-semibold text-text dark:text-text-dark">
                {title}
              </ThemedText>
              <Spacer size={8} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomSpacing }}
          stickySectionHeadersEnabled={false}
        />
      </ThemedView>
    </View>
  );
};

NotificationsScreen.displayName = "NotificationsScreen";

export default NotificationsScreen;
