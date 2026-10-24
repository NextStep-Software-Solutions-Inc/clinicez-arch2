import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { formatDistanceToNowStrict, isToday, isYesterday, format } from 'date-fns';
import ThemedText from '../../components/ui/ThemedText';
import Button from '../../components/ui/Button';
import { AppIcon, type IconName } from '../../components/ui/Icon';
import EmptyState from '../../components/ui/EmptyState';
import { FilterChipBar, type FilterChipItem } from '../../components/ui/FilterChipBar';
import Screen from '../../components/layout/Screen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePatientId } from '../../hooks/usePatientId';
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  deleteNotification,
  type NotificationFilter,
} from '../../services/notifications/notificationService';
import { dialog } from '../../utils/dialog';

type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

interface CategoryStyle {
  icon: IconName;
  color: 'primary' | 'warning' | 'success' | 'purple' | 'textSecondary';
  bg: 'primaryLight' | 'warningBg' | 'successBg' | 'purpleBg' | 'surfaceSubtle';
  border: 'primaryBorder' | 'warningBorder' | 'successBorder' | 'purpleBorder' | 'border';
}

const CATEGORY_MAP: Record<string, CategoryStyle> = {
  appointments: { icon: 'calendar', color: 'primary', bg: 'primaryLight', border: 'primaryBorder' },
  reminders: { icon: 'clock', color: 'warning', bg: 'warningBg', border: 'warningBorder' },
  clinic: { icon: 'hospital', color: 'success', bg: 'successBg', border: 'successBorder' },
  messages: { icon: 'chat', color: 'purple', bg: 'purpleBg', border: 'purpleBorder' },
  system: { icon: 'info', color: 'textSecondary', bg: 'surfaceSubtle', border: 'border' },
};

const FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'clinic', label: 'Clinic' },
  { key: 'messages', label: 'Messages' },
  { key: 'system', label: 'System' },
];

