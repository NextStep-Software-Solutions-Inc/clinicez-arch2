import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Badge, { BadgeVariant } from '../ui/Badge';
import Button from '../ui/Button';
import Icon, { IconName } from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { theme } from '../../constants/theme';
import {
  ClinicStaffNotification,
  NotificationUrgency,
  StaffNotificationCategory,
} from '../../services/clinicService';

export interface ClinicNotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: ClinicStaffNotification[];
  unreadCount: number;
  loading?: boolean;
  onMarkRead: (id: string) => Promise<boolean>;
  onMarkAllRead: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type FilterTab = 'all' | 'stat' | 'appointments' | 'queue' | 'system';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

function getUrgencyBadgeVariant(urgency: NotificationUrgency): BadgeVariant {
  switch (urgency) {
    case 'Stat':
      return 'emergency';
    case 'Urgent':
      return 'urgent';
    case 'Routine':
    default:
      return 'routine';
  }
}

function getCategoryIcon(category: StaffNotificationCategory): IconName {
  switch (category) {
    case 'Appointment':
      return 'calendar';
    case 'LabResult':
      return 'lab';
    case 'Queue':
      return 'ticket';
    case 'ClinicalAlert':
      return 'alert';
    case 'System':
    default:
      return 'bell';
  }
}

