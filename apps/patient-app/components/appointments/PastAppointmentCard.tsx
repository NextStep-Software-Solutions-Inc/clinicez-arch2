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
  const isNoShow = appointment.status === 'no_show';
  const hasPublishedNotes =
    !isCanceled &&
    Boolean(
      appointment.clinicalAssessment ||
        appointment.doctorPlan ||
        appointment.prescriptionsSummary ||
        appointment.attachedDocuments.length > 0,
    );

  const statusPillBg = isCanceled
    ? colors.roseSoftBg
    : isNoShow
      ? colors.amberSoftBg
      : colors.slatePillBg;
  const statusPillText = isCanceled
    ? colors.roseAccent
    : isNoShow
      ? colors.amberText
      : colors.slatePillText;
  const statusLabel = isCanceled ? 'Canceled' : isNoShow ? 'No Show' : 'Completed';

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`Past appointment with ${providerName}`}
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: radii.xl,
          padding: spacing.base,
          opacity: pressed ? 0.96 : 1,
        },
        elevation.card,
      ]}
    >
      {/* Top Header: Circular Avatar + Info + Completed Pill */}
      <View style={styles.headerRow}>
        <View style={styles.avatarContainer}>
          {appointment.provider.avatarUrl ? (
            <Image
              source={{ uri: appointment.provider.avatarUrl }}
              style={[styles.avatar, { borderRadius: radii.full }]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.mintSoftBg,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.primary,
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
                  backgroundColor: statusPillBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: statusPillText,
                    fontWeight: '600',
                  },
                ]}
              >
                {statusLabel}
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
          {hasPublishedNotes ? (
            <View style={styles.notesRow}>
              <AppIcon name="badgeCheck" size={14} color={colors.primary} />
              <Text
                style={[
                  typography.bodySmMedium,
                  {
                    color: colors.primary,
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
          onPress={(e) => {
            e?.stopPropagation?.();
            onViewSummaryPress();
          }}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.full,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="document" size={15} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={[
              typography.labelBold,
              {
                color: colors.primary,
              },
            ]}
          >
            View Summary
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book Again"
          onPress={(e) => {
            e?.stopPropagation?.();
            onBookAgainPress();
          }}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="rotateCcw" size={15} color={colors.primaryDeep} />
          <Text
            numberOfLines={1}
            style={[
              typography.labelBold,
              {
                color: colors.navyText,
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
    minWidth: 0,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
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
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
});