function getGroupTitle(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function relativeTime(date: Date): string {
  try {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return '';
  }
}

export default function NotificationScreenWeb() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { isCompact } = useBreakpoint();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { unreadCount, refreshNotifications } = useNotificationContext();

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const rows = await getNotifications(patientId, { filter: activeFilter });
        setItems(rows);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [patientId, activeFilter]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead(patientId);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    refreshNotifications();
  }, [patientId, refreshNotifications]);

  const handleItemPress = useCallback(
    async (item: NotificationRow) => {
      if (!item.isRead) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        await markAsRead(item.id);
        refreshNotifications();
      }
      navigation.navigate('Main', {
        screen: 'NotificationDetailScreen',
        params: { notification: item },
      });
    },
    [navigation, refreshNotifications]
  );

  const handleMarkReadSingle = useCallback(
    async (id: string, e?: any) => {
      e?.stopPropagation?.();
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      await markAsRead(id);
      refreshNotifications();
    },
    [refreshNotifications]
  );

  const handleDelete = useCallback(
    async (id: string, e?: any) => {
      e?.stopPropagation?.();
      dialog.alert('Delete Notification', 'Remove this notification?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteNotification(id);
            setItems((prev) => prev.filter((n) => n.id !== id));
            refreshNotifications();
          },
        },
      ]);
    },
    [refreshNotifications]
  );

  const filterItems: ReadonlyArray<FilterChipItem<NotificationFilter>> = useMemo(
    () =>
      FILTERS.map((f) => ({
        key: f.key,
        label: f.label,
        count: f.key === 'unread' ? unreadCount : undefined,
      })),
    [unreadCount]
  );

  // Group items by date
  const grouped: Array<{ title: string; data: NotificationRow[] }> = useMemo(() => {
    const groups = new Map<string, NotificationRow[]>();
    for (const item of items) {
      const d = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt as number);
      const key = getGroupTitle(d);
      const existing = groups.get(key);
      if (existing) existing.push(item);
      else groups.set(key, [item]);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [items]);

  const verticalRhythm = isCompact ? spacing.md : spacing.lg;

  return (
    <Screen
      width="form"
      padded={false}
      refreshing={isRefreshing}
      onRefresh={() => loadData(true)}
      contentContainerStyle={{
        paddingHorizontal: verticalRhythm,
        paddingTop: verticalRhythm,
        gap: verticalRhythm,
      }}
    >
      {/* Filter chips (symmetrical top === bottom spacing via verticalRhythm) */}
      <FilterChipBar
        items={filterItems}
        selectedKey={activeFilter}
        onSelect={setActiveFilter}
      />

      {unreadCount > 0 && (
        <View style={styles.markAllRow}>
          <Button
            label="Mark all as read"
            variant="ghost"
            size="sm"
            icon="check"
            onPress={handleMarkAllRead}
          />
        </View>
      )}

      {/* Notification items */}
      {grouped.length === 0 && !isLoading ? (
        <EmptyState
          icon="notifications"
          title={activeFilter === 'all' ? 'No notifications yet' : `No ${activeFilter} notifications`}
          message={
            activeFilter === 'all'
              ? 'Notifications from your clinics and reminders will appear here.'
              : `You don't have any ${activeFilter} notifications right now.`
          }
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {grouped.map(({ title, data }) => (
            <View key={title} style={{ gap: spacing.sm }}>
              <ThemedText variant="captionBold" color="textMuted" style={styles.sectionHeader}>
                {title}
              </ThemedText>
              {data.map((item) => {
                const meta = CATEGORY_MAP[item.category] ?? CATEGORY_MAP.system;
                const d = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt as number);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleItemPress(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${item.body}`}
                    style={(state: any) => [
                      styles.itemCard,
                      {
                        backgroundColor: state.hovered ? colors.surfaceSubtle : colors.card,
                        borderColor: !item.isRead ? colors[meta.border] : colors.border,
                        borderLeftColor: !item.isRead ? colors[meta.color] : colors.border,
                        borderLeftWidth: !item.isRead ? 4 : 1,
                        borderRadius: radii.lg,
                        padding: spacing.md,
                        gap: spacing.md,
                      },
                    ]}
                  >
                    <View style={[styles.itemMainRow, { gap: spacing.md }]}>
                      <View
                        style={[
                          styles.categoryIconCircle,
                          {
                            backgroundColor: colors[meta.bg],
                            borderRadius: radii.full,
                            width: sizes.controlMd,
                            height: sizes.controlMd,
                          },
                        ]}
                      >
                        <AppIcon name={meta.icon} size={sizes.iconMd} color={meta.color} />
                      </View>

                      <View style={[styles.itemContent, { gap: spacing.xxs }]}>
                        <View style={[styles.itemTitleRow, { gap: spacing.sm }]}>
                          <ThemedText
                            variant={item.isRead ? 'body' : 'bodyBold'}
                            color="text"
                            numberOfLines={1}
                            style={styles.flex}
                          >
                            {item.title}
                          </ThemedText>
                          {!item.isRead && (
                            <View
                              style={[
                                styles.unreadIndicator,
                                { backgroundColor: colors[meta.color], borderRadius: radii.full },
                              ]}
                            />
                          )}
                        </View>
                        <ThemedText variant="small" color="textSecondary" numberOfLines={2}>
                          {item.body}
                        </ThemedText>
                        <ThemedText variant="caption" color="textMuted">
                          {relativeTime(d)}
                        </ThemedText>
                      </View>

                      {/* Web inline actions */}
                      <View style={[styles.itemActions, { gap: spacing.xxs }]}>
                        {!item.isRead && (
                          <Pressable
                            onPress={(e) => handleMarkReadSingle(item.id, e)}
                            accessibilityRole="button"
                            accessibilityLabel="Mark as read"
                            style={(s: any) => [
                              styles.actionBtn,
                              {
                                backgroundColor: s.hovered ? colors.primaryLight : colors.transparent,
                                borderRadius: radii.md,
                                padding: spacing.xs,
                              },
                            ]}
                          >
                            <AppIcon name="check" size={sizes.iconSm} color="primary" />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={(e) => handleDelete(item.id, e)}
                          accessibilityRole="button"
                          accessibilityLabel="Delete notification"
                          style={(s: any) => [
                            styles.actionBtn,
                            {
                              backgroundColor: s.hovered ? colors.emergencyBg : colors.transparent,
                              borderRadius: radii.md,
                              padding: spacing.xs,
                            },
                          ]}
                        >
                          <AppIcon
                            name="trash"
                            size={sizes.iconSm}
                            color="emergency"
                          />
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  markAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  sectionHeader: {
    textTransform: 'uppercase',
  },
  itemCard: {
    borderWidth: 1,
    width: '100%',
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  categoryIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadIndicator: {
    width: 8,
    height: 8,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
