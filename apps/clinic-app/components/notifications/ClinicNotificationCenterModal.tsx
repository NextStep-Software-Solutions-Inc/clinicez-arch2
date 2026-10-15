import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Badge, { BadgeVariant } from '../ui/Badge';
import Button from '../ui/Button';
import Icon, { IconName } from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
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

type FilterTab = 'all' | 'stat' | 'queue' | 'system';

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
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'stat':
        return notifications.filter((n) => n.urgency === 'Stat');
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
      onClose();

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
    [onMarkRead, onClose, navigation]
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Clinic Notifications"
      subtitle={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
      maxWidth={600}
    >
      <View style={styles.container}>
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
              icon="bell"
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
                        title={isStat ? 'Review STAT Result' : 'View Details'}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
    minHeight: 340,
    maxHeight: 520,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
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
    paddingVertical: theme.spacing.xs,
  },
  emptyWrap: {
    paddingVertical: theme.spacing['2xl'],
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
