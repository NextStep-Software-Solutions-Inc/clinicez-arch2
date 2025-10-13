import React, { useEffect, useRef, useState } from "react";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Animated, LayoutChangeEvent, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useAuth, useUser } from "@clerk/clerk-expo";

import SlidingSidebar from "@components/SlidingSidebar";
import TabHeader from "@components/TabHeader";
import ThemedBadge from "@components/ThemedBadge";
import ThemedIcon from "@components/ThemedIcon";
import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import UserAvatar from "@components/UserAvatar";
import { getThemeColor } from "@theme/colors";

type TabConfig = {
  name: string;
  title: string;
  icon: string;
};

const TAB_CONFIG: TabConfig[] = [
  {
    title: "Dashboard",
    name: "dashboard",
    icon: "layout-dashboard",
  },
  {
    title: "Patients",
    name: "patients",
    icon: "users",
  },
  {
    title: "Appointments",
    name: "appointments",
    icon: "calendar-clock",
  },
  {
    title: "Calendar",
    name: "calendar",
    icon: "calendar-days",
  },
  {
    title: "Notifications",
    name: "notifications",
    icon: "bell",
  },
];

const NOTIFICATION_BADGE_COUNT = 8;
const TAB_ICON_SIZE = 24;

const TAB_CONFIG_MAP: Record<string, TabConfig> = TAB_CONFIG.reduce(
  (acc, tab) => {
    acc[tab.name] = tab;
    return acc;
  },
  {} as Record<string, TabConfig>
);

type CustomTabBarProps = BottomTabBarProps & {
  activeTint: string;
  inactiveTint: string;
  backgroundColor: string;
  borderTopColor: string;
  tabConfig: Record<string, TabConfig>;
  bottomInset: number;
};

