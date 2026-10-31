import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from './Icon';
import type { IconName } from './iconNames';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const TAB_ICONS: Record<string, IconName> = {
  HomeScreen: 'home',
  AppointmentsScreen: 'appointments',
  MessagesScreen: 'chat',
  RecordsScreen: 'files',
  FilesScreen: 'files',
  ProfileScreen: 'profile',
};

/**
 * Compact (phone-width) bottom tab bar for the web build.
 * At >= 768px navigation moves to the persistent sidebar (see components/layout/WebSidebar.web),
 * so this renders nothing.
 */
export default function WebNavBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing, sizes } = useAppTheme();
  const { isWorkstation } = useBreakpoint();

  if (isWorkstation) return null;

  const currentRoute = state.routes[state.index];
  const currentOptions = descriptors[currentRoute?.key]?.options;
  const tabBarStyle = currentOptions?.tabBarStyle as { display?: string } | undefined;
  if (tabBarStyle?.display === 'none') {
    return null;
  }

  // Failsafe: hide tab bar when viewing file in nested stack
  const subState = currentRoute?.state as { routes?: { name: string }[]; index?: number } | undefined;
  const activeIndex = subState?.index ?? (subState?.routes ? subState.routes.length - 1 : 0);
  const activeSubRoute = subState?.routes?.[activeIndex];
  if (activeSubRoute?.name === 'FileViewerScreen') {
    return null;
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.tabBar, borderTopColor: colors.border }]}
    >
      <View style={[styles.inner, { height: sizes.headerHeight, paddingHorizontal: spacing.sm }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: isFocused }}
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
            >
              <AppIcon
                name={TAB_ICONS[route.name] ?? 'home'}
                size={sizes.iconLg - 2}
                color={isFocused ? 'primary' : 'textMuted'}
              />
              <ThemedText
                variant={isFocused ? 'captionBold' : 'caption'}
                color={isFocused ? 'primary' : 'textMuted'}
                numberOfLines={1}
                style={{ marginTop: spacing.xxs }}
              >
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%', borderTopWidth: 1 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
