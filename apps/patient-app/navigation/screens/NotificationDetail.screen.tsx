import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { eq } from 'drizzle-orm';
import ThemedText from '../../components/ui/ThemedText';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppIcon, type IconName } from '../../components/ui/Icon';
import Screen from '../../components/layout/Screen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { markAsRead } from '../../services/notifications/notificationService';
import { useNotificationContext } from '../../contexts/NotificationContext';
import type { getNotifications } from '../../services/notifications/notificationService';
import { notifications, type NotificationType } from '../../db/schema/notifications';
import { db } from '../../db/index';
import { documentRouteForKind } from '../../services/documents/presentation';

type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

// ─── Category metadata ────────────────────────────────────────────────────────

interface CategoryMeta {
  color: 'primary' | 'warning' | 'success' | 'purple' | 'textSecondary';
  bg: 'primaryLight' | 'warningBg' | 'successBg' | 'purpleBg' | 'surfaceSubtle';
  border: 'primaryBorder' | 'warningBorder' | 'successBorder' | 'purpleBorder' | 'border';
  icon: IconName;
  label: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  appointments: { color: 'primary', bg: 'primaryLight', border: 'primaryBorder', icon: 'calendar', label: 'Appointment' },
  reminders: { color: 'warning', bg: 'warningBg', border: 'warningBorder', icon: 'clock', label: 'Reminder' },
  clinic: { color: 'success', bg: 'successBg', border: 'successBorder', icon: 'hospital', label: 'Clinic' },
  messages: { color: 'purple', bg: 'purpleBg', border: 'purpleBorder', icon: 'chat', label: 'Message' },
  system: { color: 'textSecondary', bg: 'surfaceSubtle', border: 'border', icon: 'info', label: 'System' },
};

// ─── Deep-link action config ───────────────────────────────────────────────────

interface DeepLinkAction {
  label: string;
  icon: IconName;
  variant: 'primary' | 'secondary' | 'outline';
  /** Navigate after dismissing the sheet */
  navigate: (nav: any) => void;
}

