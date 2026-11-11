import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Button, { ButtonVariant, ButtonSize } from '../ui/Button';
import UserMenu from './UserMenu';
import ClinicNotificationCenterModal from '../notifications/ClinicNotificationCenterModal';
import { useClinicNotifications } from '../../hooks/useClinicNotifications';
import { theme, subscribeActiveTheme } from '../../constants/theme';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useSafeInsets } from '../../utils/useSafeInsets';
import { useUiDensity } from '../../context/UiDensityContext';
import { CommsContext, useConversations, useTriageQueue, useCommsContext } from '@clinicez/comms-sdk/react';
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';

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
  onOpenSearch?: () => void;
}

function CommsChatButtonContent() {
  const { toggleChatDrawer } = useClinicComms();
  const { unreadCount } = useConversations();
  const { user, can } = useAuth();
  const { facilityId } = useCommsContext();
  const [isHovered, setIsHovered] = useState(false);
  const [, setThemeTick] = useState(0);

  useEffect(() => {
    return subscribeActiveTheme(() => {
      setThemeTick((v) => v + 1);
    });
  }, []);

  const canViewTriage = can(PERMISSIONS.triageRead) || can('messaging:triage') || user?.role === 'Admin';
  const { pendingCount, urgentCount } = useTriageQueue(facilityId);

  const triageCount = canViewTriage ? pendingCount : 0;
  const hasUrgent = canViewTriage && urgentCount > 0;

  const a11yLabel = useMemo(() => {
    const parts = ['Communications'];
    if (unreadCount > 0) parts.push(`${unreadCount} unread`);
    if (triageCount > 0) parts.push(`${triageCount} pending triage${hasUrgent ? ' (urgent)' : ''}`);
    return parts.join(', ');
  }, [unreadCount, triageCount, hasUrgent]);

  return (
    <Pressable
      onPress={toggleChatDrawer}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      style={({ hovered, pressed }: any) => [
        styles.chatButton,
        {
          backgroundColor: theme.colors.primarySubtle,
          borderColor: theme.colors.primaryBorder,
        },
        theme.shadows.brandSubtle,
        (hovered || isHovered) &&
          !pressed && [
            styles.chatButtonHovered,
            {
              backgroundColor: theme.colors.primaryLight,
              borderColor: theme.colors.primary,
            },
            theme.shadows.brandSm,
          ],
        pressed && [
          styles.chatButtonPressed,
          {
            backgroundColor: theme.colors.primaryLight,
            borderColor: theme.colors.primaryDark,
          },
          theme.shadows.none,
        ],
      ]}
      hitSlop={theme.spacing.xs}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Icon
        name="message"
        size={theme.sizes.iconMd}
        color={isHovered ? theme.colors.primaryHover : theme.colors.primary}
      />
      {triageCount > 0 ? (
        <View
          style={[
            styles.triagePip,
            hasUrgent ? styles.triagePipUrgent : styles.triagePipRoutine,
          ]}
        />
      ) : null}
      {unreadCount > 0 ? (
        <View style={[styles.badgePill, { backgroundColor: theme.colors.primary }]}>
          <ThemedText variant="badge" color={theme.colors.onPrimary}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function CommsChatButton() {
  const commsCtx = React.useContext(CommsContext);
  if (!commsCtx) return null;
  return <CommsChatButtonContent />;
}

export default function ClinicHeaderBar({
  title,
  subtitle,
  actions,
  rightAction,
  style,
  onOpenSearch,
}: ClinicHeaderBarProps) {
  const insets = useSafeInsets();
  const { isCompact, width } = useBreakpoint();
  const { multiplier, headerHeight } = useUiDensity();
  const [modalVisible, setModalVisible] = useState(false);
  const [isBellHovered, setIsBellHovered] = useState(false);
  const [, setThemeTick] = useState(0);

  useEffect(() => {
    return subscribeActiveTheme(() => {
      setThemeTick((v) => v + 1);
    });
  }, []);

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

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform || (navigator as any).userAgentData?.platform || '');

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
            color={theme.colors.primary}
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
        {!isCompact && onOpenSearch && (
          <Pressable
            onPress={() => onOpenSearch()}
            style={({ pressed, hovered }: any) => [
              styles.searchTriggerPill,
              {
                backgroundColor: theme.colors.primarySubtle,
                borderColor: theme.colors.primaryBorder,
              },
              theme.shadows.brandSubtle,
              hovered &&
                !pressed && [
                  styles.searchTriggerPillHovered,
                  {
                    backgroundColor: theme.colors.primaryLight,
                    borderColor: theme.colors.primary,
                  },
                  theme.shadows.brandSm,
                ],
              pressed && [
                styles.searchTriggerPillPressed,
                {
                  backgroundColor: theme.colors.primaryLight,
                  borderColor: theme.colors.primaryDark,
                },
                theme.shadows.none,
              ],
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search clinic records and settings (Cmd+K)"
          >
            <View style={styles.searchTriggerContent}>
              <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText
                variant="small"
                color={theme.colors.primaryDark}
                numberOfLines={1}
                style={styles.searchPlaceholderText}
              >
                Search records...
              </ThemedText>
            </View>
            <View
              style={[
                styles.shortcutBadge,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.primaryBorder,
                },
              ]}
            >
              <ThemedText variant="code" color={theme.colors.primary} style={styles.shortcutText}>
                {isMac ? '⌘K' : 'Ctrl+K'}
              </ThemedText>
            </View>
          </Pressable>
        )}

        {!isCompact && width >= 1150 && (
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

        {/* Utility cluster: Search (mobile) + Bell + User avatar */}
        <View style={styles.utilityCluster}>
          {isCompact && onOpenSearch ? (
            <Button
              variant="secondary"
              size="sm"
              icon="search"
              iconOnly
              accessibilityLabel="Search clinic records"
              tooltip="Search clinic records"
              onPress={() => onOpenSearch()}
            />
          ) : null}

          <CommsChatButton />

          <Pressable
            onPress={() => setModalVisible(true)}
            onHoverIn={() => setIsBellHovered(true)}
            onHoverOut={() => setIsBellHovered(false)}
            style={({ hovered, pressed }: any) => [
              styles.bellButton,
              hasStatAlert
                ? [
                    styles.bellButtonStat,
                    {
                      backgroundColor: theme.colors.emergencyBg,
                      borderColor: theme.colors.emergencyBorder,
                    },
                    theme.shadows.dangerSm,
                    (hovered || isBellHovered) && !pressed && theme.shadows.dangerMd,
                    pressed && theme.shadows.none,
                  ]
                : [
                    {
                      backgroundColor: theme.colors.primarySubtle,
                      borderColor: theme.colors.primaryBorder,
                    },
                    theme.shadows.brandSubtle,
                    (hovered || isBellHovered) &&
                      !pressed && [
                        styles.bellButtonHovered,
                        {
                          backgroundColor: theme.colors.primaryLight,
                          borderColor: theme.colors.primary,
                        },
                        theme.shadows.brandSm,
                      ],
                    pressed && [
                      styles.bellButtonPressed,
                      {
                        backgroundColor: theme.colors.primaryLight,
                        borderColor: theme.colors.primaryDark,
                      },
                      theme.shadows.none,
                    ],
                  ],
            ]}
            hitSlop={theme.spacing.xs}
            accessibilityRole="button"
            accessibilityLabel={`Notifications (${unreadCount} unread)`}
          >
            <Icon
              name="bell"
              size={theme.sizes.iconMd}
              color={
                hasStatAlert
                  ? theme.colors.emergencyText
                  : isBellHovered
                  ? theme.colors.primaryHover
                  : theme.colors.primary
              }
            />
            {unreadCount > 0 ? (
              <View
                style={[
                  styles.badgePill,
                  { backgroundColor: theme.colors.primary },
                  hasStatAlert && [styles.badgePillStat, { backgroundColor: theme.colors.emergency }],
                ]}
              >
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
  chatButton: {
    position: 'relative',
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.brandSubtle,
  },
  chatButtonHovered: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    ...theme.shadows.brandSm,
  },
  chatButtonPressed: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryDark,
  },
  bellButton: {
    position: 'relative',
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.brandSubtle,
  },
  bellButtonHovered: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    ...theme.shadows.brandSm,
  },
  bellButtonStat: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    ...theme.shadows.dangerSm,
  },
  bellButtonPressed: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryDark,
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
  triagePip: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  },
  triagePipUrgent: {
    backgroundColor: theme.colors.emergency,
  },
  triagePipRoutine: {
    backgroundColor: theme.colors.urgent,
  },
  searchTriggerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    width: 240,
    minWidth: 160,
    maxWidth: 280,
    flexShrink: 1,
    minHeight: 34,
    gap: theme.spacing.sm,
    ...theme.shadows.brandSubtle,
  },
  searchTriggerPillHovered: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSm,
  },
  searchTriggerPillPressed: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryDark,
  },
  searchTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  searchPlaceholderText: {
    flex: 1,
  },
  shortcutBadge: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
  },
  shortcutText: {
    lineHeight: 14,
  },
});