export default function ClinicNotificationCenterModal({
  visible,
  onClose,
  notifications,
  unreadCount,
  loading = false,
  onMarkRead,
  onMarkAllRead,
  onRefresh,
}: ClinicNotificationCenterModalProps) {
  const navigation = useNavigation<any>();
  const { isWorkstation } = useBreakpoint();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const [isMounted, setIsMounted] = useState(visible);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(() => {
        setIsMounted(false);
      });
    }
  }, [visible, opacityAnim, slideAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setIsMounted(false);
      onClose();
    });
  }, [onClose, opacityAnim, slideAnim]);

  // Close panel on web when Escape key is pressed
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleClose]);

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'stat':
        return notifications.filter((n) => n.urgency === 'Stat');
      case 'appointments':
        return notifications.filter((n) => n.category === 'Appointment');
      case 'queue':
        return notifications.filter((n) => n.category === 'Queue');
      case 'system':
        return notifications.filter((n) => n.category === 'System' || n.category === 'ClinicalAlert');
      case 'all':
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  const statCount = useMemo(
    () => notifications.filter((n) => n.urgency === 'Stat' && !n.isRead).length,
    [notifications]
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAll(false);
    }
  }, [onMarkAllRead]);

  const handleActionClick = useCallback(
    async (item: ClinicStaffNotification) => {
      if (!item.isRead) {
        await onMarkRead(item.id);
      }
      handleClose();

      if (item.actionRoute) {
        try {
          let params: any = undefined;
          if (item.actionParamsJson) {
            params = JSON.parse(item.actionParamsJson);
          }
          navigation.navigate(item.actionRoute, params);
        } catch {
          navigation.navigate(item.actionRoute);
        }
      }
    },
    [onMarkRead, handleClose, navigation]
  );

  if (!isMounted && !visible) {
    return null;
  }

  const sheetContent = (
    <View style={styles.sheetContainer}>
      {/* Top Header Row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedText variant="title" color={theme.colors.text}>
            Clinic Notifications
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            {`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
          </ThemedText>
        </View>

        <View style={styles.headerRight}>
          {onRefresh ? (
            <Pressable
              onPress={onRefresh}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh notifications"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close notifications panel"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Header Action Bar: Filter Tabs & Mark All Read */}
      <View style={styles.topBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          <Pressable
            onPress={() => setActiveTab('all')}
            style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          >
            <ThemedText
              variant="smallBold"
              color={activeTab === 'all' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              All ({notifications.length})
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('stat')}
            style={[styles.tabButton, activeTab === 'stat' && styles.tabButtonActive]}
          >
            <View style={styles.tabWithBadge}>
              <ThemedText
                variant="smallBold"
                color={activeTab === 'stat' ? theme.colors.emergencyText : theme.colors.textSecondary}
              >
                STAT / Panic
              </ThemedText>
              {statCount > 0 ? (
                <Badge label={String(statCount)} variant="emergency" size="xs" />
              ) : null}
            </View>
          </Pressable>

          <Pressable
            data-testid="tab-appointments"
            testID="tab-appointments"
            onPress={() => setActiveTab('appointments')}
            style={[styles.tabButton, activeTab === 'appointments' && styles.tabButtonActive]}
          >
            <ThemedText
              variant="smallBold"
              color={activeTab === 'appointments' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Appointments
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('queue')}
            style={[styles.tabButton, activeTab === 'queue' && styles.tabButtonActive]}
          >
            <ThemedText
              variant="smallBold"
              color={activeTab === 'queue' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Queue
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('system')}
            style={[styles.tabButton, activeTab === 'system' && styles.tabButtonActive]}
          >
            <ThemedText
              variant="smallBold"
              color={activeTab === 'system' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              System
            </ThemedText>
          </Pressable>
        </ScrollView>

        {unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAllRead}
            disabled={markingAll}
            style={({ pressed }) => [styles.markAllBtn, pressed && styles.markAllBtnPressed]}
          >
            <ThemedText variant="smallBold" color={theme.colors.primary}>
              Mark all read
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* Notification List */}
      <ScrollView style={styles.scrollList} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            title="All Caught Up!"
            description={
              activeTab === 'all'
                ? 'No notifications found for your workstation.'
                : `No ${activeTab.toUpperCase()} notifications found.`
            }
            icon={activeTab === 'appointments' ? 'calendar' : 'bell'}
            style={styles.emptyWrap}
          />
        ) : (
          filteredNotifications.map((item) => {
            const isStat = item.urgency === 'Stat';
            const urgencyVariant = getUrgencyBadgeVariant(item.urgency);
            const categoryIcon = getCategoryIcon(item.category);

            return (
              <View
                key={item.id}
                style={[
                  styles.notificationItem,
                  !item.isRead && styles.notificationItemUnread,
                  isStat && !item.isRead && styles.notificationItemStat,
                ]}
              >
                <View style={styles.itemHeader}>
                  <View style={styles.badgeRow}>
                    <Badge
                      label={item.urgency.toUpperCase()}
                      variant={urgencyVariant}
                      size="xs"
                    />
                    <View style={styles.categoryPill}>
                      <Icon name={categoryIcon} size={12} color={theme.colors.textMuted} />
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {item.category}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {formatRelativeTime(item.createdAt)}
                  </ThemedText>
                </View>

                <View style={styles.itemBody}>
                  <ThemedText
                    variant={item.isRead ? 'body' : 'bodyBold'}
                    color={isStat ? theme.colors.emergencyText : theme.colors.text}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.itemBodyText}>
                    {item.body}
                  </ThemedText>
                </View>

                <View style={styles.itemFooter}>
                  {item.actionRoute ? (
                    <Button
                      title={
                        isStat
                          ? 'Review STAT Result'
                          : item.category === 'Appointment'
                          ? 'View Appointment'
                          : 'View Details'
                      }
                      variant={isStat ? 'danger' : 'outline'}
                      size="sm"
                      onPress={() => handleActionClick(item)}
                    />
                  ) : null}

                  {!item.isRead ? (
                    <Pressable
                      onPress={() => onMarkRead(item.id)}
                      style={({ pressed }) => [styles.markReadBtn, pressed && styles.markReadBtnPressed]}
                      accessibilityLabel="Mark as read"
                    >
                      <Icon name="check" size={14} color={theme.colors.textMuted} />
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Mark read
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <View style={styles.readIndicator}>
                      <Icon name="check" size={14} color={theme.colors.success} />
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Read
                      </ThemedText>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  return (
    <Modal
      raw
      visible={isMounted || visible}
      onClose={handleClose}
      animationType="none"
      transparent
      zIndex={10000}
    >
      <View style={isWorkstation ? styles.desktopOverlay : styles.mobileModalContainer}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: opacityAnim,
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close notifications panel"
          />
        </Animated.View>
        <Animated.View
          style={[
            isWorkstation ? styles.dockedPanel : styles.mobilePanel,
            {
              transform: isWorkstation
                ? [
                    {
                      translateX: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 480],
                      }),
                    },
                  ]
                : [
                    {
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 600],
                      }),
                    },
                  ],
            },
          ]}
        >
          {sheetContent}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  desktopOverlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    zIndex: 10000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
  },
  dockedPanel: {
    width: 460,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10001,
  },
  mobileModalContainer: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    zIndex: 10000,
  },
  mobilePanel: {
    height: '85%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    overflow: 'hidden',
    zIndex: 10001,
  },
  sheetContainer: {
    flex: 1,
    height: '100%',
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerLeft: {
    gap: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  tabScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  tabButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  markAllBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  markAllBtnPressed: {
    opacity: 0.7,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  emptyWrap: {
    marginVertical: theme.spacing.xl,
    paddingVertical: theme.spacing['2xl'],
    borderWidth: 0,
  },
  notificationItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  notificationItemUnread: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.primaryBorder,
  },
  notificationItemStat: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  itemBody: {
    gap: 2,
  },
  itemBodyText: {
    lineHeight: 18,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  markReadBtnPressed: {
    opacity: 0.6,
  },
  readIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