const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  activeTint,
  inactiveTint,
  backgroundColor,
  borderTopColor,
  tabConfig,
  bottomInset,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  const visibleRoutes = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options ?? {};
    const href = (options as Record<string, unknown>).href as string | null | undefined;
    if (href === null) {
      return false;
    }

    const tabBarButton = (options as Record<string, unknown>).tabBarButton as
      | ((props: { onPress?: () => void }) => React.ReactNode)
      | undefined;
    if (typeof tabBarButton === "function") {
      return false;
    }

    return true;
  });

  const tabCount = visibleRoutes.length || 1;
  const tabWidth = trackWidth > 0 ? trackWidth / tabCount : 0;
  const indicatorWidth = tabWidth > 0 ? Math.min(52, tabWidth * 0.6) : 0;

  const focusedRouteKey = state.routes[state.index]?.key;
  const focusedVisibleIndex = visibleRoutes.findIndex((route) => route.key === focusedRouteKey);

  useEffect(() => {
    if (!tabWidth || indicatorWidth === 0 || focusedVisibleIndex < 0) {
      return;
    }

    Animated.spring(translateX, {
      toValue: focusedVisibleIndex * tabWidth + (tabWidth - indicatorWidth) / 2,
      useNativeDriver: true,
      speed: 64,
      bounciness: 0,
    }).start();
  }, [focusedVisibleIndex, indicatorWidth, tabWidth, translateX]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={{
        borderTopWidth: 1,
        backgroundColor,
        borderTopColor,
        paddingBottom: bottomInset > 0 ? bottomInset + 8 : 16,
      }}
    >
      <View className="relative mx-5" onLayout={handleTrackLayout}>
        {indicatorWidth > 0 && (
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 3,
              borderRadius: 9999,
              width: indicatorWidth,
              backgroundColor: activeTint,
              transform: [{ translateX }],
            }}
          />
        )}
        <View className="flex-row items-center pt-3">
          {visibleRoutes.map((route) => {
            const options = descriptors[route.key]?.options ?? {};
            const isFocused = route.key === focusedRouteKey;
            const config = tabConfig[route.name] ?? {
              name: route.name,
              title: options.title ?? route.name,
              icon: "circle",
            };
            const color = isFocused ? activeTint : inactiveTint;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={onPress}
                onLongPress={onLongPress}
                className="flex-1"
                activeOpacity={0.85}
              >
                <View className="items-center justify-center">
                  <View className="relative pb-2">
                    <ThemedIcon icon={config.icon} color={color} size={TAB_ICON_SIZE} />
                    {route.name === "notifications" && NOTIFICATION_BADGE_COUNT > 0 ? (
                      <ThemedBadge
                        variant="destructive"
                        size="xs"
                        className="absolute -right-2 -top-1"
                        textClassName="leading-none"
                        pointerEvents="none"
                      >
                        {NOTIFICATION_BADGE_COUNT}
                      </ThemedBadge>
                    ) : null}
                  </View>
                  <Text
                    className="text-[9px] font-medium capitalize"
                    style={{ color, letterSpacing: 0.2 }}
                    numberOfLines={1}
                  >
                    {config.title}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const TabLayout: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const sidebarWidth = 304;

  const activeTint = getThemeColor("primary", isDark ? "dark" : "light");
  const inactiveTint = getThemeColor("mutedDark", isDark ? "dark" : "light");
  const backgroundColor = getThemeColor("background", isDark ? "dark" : "light");
  const borderTopColor = getThemeColor("border", isDark ? "dark" : "light");

  const pathSegments = pathname.split("/").filter(Boolean);
  const activeSegment = pathSegments[pathSegments.length - 1] ?? TAB_CONFIG[0]?.name;
  const fallbackTab = TAB_CONFIG[0];
  const headerTitle = (activeSegment && TAB_CONFIG_MAP[activeSegment]?.title) ?? fallbackTab?.title ?? "Overview";

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("Failed to sign out", error);
    } finally {
      setSidebarOpen(false);
    }
  };

  const sidebarContent = (
    <View className="flex-1 px-6">
      <View className="gap-4 pt-2">
        <UserAvatar
          size={56}
          imageUrl={user?.imageUrl ?? null}
          name={user?.fullName ?? user?.firstName ?? null}
          email={user?.emailAddresses?.[0]?.emailAddress ?? undefined}
          className="self-start"
          accessibilityLabel="Current user"
        />
        <View>
          <ThemedText variant="subheader" className="text-text dark:text-text-dark">
            {user?.fullName ?? user?.firstName ?? "Clinician"}
          </ThemedText>
          {user?.emailAddresses?.[0]?.emailAddress ? (
            <ThemedText variant="caption" color="muted">
              {user.emailAddresses[0].emailAddress}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View className="mt-auto pt-6">
        <ThemedButton variant="destructive" onPress={handleLogout} className="w-full">
          Logout
        </ThemedButton>
      </View>
    </View>
  );

  return (
    <SlidingSidebar
      isOpen={isSidebarOpen}
      onClose={() => setSidebarOpen(false)}
      onOpen={() => setSidebarOpen(true)}
      sidebar={sidebarContent}
      width={sidebarWidth}
      position="right"
      contentContainerProps={{
        style: { backgroundColor },
      }}
    >
      <View className="flex-1">
        <TabHeader title={headerTitle} onAvatarPress={() => setSidebarOpen(true)} />
        <View className="flex-1">
          <Tabs
            initialRouteName="dashboard"
            screenOptions={{
              headerShown: false,
              animation: "shift",
            }}
            tabBar={(props) => (
              <CustomTabBar
                {...props}
                activeTint={activeTint}
                inactiveTint={inactiveTint}
                backgroundColor={backgroundColor}
                borderTopColor={borderTopColor}
                tabConfig={TAB_CONFIG_MAP}
                bottomInset={insets.bottom}
              />
            )}
          >
            <Tabs.Screen name="index" options={{ href: null }} />
            {TAB_CONFIG.map((tab) => (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: tab.title,
                }}
              />
            ))}
          </Tabs>
        </View>
      </View>
    </SlidingSidebar>
  );
};

TabLayout.displayName = "TabLayout";

export default TabLayout;
