import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import AppointmentStatusBadge from './AppointmentStatusBadge';
import type { AppointmentItem, AppointmentStatus } from '../../services/appointments/types';
import { format, parseISO } from 'date-fns';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';

interface AppointmentCardProps {
  item: AppointmentItem;
  onPress: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
  isToday?: boolean;
}

function getStatusTheme(status: AppointmentStatus, theme: AppTheme) {
  const { colors } = theme;
  switch (status) {
    case 'confirmed':
      return { bg: colors.successBg, border: colors.successBorder };
    case 'pending':
      return { bg: colors.surfaceSubtle, border: colors.borderLight };
    case 'canceled':
      return { bg: colors.emergencyBg, border: colors.emergencyBorder };
    case 'action_required':
      return { bg: colors.urgentBg, border: colors.urgentBorder };
    case 'completed':
      return { bg: colors.primarySubtle, border: colors.primaryBorder };
    case 'no_show':
    default:
      return { bg: colors.surfaceMuted, border: colors.borderLight };
  }
}

function ProviderAvatar({ url, name }: { url?: string | null; name: string }) {
  const { colors, radii } = useAppTheme();
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.providerAvatar, { borderRadius: radii.full }]}
        accessibilityRole="image"
        accessibilityLabel={name}
      />
    );
  }
  return (
    <ThemedView
      style={[
        styles.providerAvatar,
        styles.avatarFallback,
        { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full },
      ]}
    >
      <ThemedText variant="captionBold" color="textSecondary">
        {initials}
      </ThemedText>
    </ThemedView>
  );
}

function ClinicLogo({ url, name }: { url?: string | null; name: string }) {
  const { colors, radii } = useAppTheme();
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.clinicLogo, { borderRadius: radii.md }]}
        accessibilityRole="image"
        accessibilityLabel={name}
      />
    );
  }
  return (
    <ThemedView
      style={[
        styles.clinicLogo,
        styles.clinicLogoFallback,
        { backgroundColor: colors.primary, borderRadius: radii.md },
      ]}
    >
      <ThemedText variant="captionBold" color="onPrimary">
        {initials}
      </ThemedText>
    </ThemedView>
  );
}

export default function AppointmentCard({
  item,
  onPress,
  onReschedule,
  onCancel,
  isToday = false,
}: AppointmentCardProps) {
  const theme = useAppTheme();
  const { colors, radii, shadows } = theme;

  let dateLabel = '';
  let timeLabel = '';
  try {
    const d = parseISO(item.scheduledAt);
    dateLabel = format(d, 'EEE, MMM d');
    timeLabel = format(d, 'h:mm a');
  } catch {
    dateLabel = item.scheduledAt.slice(0, 10);
  }

  const statusColors = getStatusTheme(item.status, theme);
  const borderColor = isToday ? statusColors.border : colors.border;
  const bgColor = isToday ? statusColors.bg : colors.surface;
  const isFinal = item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }: any) => [
        styles.card,
        shadows.sm,
        {
          borderColor,
          backgroundColor: bgColor,
          borderRadius: radii.xl,
          opacity: pressed ? 0.86 : 1,
        },
        hovered && !isToday && { backgroundColor: colors.surfaceSubtle },
      ]}
    >
      {/* Clinic row */}
      <ThemedView style={styles.clinicRow}>
        <ClinicLogo url={item.clinic.logoUrl} name={item.clinic.name} />
        <ThemedView style={styles.clinicInfo}>
          <ThemedText variant="bodyBold" numberOfLines={1}>
            {item.clinic.name}
          </ThemedText>
          <ThemedText variant="small" color="textSecondary" numberOfLines={1}>
            {item.serviceType}
          </ThemedText>
        </ThemedView>
        <AppointmentStatusBadge status={item.status} size="sm" />
      </ThemedView>

      {/* Date / Time */}
      <ThemedView style={styles.timeRow}>
        <ThemedView style={styles.timeBlock}>
          <ThemedText variant="h1">{timeLabel}</ThemedText>
          <ThemedText variant="small" color="textSecondary">
            {dateLabel}
          </ThemedText>
        </ThemedView>
        <ThemedView
          style={[
            styles.durationChip,
            { borderColor: colors.borderLight, borderRadius: radii.full },
          ]}
        >
          <ThemedText variant="captionBold" color="textSecondary">
            {item.durationMinutes} min
          </ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Provider row */}
      <ThemedView style={[styles.providerRow, { borderTopColor: colors.borderLight }]}>
        <ProviderAvatar url={item.provider.avatarUrl} name={item.provider.name} />
        <ThemedView style={styles.providerInfo}>
          <ThemedText variant="smallBold" numberOfLines={1}>
            {item.provider.name}
          </ThemedText>
          <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
            {item.provider.specialty}
          </ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Quick actions — only for non-terminal statuses */}
      {!isFinal && (onReschedule || onCancel) && (
        <ThemedView style={[styles.actionsRow, { borderTopColor: colors.borderLight }]}>
          {onReschedule && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onReschedule();
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Reschedule"
            >
              <ThemedText variant="smallBold" color="primary">
                Reschedule
              </ThemedText>
            </Pressable>
          )}
          {onCancel && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onCancel();
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <ThemedText variant="smallBold" color="emergency">
                Cancel
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  clinicLogo: {
    width: 40,
    height: 40,
  },
  clinicLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicInfo: {
    flex: 1,
    gap: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  timeBlock: {
    gap: 1,
  },
  durationChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  providerAvatar: {
    width: 30,
    height: 30,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
    gap: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
