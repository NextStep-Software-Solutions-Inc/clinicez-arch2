import { useCallback, useLayoutEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { MaterialSymbolProps, SFSymbolProps, useFocusEffect, useNavigation, useTheme } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SFSymbol, MaterialSymbol } from '@react-navigation/native';
import { formatDistanceToNowStrict, isToday, isYesterday, format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import { useNotificationContext } from 'contexts/NotificationContext';
import { usePatientId } from 'hooks/usePatientId';
import {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  type NotificationFilter,
} from 'services/notifications/notificationService';
import type { NotificationCategory } from '@db/schema/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '@utils/dialog';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { color: string; iconAndroid: MaterialSymbolProps['name']; iconIos: SFSymbolProps['name'] }
> = {
  appointments: { color: '#3B82F6', iconAndroid: 'event', iconIos: 'calendar.circle.fill' },
  reminders: { color: '#F59E0B', iconAndroid: 'alarm', iconIos: 'alarm.fill' },
  clinic: { color: '#10B981', iconAndroid: 'local_hospital', iconIos: 'cross.case.fill' },
  messages: { color: '#8B5CF6', iconAndroid: 'chat', iconIos: 'message.fill' },
  system: { color: '#6B7280', iconAndroid: 'info', iconIos: 'info.circle.fill' },
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
  const { colors } = useTheme();
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
    <View style={styles.itemWrapper}>
      {/* Swipe action panel */}
      <View style={styles.deletePanel}>
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
        >
          {Platform.select({
            ios: <SFSymbol name="trash.fill" size={18} color="#fff" />,
            android: <MaterialSymbol name="delete" size={20} color="#fff" />,
          })}
          <ThemedText style={styles.deleteBtnText}>Delete</ThemedText>
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
            },
            !item.isRead && {
              borderLeftColor: meta.color,
              borderLeftWidth: 3,
            },
          ]}
        >
          <Pressable onPress={handlePress} style={styles.cardInner}>
            {/* Category icon */}
            <View
              style={[styles.iconCircle, { backgroundColor: meta.color + '22' }]}
            >
              {Platform.select({
                ios: <SFSymbol name={meta.iconIos} size={18} color={meta.color} />,
                android: (
                  <MaterialSymbol name={meta.iconAndroid} size={20} color={meta.color} />
                ),
              })}
            </View>

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
                <ThemedText
                  style={[
                    styles.cardTitle,
                    { color: colors.text },
                    !item.isRead && styles.cardTitleBold,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </ThemedText>
                {!item.isRead && (
                  <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />
                )}
              </View>
              <ThemedText
                style={[styles.cardBody, { color: colors.text }]}
                numberOfLines={2}
              >
                {item.body}
              </ThemedText>
              <ThemedText style={[styles.cardTime, { color: colors.text }]}>
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.permissionBanner,
        { backgroundColor: '#3B82F615', borderColor: '#3B82F655' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.permissionIconWrap}>
        {Platform.select({
          ios: <SFSymbol name="bell.badge.fill" size={22} color="#3B82F6" />,
          android: (
            <MaterialSymbol name="notifications_active" size={24} color="#3B82F6" />
          ),
        })}
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.permissionTitle, { color: colors.text }]}>
          Enable Push Notifications
        </ThemedText>
        <ThemedText style={[styles.permissionSub, { color: colors.text }]}>
          Get reminders for appointments, medications, and clinic updates.
        </ThemedText>
      </View>
      <ThemedText style={{ color: '#3B82F6', fontSize: 13, fontWeight: '600' }}>
        Enable
      </ThemedText>
    </Pressable>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: NotificationFilter }) {
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState}>
      {Platform.select({
        ios: <SFSymbol name="bell.slash.fill" size={40} color={colors.text} />,
        android: (
          <MaterialSymbol name="notifications_off" size={44} color={colors.text} />
        ),
      })}
      <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
        {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
      </ThemedText>
      <ThemedText style={[styles.emptySub, { color: colors.text }]}>
        {filter === 'all'
          ? 'Notifications from your clinics and reminders will appear here.'
          : `You don't have any ${filter} notifications right now.`}
      </ThemedText>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationScreen() {
  const { colors } = useTheme();
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

  // Put "Mark all as read" in the navigation header when there are unread items
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: unreadCount > 0
        ? () => (
          <ThemedText
            onPress={handleMarkAllRead}
            style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}
          >
            Mark all as read
          </ThemedText>
        )
        : undefined,
    });
  }, [unreadCount, handleMarkAllRead, navigation, colors.primary]);

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
      // Mark read optimistically before opening detail
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

  const sections = groupByDate(items);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Filter chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const isActive = f.key === activeFilter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={[
                  styles.filterChip,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
                ]}
              >
                <ThemedText
                  style={[
                    styles.filterChipText,
                    isActive
                      ? { color: '#fff', fontWeight: '700' }
                      : { color: colors.text, opacity: 0.7 },
                  ]}
                >
                  {f.label}
                  {f.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 16 },
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
        ListEmptyComponent={isLoading ? null : <EmptyState filter={activeFilter} />}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
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
  root: { flex: 1 },

  filterRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChipText: { fontSize: 13 },

  listContent: {
    padding: 16,
    gap: 8,
  },
  listContentEmpty: { flex: 1 },

  sectionHeader: {
    paddingBottom: 6,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.5,
  },

  // Card
  itemWrapper: {
    marginBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  deletePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_THRESHOLD,
    backgroundColor: '#EF4444',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    gap: 3,
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  card: {
    borderRadius: 14,
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  cardTitle: { fontSize: 14, flex: 1 },
  cardTitleBold: { fontWeight: '700' },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  cardTime: {
    fontSize: 11,
    opacity: 0.45,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  markAllBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 6,
  },

  // Permission banner
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  permissionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F620',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  permissionSub: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 1,
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
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.55,
    lineHeight: 20,
  },
});