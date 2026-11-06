import React, { memo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { AppointmentItem } from '../../services/appointments/types';
import { extractInitials } from '../../services/home/homeDashboardService';

export interface PastAppointmentCardProps {
  appointment: AppointmentItem;
  onPressCard: () => void;
  onViewSummaryPress: () => void;
  onBookAgainPress: () => void;
}

function PastAppointmentCardComponent({
  appointment,
  onPressCard,
  onViewSummaryPress,
  onBookAgainPress,
}: PastAppointmentCardProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  const scheduledDate = (() => {
    try {
      return parseISO(appointment.scheduledAt);
    } catch {
      return new Date();
    }
  })();

  const dateFormatted = (() => {
    try {
      return format(scheduledDate, 'MMM d, yyyy');
    } catch {
      return appointment.scheduledAt;
    }
  })();

  const providerName = appointment.provider.name;
  const initials = extractInitials(providerName);
  const serviceTitle = appointment.serviceType || 'Consultation';
  const isCanceled = appointment.status === 'canceled';

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`Past appointment with ${providerName}`}
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.xl,
          padding: spacing.base,
          opacity: pressed ? 0.95 : 1,
        },
        elevation.card,
      ]}
    >
      {/* Top Header: Avatar + Info + Completed Badge */}
      <View style={styles.headerRow}>
        <View style={styles.avatarContainer}>
          {appointment.provider.avatarUrl ? (
            <Image
              source={{ uri: appointment.provider.avatarUrl }}
              style={[styles.avatar, { borderRadius: radii.md }]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  borderRadius: radii.md,
                  backgroundColor: colors.mintSoftBg,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: colors.primaryDeep,
                    fontWeight: '700',
                  },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.providerInfoColumn}>
          <View style={styles.nameBadgeRow}>
            <Text
              numberOfLines={1}
              style={[
                typography.cardTitle,
                {
                  color: colors.navyText,
                  fontWeight: '700',
                  flex: 1,
                },
              ]}
            >
              {providerName}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isCanceled ? colors.roseSoftBg : colors.slatePillBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: isCanceled ? colors.roseAccent : colors.slatePillText,
                    fontWeight: '600',
                  },
                ]}
              >
                {isCanceled ? 'Canceled' : 'Completed'}
              </Text>
            </View>
          </View>

          <Text
            numberOfLines={1}
            style={[
              typography.bodySm,
              {
                color: colors.mutedText,
                marginTop: 2,
              },
            ]}
          >
            {serviceTitle} • {dateFormatted}
          </Text>

          {/* Published Notes & Rx Badge */}
          {!isCanceled ? (
            <View style={styles.notesRow}>
              <AppIcon name="checkCircle" size={13} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.bodySmMedium,
                  {
                    color: colors.primaryDeep,
                    marginLeft: 4,
                    fontWeight: '600',
                  },
                ]}
              >
                Notes & Rx Published
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={[styles.actionsRow, { marginTop: spacing.md, gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Visit Summary"
          onPress={onViewSummaryPress}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="document" size={15} color={colors.primaryDeep} />
          <Text
            style={[
              typography.labelMd,
              {
                color: colors.primaryDeep,
                fontWeight: '700',
              },
            ]}
          >
            View Summary
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book Again"
          onPress={onBookAgainPress}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="refresh" size={15} color={colors.primaryDeep} />
          <Text
            style={[
              typography.labelMd,
              {
                color: colors.primaryDeep,
                fontWeight: '700',
              },
            ]}
          >
            Book Again
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export const PastAppointmentCard = memo(PastAppointmentCardComponent);
export default PastAppointmentCard;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfoColumn: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    gap: 6,
  },
});
