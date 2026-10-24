import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { formatDistanceToNowStrict, isToday, isYesterday, format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '../../components/ui/ThemedText';
import { AppIcon, type IconName } from '../../components/ui/Icon';
import { FilterChipBar, type FilterChipItem } from '../../components/ui/FilterChipBar';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { usePatientId } from '../../hooks/usePatientId';
import {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  type NotificationFilter,
} from '../../services/notifications/notificationService';
import { dialog } from '../../utils/dialog';

// ─── Constants ─────────────────────────────────────────────────────────────────

interface CategoryMeta {
  color: 'primary' | 'warning' | 'success' | 'purple' | 'textSecondary';
  bg: 'primaryLight' | 'warningBg' | 'successBg' | 'purpleBg' | 'surfaceSubtle';
  border: 'primaryBorder' | 'warningBorder' | 'successBorder' | 'purpleBorder' | 'border';
  icon: IconName;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  appointments: { color: 'primary', bg: 'primaryLight', border: 'primaryBorder', icon: 'calendar' },
  reminders: { color: 'warning', bg: 'warningBg', border: 'warningBorder', icon: 'clock' },
  clinic: { color: 'success', bg: 'successBg', border: 'successBorder', icon: 'hospital' },
  messages: { color: 'purple', bg: 'purpleBg', border: 'purpleBorder', icon: 'chat' },
  system: { color: 'textSecondary', bg: 'surfaceSubtle', border: 'border', icon: 'info' },
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

const SWIPE_THRESHOLD = 80;

type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function groupByDate(
  items: NotificationRow[],
): Array<{ title: string; data: NotificationRow[] }> {
  const groups = new Map<string, NotificationRow[]>();
  for (const item of items) {
    const d =
      item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt as number);
    const key = getGroupTitle(d);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

// ─── NotificationItem (swipeable card) ────────────────────────────────────────

interface NotificationItemProps {
  item: NotificationRow;
  onPress: (item: NotificationRow) => void;
  onDelete: (id: string) => void;
}

function NotificationItem({ item, onPress, onDelete }: NotificationItemProps) {
  const { colors, radii, sizes } = useAppTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.system;

  const d =
    item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt as number);

  const close = () => {
    translateX.value = withSpring(0, { damping: 20 });
  };
  const open = () => {
    translateX.value = withSpring(-SWIPE_THRESHOLD, { damping: 20 });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.max(
        -SWIPE_THRESHOLD,
        Math.min(0, startX.value + e.translationX),
      );
    })
    .onEnd((e) => {
      if (e.velocityX < -300 || translateX.value < -SWIPE_THRESHOLD / 2) {
        runOnJS(open)();
      } else {
        runOnJS(close)();
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = () => {
    onPress(item);
  };

  const handleDelete = () => {
    close();
    dialog.alert('Delete Notification', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  };

  return (
    <View style={[styles.itemWrapper, { borderRadius: radii.lg }]}>
      {/* Swipe action panel */}
      <View
        style={[
          styles.deletePanel,
          {
            backgroundColor: colors.emergency,
            borderRadius: radii.lg,
          },
        ]}
      >
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <AppIcon name="trash" size={sizes.iconSm} color="textInverted" />
          <ThemedText variant="captionBold" color="textInverted">
            Delete
          </ThemedText>
        </Pressable>
      </View>

      {/* Card face */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.lg,
            },
            !item.isRead && {
              borderLeftColor: colors[meta.color],
              borderLeftWidth: 3,
            },
          ]}
        >
          <Pressable onPress={handlePress} style={styles.cardInner}>
            {/* Category icon */}
            <View
              style={[
                styles.iconCircle,
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

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
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
                      styles.unreadDot,
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
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Permission Banner ─────────────────────────────────────────────────────────

function PermissionBanner({ onPress }: { onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.permissionBanner,
        {
          backgroundColor: colors.primarySubtle,
          borderColor: colors.primaryBorder,
          borderRadius: radii.lg,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View
        style={[
          styles.permissionIconWrap,
          {
            backgroundColor: colors.primaryLight,
            borderRadius: radii.full,
            width: sizes.controlMd,
            height: sizes.controlMd,
          },
        ]}
      >
        <AppIcon name="notificationsActive" size={sizes.iconMd} color="primary" />
      </View>
      <View style={styles.flex}>
        <ThemedText variant="bodyBold">Enable Push Notifications</ThemedText>
        <ThemedText variant="small" color="textSecondary">
          Get reminders for appointments, medications, and clinic updates.
        </ThemedText>
      </View>
      <ThemedText variant="smallBold" color="primary">
        Enable
      </ThemedText>
    </Pressable>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyStateView({ filter }: { filter: NotificationFilter }) {
  const { sizes } = useAppTheme();
  return (
    <View style={styles.emptyState}>
      <AppIcon name="notificationsOff" size={sizes.iconXl} color="textMuted" />
      <ThemedText variant="h3">
        {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
      </ThemedText>
      <ThemedText variant="body" color="textMuted" style={styles.textCenter}>
        {filter === 'all'
          ? 'Notifications from your clinics and reminders will appear here.'
          : `You don't have any ${filter} notifications right now.`}
      </ThemedText>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationScreen() {
  const { colors, spacing } = useAppTheme();
  const navigation = useNavigation();
  const patientId = usePatientId();
  const insets = useSafeAreaInsets();
  const { unreadCount, refreshNotifications, permissionStatus, requestPermissions } =
    useNotificationContext();

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead(patientId);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    refreshNotifications();
  }, [patientId, refreshNotifications]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        unreadCount > 0
          ? () => (
              <Pressable onPress={handleMarkAllRead} accessibilityRole="button">
                <ThemedText variant="bodyBold" color="primary">
                  Mark all as read
                </ThemedText>
              </Pressable>
            )
          : undefined,
    });
  }, [unreadCount, handleMarkAllRead, navigation]);

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
    [patientId, activeFilter],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleItemPress = useCallback(
    async (item: NotificationRow) => {
      if (!item.isRead) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
      }
      navigation.navigate('Main', {
        screen: 'NotificationDetailScreen',
        params: { notification: item },
      } as any);
    },
    [navigation],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteNotification(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      refreshNotifications();
    },
    [refreshNotifications],
  );

  const filterItems: ReadonlyArray<FilterChipItem<NotificationFilter>> = useMemo(
    () =>
      FILTERS.map((f) => ({
        key: f.key,
        label: f.label,
        count: f.key === 'unread' ? unreadCount : undefined,
      })),
    [unreadCount],
  );

  const sections = groupByDate(items);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Filter chips (symmetrical top === bottom paddingVertical: spacing.md) */}
      <View style={{ paddingVertical: spacing.md }}>
        <FilterChipBar
          items={filterItems}
          selectedKey={activeFilter}
          onSelect={setActiveFilter}
          contentContainerStyle={{ paddingHorizontal: spacing.lg }}
        />
      </View>

      {/* Main list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.lg },
          sections.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          permissionStatus !== 'granted' ? (
            <PermissionBanner onPress={requestPermissions} />
          ) : null
        }
        ListEmptyComponent={isLoading ? null : <EmptyStateView filter={activeFilter} />}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
              {title}
            </ThemedText>
          </View>
        )}
        renderItem={({ item }) => (
          <NotificationItem item={item} onPress={handleItemPress} onDelete={handleDelete} />
        )}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },

  listContent: {
    gap: 8,
  },
  listContentEmpty: { flex: 1 },

  sectionHeader: {
    paddingBottom: 6,
    paddingTop: 4,
  },
  sectionTitle: {
    textTransform: 'uppercase',
  },

  // Card
  itemWrapper: {
    marginBottom: 8,
    overflow: 'hidden',
  },
  deletePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_THRESHOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    gap: 3,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 13,
    gap: 11,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
  },

  // Permission banner
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  permissionIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  textCenter: {
    textAlign: 'center',
  },
});
