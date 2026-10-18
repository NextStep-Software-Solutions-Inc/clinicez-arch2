import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Button, { ButtonVariant, ButtonSize } from '../ui/Button';
import UserMenu from './UserMenu';
import ClinicNotificationCenterModal from '../notifications/ClinicNotificationCenterModal';
import { useClinicNotifications } from '../../hooks/useClinicNotifications';
import { theme } from '../../constants/theme';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useSafeInsets } from '../../utils/useSafeInsets';
import { useUiDensity } from '../../context/UiDensityContext';

export interface HeaderAction {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}

export interface ClinicHeaderBarProps {
  /** Page title. This is the single source of the page heading - screens must not repeat it in the body. */
  title?: string;
  /** Subtitle for the page. */
  subtitle?: string;
  /** Structured page-level actions that adapt responsively on mobile. */
  actions?: HeaderAction[];
  /** Page-level actions (e.g. "New patient") as custom JSX. Backward-compatible. */
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export default function ClinicHeaderBar({
  title,
  subtitle,
  actions,
  rightAction,
  style,
}: ClinicHeaderBarProps) {
  const insets = useSafeInsets();
  const { isCompact } = useBreakpoint();
  const { multiplier, headerHeight } = useUiDensity();
  const [modalVisible, setModalVisible] = useState(false);

  const {
    notifications,
    unreadCount,
    hasStatAlert,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useClinicNotifications();

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const padV = Math.max(
    isCompact ? 6 : 8,
    Math.round((isCompact ? theme.spacing.sm : theme.spacing.md) * multiplier)
  );
  const padH = Math.max(
    isCompact ? 12 : 16,
    Math.round((isCompact ? theme.spacing.md : theme.spacing['2xl']) * multiplier)
  );
  const minH = isCompact ? 56 : headerHeight;

  return (
    <View
      style={[
        styles.container,
        isCompact && styles.containerCompact,
        multiplier !== 1 && {
          minHeight: minH,
          paddingHorizontal: padH,
          paddingVertical: padV,
        },
        insets.top > 0 && {
          paddingTop: padV + insets.top,
          minHeight: minH + insets.top,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.leftSection,
          isCompact && styles.leftSectionCompact,
        ]}
      >
        <View style={styles.titleBlock}>
          <ThemedText
            variant={isCompact ? 'title' : 'h2'}
            numberOfLines={1}
            style={isCompact && styles.titleTextCompact}
          >
            {title || 'Clinic EZ'}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              variant={isCompact ? 'caption' : 'small'}
              color={theme.colors.textMuted}
              numberOfLines={1}
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.rightSection,
          isCompact && styles.rightSectionCompact,
        ]}
      >
        {!isCompact && (
          <View style={styles.dateBadge}>
            <Icon name="calendar" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {currentDate}
            </ThemedText>
          </View>
        )}

        {/* Structured actions if provided */}
        {actions && actions.length > 0 ? (
          <View style={[styles.actionsContainer, isCompact && styles.actionsContainerCompact]}>
            {actions.map((act) => {
              if (isCompact) {
                const isSecondary = !act.primary;
                const useIconOnly = isSecondary && !!act.icon;
                const displayTitle = useIconOnly ? undefined : (act.shortLabel || act.label);
                return (
                  <Button
                    key={act.id}
                    title={displayTitle}
                    icon={act.icon}
                    iconOnly={useIconOnly}
                    variant={act.variant || (act.primary ? 'primary' : 'outline')}
                    size={act.size || 'sm'}
                    loading={act.loading}
                    disabled={act.disabled}
                    accessibilityLabel={act.accessibilityLabel || act.label}
                    onPress={act.onPress}
                  />
                );
              }
              return (
                <Button
                  key={act.id}
                  title={act.label}
                  icon={act.icon}
                  variant={act.variant || (act.primary ? 'primary' : 'outline')}
                  size={act.size || 'sm'}
                  loading={act.loading}
                  disabled={act.disabled}
                  accessibilityLabel={act.accessibilityLabel || act.label}
                  onPress={act.onPress}
                />
              );
            })}
          </View>
        ) : null}

        {/* Backward compatible custom rightAction */}
        {rightAction ? (
          <View style={[styles.customRightAction, isCompact && styles.customRightActionCompact]}>
            {rightAction}
          </View>
        ) : null}

        {/* Utility cluster: Bell + User avatar */}
        <View style={styles.utilityCluster}>
          <Pressable
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => [
              styles.bellButton,
              hasStatAlert && styles.bellButtonStat,
              pressed && styles.bellButtonPressed,
            ]}
            hitSlop={theme.spacing.xs}
            accessibilityRole="button"
            accessibilityLabel={`Notifications (${unreadCount} unread)`}
          >
            <Icon
              name="bell"
              size={theme.sizes.iconMd}
              color={hasStatAlert ? theme.colors.emergencyText : theme.colors.text}
            />
            {unreadCount > 0 ? (
              <View style={[styles.badgePill, hasStatAlert && styles.badgePillStat]}>
                <ThemedText
                  variant="badge"
                  color={theme.colors.onPrimary}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>

          {/* On compact viewports, the user menu avatar sits snugly in the header */}
          {isCompact ? <UserMenu compact /> : null}
        </View>

        <ClinicNotificationCenterModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          onMarkRead={markAsRead}
          onMarkAllRead={markAllAsRead}
          onRefresh={refresh}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    minHeight: theme.sizes.headerHeight,
  },
  containerCompact: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    minHeight: 56,
  },
  leftSection: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  leftSectionCompact: {
    gap: theme.spacing.xs,
  },
  titleBlock: {
    minWidth: 0,
    flex: 1,
  },
  titleTextCompact: {
    fontSize: theme.fontSizes.lg,
    lineHeight: 22,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  rightSectionCompact: {
    flexShrink: 0,
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionsContainerCompact: {
    flexShrink: 0,
    gap: theme.spacing.xs,
  },
  customRightAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customRightActionCompact: {
    flexShrink: 0,
  },
  utilityCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  bellButton: {
    position: 'relative',
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellButtonStat: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  bellButtonPressed: {
    opacity: 0.7,
  },
  badgePill: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillStat: {
    backgroundColor: theme.colors.emergency,
  },
});
