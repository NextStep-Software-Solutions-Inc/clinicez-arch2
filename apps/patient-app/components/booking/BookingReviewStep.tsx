import React, { memo, useState, useEffect, useMemo } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { format, subDays, addMinutes, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { PatientSearchDoctorDto, PatientSearchClinicDto } from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';
import type { ConsultationMode } from './BookingSlotStep';

export interface BookingReviewStepProps {
  doctor: PatientSearchDoctorDto;
  clinic?: PatientSearchClinicDto | null;
  selectedDate: Date;
  selectedSlot: AvailableSlot;
  consultationMode: ConsultationMode;
  reasonForVisit?: string;
  isSubmitting?: boolean;
  onChangeTimeOrMode: () => void;
  onConfirmAndBook: (options: { sendReminders: boolean }) => void;
}

function BookingReviewStepComponent({
  doctor,
  clinic,
  selectedDate,
  selectedSlot,
  consultationMode,
  reasonForVisit = 'Routine Cardiology Follow-up & ECG Check',
  isSubmitting = false,
  onChangeTimeOrMode,
  onConfirmAndBook,
}: BookingReviewStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(14 * 60 + 48); // 14:48 min
  const [sendReminders, setSendReminders] = useState<boolean>(true);

  // Live 15-minute countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedCountdown = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, [secondsRemaining]);

  // Compute cancellation cutoff (24 hours prior)
  const cancellationCutoff = useMemo(() => {
    const prevDay = subDays(selectedDate, 1);
    return `${format(prevDay, 'EEEE, MMM d')} at ${selectedSlot.displayTime || selectedSlot.time}`;
  }, [selectedDate, selectedSlot]);

  // Compute early arrival time (10 mins prior)
  const earlyArrivalTime = useMemo(() => {
    try {
      const parts = (selectedSlot.time || '10:30').split(':');
      const hour = parseInt(parts[0] || '10', 10);
      const min = parseInt(parts[1] || '30', 10);
      let earlyHour = hour;
      let earlyMin = min - 10;
      if (earlyMin < 0) {
        earlyMin += 60;
        earlyHour -= 1;
      }
      const period = earlyHour >= 12 ? 'PM' : 'AM';
      const displayHour = earlyHour > 12 ? earlyHour - 12 : earlyHour === 0 ? 12 : earlyHour;
      return `${displayHour}:${earlyMin < 10 ? '0' : ''}${earlyMin} ${period}`;
    } catch {
      return '10:20 AM';
    }
  }, [selectedSlot]);

  // End time (30 mins after slot start)
  const endTime = useMemo(() => {
    try {
      const parts = (selectedSlot.time || '10:30').split(':');
      const hour = parseInt(parts[0] || '10', 10);
      const min = parseInt(parts[1] || '30', 10);
      let endHour = hour;
      let endMin = min + 30;
      if (endMin >= 60) {
        endMin -= 60;
        endHour += 1;
      }
      const period = endHour >= 12 ? 'PM' : 'AM';
      const displayHour = endHour > 12 ? endHour - 12 : endHour === 0 ? 12 : endHour;
      return `${displayHour}:${endMin < 10 ? '0' : ''}${endMin} ${period}`;
    } catch {
      return '11:00 AM';
    }
  }, [selectedSlot]);

  const handleGetDirections = () => {
    const address = clinic?.address || doctor.clinicAddress || 'Metro Cardiology Clinic';
    const query = encodeURIComponent(`${clinic?.name || doctor.clinicName} ${address}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Live Reservation Countdown Banner */}
      <View
        style={[
          styles.countdownBanner,
          {
            backgroundColor: colors.welcomeSurface,
            borderColor: colors.welcomeBorder,
            borderRadius: radii.xl,
            padding: spacing.base,
          },
        ]}
      >
        <View
          style={[
            styles.timerIconBadge,
            {
              backgroundColor: colors.mintBadgeBg,
              borderRadius: radii.full,
            },
          ]}
        >
          <AppIcon name="shieldCheck" size={18} color={colors.primaryDeep} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={styles.countdownTitleRow}>
            <Text
              style={[
                typography.labelMd,
                { color: colors.navyText, fontWeight: '700' },
              ]}
            >
              Slot reserved for {formattedCountdown} min
            </Text>
            <View
              style={[
                styles.pulsingDot,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.emeraldDot,
                  marginLeft: spacing.xs,
                },
              ]}
            />
          </View>
          <Text
            style={[
              typography.bodySm,
              { color: colors.bodyText, marginTop: spacing.xxs },
            ]}
            numberOfLines={1}
          >
            No charges until your visit at the clinic reception.
          </Text>
        </View>
      </View>

      {/* Time & Consultation Mode Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.lg,
          },
          elevation.card,
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: colors.skySoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="calendarCheck" size={18} color={colors.skyIcon} />
            </View>
            <Text
              style={[
                typography.headlineMd,
                { color: colors.navyText, fontWeight: '700', marginLeft: spacing.sm },
              ]}
            >
              Time & Consultation Mode
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change time or consultation mode"
            onPress={onChangeTimeOrMode}
            style={({ pressed }) => [
              styles.changeBtn,
              {
                backgroundColor: colors.skySoftBg,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: spacing.xs,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.labelSm,
                { color: colors.primaryDeep, fontWeight: '700' },
              ]}
            >
              Change
            </Text>
          </Pressable>
        </View>

        {/* Date & Time Row */}
        <View style={[styles.timeRow, { marginTop: spacing.base }]}>
          <View
            style={[
              styles.subIconBox,
              {
                backgroundColor: colors.skySoftBg,
                borderRadius: radii.md,
              },
            ]}
          >
            <AppIcon name="calendar" size={16} color={colors.skyIcon} />
          </View>

          <View style={{ marginLeft: spacing.sm }}>
            <Text
              style={[
                typography.labelLg,
                { color: colors.navyText, fontWeight: '700' },
              ]}
            >
              {format(selectedDate, 'EEEE, MMM d, yyyy')}
            </Text>
            <Text
              style={[
                typography.bodyMd,
                { color: colors.bodyText, marginTop: spacing.xxs },
              ]}
            >
              {selectedSlot.displayTime || selectedSlot.time} – {endTime}
            </Text>
          </View>
        </View>

        {/* Early Arrival Note Box */}
        <View
          style={[
            styles.earlyArrivalBox,
            {
              backgroundColor: colors.skySoftBg,
              borderRadius: radii.lg,
              padding: spacing.md,
              marginTop: spacing.md,
            },
          ]}
        >
          <AppIcon name="clock" size={16} color={colors.skyIcon} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text
              style={[
                typography.labelSm,
                { color: colors.navyText, fontWeight: '700' },
              ]}
            >
              Arrive 10 minutes early ({earlyArrivalTime})
            </Text>
            <Text
              style={[
                typography.bodySm,
                { color: colors.bodyText, marginTop: spacing.xxs },
              ]}
            >
              Allows reception team to process vitals & intake check-in smoothly.
            </Text>
          </View>
        </View>

        {/* Location Row */}
        <View style={[styles.locationRow, { marginTop: spacing.base }]}>
          <AppIcon name="location" size={16} color={colors.mutedText} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text
              style={[
                typography.labelMd,
                { color: colors.navyText, fontWeight: '600' },
              ]}
              numberOfLines={1}
            >
              {clinic?.address || doctor.clinicAddress || '450 Elm Blvd, Suite 320'}
            </Text>
            <Text
              style={[
                typography.bodySm,
                { color: colors.mutedText, marginTop: spacing.xxs },
              ]}
              numberOfLines={1}
            >
              Medical District, Metro City • {clinic?.name || doctor.clinicName}
            </Text>
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Get directions in Google Maps"
            onPress={handleGetDirections}
            style={styles.directionsBtn}
          >
            <Text
              style={[
                typography.labelSm,
                { color: colors.primaryDeep, fontWeight: '700', marginRight: spacing.xxs },
              ]}
            >
              Get Directions
            </Text>
            <AppIcon name="externalLink" size={12} color={colors.primaryDeep} />
          </Pressable>
        </View>
      </View>

      {/* Reason for Visit Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.lg,
          },
          elevation.card,
        ]}
      >
        <Text style={[typography.labelSm, { color: colors.mutedText, letterSpacing: 0.5 }]}>
          REASON FOR VISIT
        </Text>
        <Text
          style={[
            typography.bodyMd,
            { color: colors.navyText, fontWeight: '600', marginTop: spacing.xs },
          ]}
        >
          {reasonForVisit}
        </Text>
      </View>

      {/* Estimated Cost Breakdown Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.lg,
          },
          elevation.card,
        ]}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: colors.skySoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="building" size={18} color={colors.skyIcon} />
            </View>
            <Text
              style={[
                typography.headlineMd,
                { color: colors.navyText, fontWeight: '700', marginLeft: spacing.sm },
              ]}
            >
              Estimated Cost Breakdown
            </Text>
          </View>
        </View>

        {/* Breakdown Items */}
        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          {/* Fee 1 */}
          <View style={styles.costItemRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '600' }]}>
                Consultation Fee ({doctor.name})
              </Text>
              <Text
                style={[
                  typography.bodySm,
                  { color: colors.emeraldText, fontWeight: '600', marginTop: spacing.xxs },
                ]}
              >
                100% Covered by Blue Shield PPO
              </Text>
            </View>

            <View style={styles.priceColumn}>
              <Text style={[typography.bodySm, styles.strikethroughPrice, { color: colors.mutedText }]}>
                ₱180.00
              </Text>
              <Text style={[typography.labelMd, { color: colors.emeraldText, fontWeight: '700' }]}>
                ₱0.00
              </Text>
            </View>
          </View>

          {/* Fee 2 */}
          <View style={styles.costItemRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '600' }]}>
                Diagnostic 12-Lead ECG Screening
              </Text>
              <Text
                style={[
                  typography.bodySm,
                  { color: colors.emeraldText, fontWeight: '600', marginTop: spacing.xxs },
                ]}
              >
                In-Network Preventive Benefit
              </Text>
            </View>

            <View style={styles.priceColumn}>
              <Text style={[typography.bodySm, styles.strikethroughPrice, { color: colors.mutedText }]}>
                ₱180.00
              </Text>
              <Text style={[typography.labelMd, { color: colors.emeraldText, fontWeight: '700' }]}>
                ₱0.00
              </Text>
            </View>
          </View>

          {/* Total Patient Responsibility Box */}
          <View
            style={[
              styles.totalResponsibilityBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.base,
                marginTop: spacing.xs,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '700' }]}>
                Total Patient Responsibility
              </Text>
              <Text style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}>
                Due at clinic check-in on {format(selectedDate, 'MMM d')}
              </Text>
            </View>

            <Text
              style={[
                typography.headlineLg,
                { color: colors.primaryDeep, fontWeight: '800' },
              ]}
            >
              ₱0.00
            </Text>
          </View>
        </View>
      </View>

      {/* Clinic EZ Guarantees Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.lg,
          },
          elevation.card,
        ]}
      >
        <View style={styles.cardHeaderLeft}>
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: colors.mintBadgeBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="shieldCheck" size={18} color={colors.primaryDeep} />
          </View>
          <Text
            style={[
              typography.headlineMd,
              { color: colors.navyText, fontWeight: '700', marginLeft: spacing.sm },
            ]}
          >
            Clinic EZ Guarantees
          </Text>
        </View>

        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          {/* Guarantee 1 */}
          <View style={styles.guaranteeRow}>
            <AppIcon name="calendarCheck" size={18} color={colors.primaryDeep} />
            <Text style={[typography.bodySm, { color: colors.bodyText, marginLeft: spacing.sm, flex: 1 }]}>
              <Text style={{ fontWeight: '700', color: colors.navyText }}>Free cancellation </Text>
              up to 24 hours prior ({cancellationCutoff}) with zero cancellation fees.
            </Text>
          </View>

          {/* Guarantee 2 */}
          <View style={styles.guaranteeRow}>
            <AppIcon name="qrCode" size={18} color={colors.primaryDeep} />
            <Text style={[typography.bodySm, { color: colors.bodyText, marginLeft: spacing.sm, flex: 1 }]}>
              <Text style={{ fontWeight: '700', color: colors.navyText }}>Instant digital pass </Text>
              added automatically to your Clinic EZ Health Pass & Apple/Google Wallet.
            </Text>
          </View>

          {/* Guarantee 3: Interactive Reminders Checkbox */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sendReminders }}
            accessibilityLabel="SMS and Calendar reminders"
            onPress={() => setSendReminders(!sendReminders)}
            style={[
              styles.remindersBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.xs,
              },
            ]}
          >
            <AppIcon name="notifications" size={18} color={colors.primaryDeep} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelSm, { color: colors.navyText, fontWeight: '700' }]}>
                SMS & Calendar reminders
              </Text>
              <Text style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}>
                Sends updates 24h & 2h before consultation
              </Text>
            </View>

            <View
              style={[
                styles.checkbox,
                {
                  borderRadius: radii.xs,
                  backgroundColor: sendReminders ? colors.primaryDeep : colors.surface,
                  borderColor: sendReminders ? colors.primaryDeep : colors.border,
                },
              ]}
            >
              {sendReminders && (
                <AppIcon name="check" size={12} color={colors.onPrimary} strokeWidth={2.5} />
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {/* Sticky Bottom Confirmation Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            padding: spacing.base,
            marginTop: spacing.xl,
          },
          elevation.card,
        ]}
      >
        <View style={styles.bottomBarContentRow}>
          {/* Estimated Copay */}
          <View>
            <Text style={[typography.bodySm, { color: colors.mutedText }]}>Estimated Copay</Text>
            <Text
              style={[
                typography.headlineLg,
                { color: colors.navyText, fontWeight: '800', marginTop: spacing.xxs },
              ]}
            >
              ₱0.00
            </Text>
            <Text style={[typography.bodySm, { color: colors.mutedText }]}>due at visit</Text>
          </View>

          {/* Confirm Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm and book appointment"
            disabled={isSubmitting}
            onPress={() => onConfirmAndBook({ sendReminders })}
            style={({ pressed }) => [
              styles.confirmButton,
              {
                backgroundColor: colors.primaryDeep,
                borderRadius: radii.full,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                opacity: isSubmitting ? 0.7 : pressed ? 0.9 : 1,
              },
            ]}
          >
            <AppIcon name="lock" size={16} color={colors.onPrimary} />
            <Text
              style={[
                typography.labelLg,
                { color: colors.onPrimary, fontWeight: '700', marginLeft: spacing.xs },
              ]}
            >
              {isSubmitting ? 'Booking...' : 'Confirm & Book'}
            </Text>
            {!isSubmitting && (
              <View style={{ marginLeft: spacing.xs }}>
                <AppIcon name="arrowRight" size={16} color={colors.onPrimary} />
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  timerIconBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulsingDot: {
    width: 8,
    height: 8,
  },
  card: {
    width: '100%',
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBtn: {
    paddingVertical: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earlyArrivalBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
  },
  costItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  priceColumn: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  strikethroughPrice: {
    textDecorationLine: 'line-through',
  },
  totalResponsibilityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  remindersBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  bottomBar: {
    width: '100%',
    borderTopWidth: 1,
  },
  bottomBarContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const BookingReviewStep = memo(BookingReviewStepComponent);
export default BookingReviewStep;