function getDeepLinkAction(notification: NotificationRow): DeepLinkAction | null {
  const type = notification.type as NotificationType;
  let extraData: Record<string, unknown> = {};
  try {
    if (notification.data) extraData = JSON.parse(notification.data);
  } catch (_) {}

  const sid = notification.sourceId;

  const documentRoute = documentRouteForKind(extraData.kind);
  if (documentRoute && typeof extraData.documentId === 'string') {
    const id = extraData.documentId;
    return {
      label: documentRoute.label,
      icon: documentRoute.icon,
      variant: 'primary',
      navigate: (nav) => {
        nav.navigate('Main', { screen: documentRoute.screen, params: { id } });
      },
    };
  }

  switch (type) {
    case 'appointment_reminder': {
      const appointmentId = (sid ?? extraData?.appointmentId) as string | undefined;
      return {
        label: 'View Appointment',
        icon: 'calendar',
        variant: 'primary',
        navigate: (nav) => {
          if (appointmentId) {
            nav.navigate('Main', {
              screen: 'AppointmentDetailScreen',
              params: { appointmentId },
            });
          } else {
            nav.navigate('Main', {
              screen: 'BottomTabs',
              params: { screen: 'AppointmentsScreen' },
            });
          }
        },
      };
    }

    case 'medication_reminder':
      return {
        label: 'View Prescriptions',
        icon: 'pill',
        variant: 'primary',
        navigate: (nav) => {
          nav.navigate('Main', { screen: 'PrescriptionsScreen' });
        },
      };

    case 'lab_result':
      return {
        label: 'View Lab Results',
        icon: 'lab',
        variant: 'primary',
        navigate: (nav) => {
          nav.navigate('Main', { screen: 'LabResultsScreen' });
        },
      };

    case 'clinic_announcement': {
      const clinicId = (sid ?? extraData?.clinicId) as string | undefined;
      if (!clinicId) return null;
      return {
        label: 'View Clinic',
        icon: 'hospital',
        variant: 'primary',
        navigate: (nav) => {
          nav.navigate('Main', {
            screen: 'ClinicDetailsScreen',
            params: { clinicId },
          });
        },
      };
    }

    case 'new_message':
      return null;

    case 'system': {
      const route = extraData?.route as string | undefined;
      if (route === 'SettingsScreen') {
        return {
          label: 'Go to Settings',
          icon: 'settings',
          variant: 'outline',
          navigate: (nav) => {
            nav.navigate('Main', { screen: 'SettingsScreen' });
          },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { refreshNotifications } = useNotificationContext();

  const rawParams = (route.params ?? {}) as any;
  const initialNotification = rawParams?.notification as NotificationRow | undefined;
  const notifId = rawParams?.id ?? initialNotification?.id;

  const [notification, setNotification] = useState<NotificationRow | null>(
    initialNotification ?? null
  );
  const [isLoading, setIsLoading] = useState(!initialNotification);

  useEffect(() => {
    if (!notification && notifId) {
      db.select()
        .from(notifications)
        .where(eq(notifications.id, String(notifId)))
        .limit(1)
        .then((rows) => {
          if (rows[0]) {
            setNotification(rows[0] as any);
          }
        })
        .finally(() => setIsLoading(false));
    }
  }, [notifId, notification]);

  const meta = notification
    ? CATEGORY_META[notification.category] ?? CATEGORY_META.system
    : CATEGORY_META.system;
  const deepLink = useMemo(() => (notification ? getDeepLinkAction(notification) : null), [notification]);

  const createdAt =
    notification?.createdAt instanceof Date
      ? notification.createdAt
      : new Date((notification?.createdAt as any) || Date.now());

  // Mark as read on open
  useEffect(() => {
    if (notification && !notification.isRead) {
      markAsRead(notification.id).then(() => refreshNotifications());
    }
  }, [notification, refreshNotifications]);

  // "Done" in header right
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button">
          <ThemedText variant="bodyBold" color="primary">
            Done
          </ThemedText>
        </Pressable>
      ),
    });
  }, [navigation]);

  const handleDeepLink = () => {
    if (!deepLink) return;
    navigation.goBack();
    setTimeout(() => deepLink.navigate(navigation), 350);
  };

  if (isLoading) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.lg, padding: spacing.md }}>
        <Skeleton height={200} radius={radii.lg} />
      </Screen>
    );
  }

  if (!notification) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.lg, padding: spacing.md }}>
        <EmptyState
          icon="notifications"
          title="Notification not found"
          message="The notification you requested could not be located."
        />
      </Screen>
    );
  }

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      <Card padding="lg" style={{ gap: spacing.md }}>
        {/* Icon + category pill */}
        <View style={styles.iconRow}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: colors[meta.bg],
                borderRadius: radii.full,
                width: sizes.controlLg,
                height: sizes.controlLg,
              },
            ]}
          >
            <AppIcon name={meta.icon} size={sizes.iconLg} color={meta.color} />
          </View>
          <Badge
            label={meta.label.toUpperCase()}
            tone={
              meta.color === 'primary'
                ? 'primary'
                : meta.color === 'warning'
                ? 'warning'
                : meta.color === 'success'
                ? 'success'
                : meta.color === 'purple'
                ? 'purple'
                : 'neutral'
            }
            size="md"
          />
        </View>

        {/* Title */}
        <ThemedText variant="h2">{notification.title}</ThemedText>

        {/* Timestamp */}
        <ThemedText variant="small" color="textMuted">
          {format(createdAt, "MMMM d, yyyy 'at' h:mm a")}
        </ThemedText>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Body */}
        <ThemedText variant="bodyLarge" color="text" style={styles.bodyText}>
          {notification.body}
        </ThemedText>
      </Card>

      {/* Deep-link CTA - only shown when a target screen exists */}
      {deepLink && (
        <Button
          label={deepLink.label}
          variant={deepLink.variant}
          size="lg"
          icon={deepLink.icon}
          iconRight="forward"
          fullWidth
          onPress={handleDeepLink}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  bodyText: {
    lineHeight: 24,
  },
});
