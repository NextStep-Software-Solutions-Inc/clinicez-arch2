import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import UserMenu from './UserMenu';
import ClinicNotificationCenterModal from '../notifications/ClinicNotificationCenterModal';
import { useClinicNotifications } from '../../hooks/useClinicNotifications';
import { theme } from '../../constants/theme';
import { useBreakpoint } from '../../utils/useBreakpoint';

export interface ClinicHeaderBarProps {
  /** Page title. This is the single source of the page heading - screens must not repeat it in the body. */
  title?: string;
  /** Subtitle for the page. */
  subtitle?: string;
  /** Page-level actions (e.g. "New patient"). */
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export default function ClinicHeaderBar({
  title,
  subtitle,
  rightAction,
  style,
}: ClinicHeaderBarProps) {
  const { isCompact } = useBreakpoint();
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

  return (
    <View style={[styles.container, style]}>
      <View style={styles.leftSection}>
        <View style={styles.titleBlock}>
          <ThemedText variant={isCompact ? 'title' : 'h2'} numberOfLines={1}>
            {title || 'Clinic EZ'}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="small" color={theme.colors.textMuted} numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.rightSection}>
        {isCompact ? null : (
          <View style={styles.dateBadge}>
            <Icon name="calendar" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {currentDate}
            </ThemedText>
          </View>
        )}

        {rightAction ?? null}

        {/* Workstation Notification Bell Button */}
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            styles.bellButton,
            hasStatAlert && styles.bellButtonStat,
            pressed && styles.bellButtonPressed,
          ]}
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

        {/* On workstation widths the picker lives in the sidebar footer. */}
        {isCompact ? <UserMenu compact /> : null}

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
  leftSection: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  titleBlock: {
    minWidth: 0,
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
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
