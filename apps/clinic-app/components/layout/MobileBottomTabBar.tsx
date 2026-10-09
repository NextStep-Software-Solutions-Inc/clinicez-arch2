import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  PressableStateCallbackType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { WORKSTATION_NAV_ITEMS, NavItem } from './WorkstationSidebar';
import { applyFontFamily } from '../../constants/fonts';

const MOBILE_LABELS: Record<string, string> = {
  Dashboard: 'Dashboard',
  Patients: 'Patients',
  Consultations: 'Consults',
  Appointments: 'Appts',
  Billing: 'Billing',
  ResultReview: 'Results',
  ShareImport: 'Scan QR',
  Yakap: 'PhilHealth',
  Settings: 'Settings',
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  Dashboard: 'Live queue, triage & clinical analytics',
  Patients: 'Patient directory & new registration',
  Consultations: 'Doctor consultation workflows & records',
  Appointments: 'Appointment bookings & calendar schedule',
  Billing: 'Invoices, cashier payments & receipts',
  ResultReview: 'Verify external and patient-uploaded lab results',
  ShareImport: 'Import a patient record from their share QR',
  Yakap: 'PhilHealth Yakap formulary & claims',
  Settings: 'Clinic profile, staff permissions & audit',
};

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export default function MobileBottomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { user, can } = useAuth();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);

  // Active route
  const currentRoute = state.routes[state.index];
  const currentRouteName = currentRoute?.name;

  // Filter allowed navigation items using user role and permissions
  const allowedNavItems = useMemo(() => {
    return WORKSTATION_NAV_ITEMS.filter((item) => {
      if (!user) return true;
      if (user.role === 'Admin') return true;
      if (item.permission && can(item.permission)) return true;
      if (item.roles && item.roles.includes(user.role)) return true;
      return !item.permission && !item.roles;
    });
  }, [user, can]);

  const allowedKeys = useMemo(
    () => new Set(allowedNavItems.map((item) => item.key)),
    [allowedNavItems]
  );

  const navItemLookup = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const item of WORKSTATION_NAV_ITEMS) {
      map.set(item.key, item);
    }
    return map;
  }, []);

  // Filter React Navigation routes based on permissions, keeping defined order
  const allowedRoutes = useMemo(() => {
    return state.routes.filter((route) => allowedKeys.has(route.name));
  }, [state.routes, allowedKeys]);

  // Distribute into primary (<= 4) and overflow routes
  const { primaryRoutes, overflowRoutes } = useMemo(() => {
    if (allowedRoutes.length <= 4) {
      return {
        primaryRoutes: allowedRoutes,
        overflowRoutes: [] as typeof allowedRoutes,
      };
    }

    return {
      primaryRoutes: allowedRoutes.slice(0, 4),
      overflowRoutes: allowedRoutes.slice(4),
    };
  }, [allowedRoutes]);

  const isOverflowActive = useMemo(() => {
    return overflowRoutes.some((route) => route.name === currentRouteName);
  }, [overflowRoutes, currentRouteName]);

  const handleNavigate = (route: typeof state.routes[0], isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const getRouteIcon = (routeName: string): IconName => {
    const item = navItemLookup.get(routeName);
    return item?.icon ?? 'dashboard';
  };

  const getRouteLabel = (routeName: string, descriptorLabel?: string): string => {
    return MOBILE_LABELS[routeName] ?? descriptorLabel ?? routeName;
  };

  const safeBottom = Math.max(insets.bottom, theme.spacing.sm);

  return (
    <>
      <View
        style={[
          styles.barContainer,
          {
            paddingBottom: safeBottom,
          },
        ]}
      >
        {primaryRoutes.map((route) => {
          const isFocused = currentRouteName === route.name;
          const { options } = descriptors[route.key] || {};
          const label = getRouteLabel(route.name, options?.title);
          const iconName = getRouteIcon(route.name);

          return (
            <Pressable
              key={route.key}
              onPress={() => handleNavigate(route, isFocused)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              style={(state: InteractionState) => [
                styles.tabItem,
                state.pressed && styles.tabItemPressed,
                state.hovered && !isFocused && styles.tabItemHovered,
              ]}
            >
              <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
                <Icon
                  name={iconName}
                  size={theme.sizes.iconMd}
                  color={isFocused ? theme.colors.primary : theme.colors.textMuted}
                />
              </View>
              <ThemedText
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? theme.colors.primary : theme.colors.textMuted,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </ThemedText>
            </Pressable>
          );
        })}

        {overflowRoutes.length > 0 ? (
          <Pressable
            onPress={() => setMoreOpen(true)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isOverflowActive }}
            accessibilityLabel="More navigation options"
            style={(state: InteractionState) => [
              styles.tabItem,
              state.pressed && styles.tabItemPressed,
              state.hovered && !isOverflowActive && styles.tabItemHovered,
            ]}
          >
            <View style={[styles.iconWrapper, isOverflowActive && styles.iconWrapperActive]}>
              <Icon
                name="more"
                size={theme.sizes.iconMd}
                color={isOverflowActive ? theme.colors.primary : theme.colors.textMuted}
              />
            </View>
            <ThemedText
              style={[
                styles.tabLabel,
                {
                  color: isOverflowActive ? theme.colors.primary : theme.colors.textMuted,
                },
              ]}
              numberOfLines={1}
            >
              More
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* Overflow Bottom Sheet Modal */}
      {overflowRoutes.length > 0 ? (
        <Modal
          visible={moreOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setMoreOpen(false)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setMoreOpen(false)}
              accessibilityLabel="Close additional modules menu"
              accessibilityRole="button"
            />

            <View
              style={[
                styles.sheetContainer,
                {
                  paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
                },
              ]}
            >
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Sheet Header */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderText}>
                  <ThemedText variant="title" style={styles.sheetTitle}>
                    More modules
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    Quick access to clinic management tools
                  </ThemedText>
                </View>

                <Pressable
                  onPress={() => setMoreOpen(false)}
                  hitSlop={theme.spacing.sm}
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Close sheet"
                >
                  <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              {/* Sheet Navigation Items */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetList}
              >
                {overflowRoutes.map((route) => {
                  const isCurrent = currentRouteName === route.name;
                  const item = navItemLookup.get(route.name);
                  const iconName = getRouteIcon(route.name);
                  const label = item?.label ?? route.name;
                  const description =
                    MODULE_DESCRIPTIONS[route.name] ?? 'Additional clinic module';

                  return (
                    <Pressable
                      key={route.key}
                      onPress={() => {
                        setMoreOpen(false);
                        handleNavigate(route, isCurrent);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isCurrent }}
                      style={(state: InteractionState) => [
                        styles.sheetItem,
                        isCurrent && styles.sheetItemActive,
                        state.hovered && !isCurrent && styles.sheetItemHovered,
                        state.pressed && styles.sheetItemPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.sheetItemIcon,
                          isCurrent && styles.sheetItemIconActive,
                        ]}
                      >
                        <Icon
                          name={iconName}
                          size={theme.sizes.iconMd}
                          color={isCurrent ? theme.colors.primary : theme.colors.textSecondary}
                        />
                      </View>

                      <View style={styles.sheetItemText}>
                        <ThemedText
                          variant={isCurrent ? 'bodyBold' : 'body'}
                          color={isCurrent ? theme.colors.primary : theme.colors.text}
                        >
                          {label}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                          {description}
                        </ThemedText>
                      </View>

                      {isCurrent ? (
                        <Badge label="Active" variant="primary" size="sm" />
                      ) : (
                        <Icon
                          name="chevronRight"
                          size={theme.sizes.iconSm}
                          color={theme.colors.textMuted}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.xs,
    minHeight: theme.sizes.headerHeight,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    minHeight: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabItemHovered: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
  },
  iconWrapper: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabLabel: applyFontFamily({
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  }),

  // Bottom Sheet Modal Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    maxHeight: '80%',
  },
  dragHandle: {
    width: theme.sizes.controlSm,
    height: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.borderDark,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    color: theme.colors.text,
  },
  closeBtn: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.full,
  },
  closeBtnPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  sheetList: {
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  sheetItemActive: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primaryBorder,
  },
  sheetItemHovered: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  sheetItemPressed: {
    opacity: 0.8,
  },
  sheetItemIcon: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemIconActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  sheetItemText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
});
