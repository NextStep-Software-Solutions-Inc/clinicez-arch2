import React, { memo, useState, useEffect, useMemo } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { format, subDays } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type {
  DirectoryClinicDto,
  DirectoryDoctorDto,
  DirectoryServiceDto,
} from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';
import type { ConsultationMode } from './BookingSlotStep';

export interface BookingReviewStepProps {
  doctor: DirectoryDoctorDto;
  clinic?: DirectoryClinicDto | null;
  service?: DirectoryServiceDto | null;
  isBookingPaused?: boolean;
  selectedDate: Date;
  selectedSlot: AvailableSlot;
  consultationMode: ConsultationMode;
  reasonForVisit: string;
  onChangeReasonForVisit: (value: string) => void;
  sendReminders: boolean;
  onToggleSendReminders: () => void;
  onChangeTimeOrMode: () => void;
}

function shiftSlotTime(rawTime: string | undefined, deltaMinutes: number): string {
  const parts = (rawTime || '10:30').split(':');
  const hour = parseInt(parts[0] || '10', 10);
  const min = parseInt(parts[1] || '30', 10);
  if (Number.isNaN(hour) || Number.isNaN(min)) return rawTime || '';
  const totalMinutes = (hour * 60 + min + deltaMinutes + 24 * 60) % (24 * 60);
  const nextHour24 = Math.floor(totalMinutes / 60);
  const nextMin = totalMinutes % 60;
  const period = nextHour24 >= 12 ? 'PM' : 'AM';
  const displayHour = nextHour24 > 12 ? nextHour24 - 12 : nextHour24 === 0 ? 12 : nextHour24;
  return `${displayHour}:${nextMin < 10 ? '0' : ''}${nextMin} ${period}`;
}

function BookingReviewStepComponent({
  doctor,
  clinic,
  service,
  isBookingPaused = false,
  selectedDate,
  selectedSlot,
  consultationMode,
  reasonForVisit,
  onChangeReasonForVisit,
  sendReminders,
  onToggleSendReminders,
  onChangeTimeOrMode,
}: BookingReviewStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15 * 60);
  const bookingPaused = Boolean(
    isBookingPaused || (clinic ? !clinic.supportsAppointments : !doctor.clinicSupportsAppointments),
  );

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

  const cancellationCutoff = useMemo(() => {
    const prevDay = subDays(selectedDate, 1);
    return `${format(prevDay, 'EEEE, MMM d')} at ${selectedSlot.displayTime || selectedSlot.time}`;
  }, [selectedDate, selectedSlot]);

  const earlyArrivalTime = useMemo(
    () => shiftSlotTime(selectedSlot.time, -10),
    [selectedSlot.time],
  );

  const durationMinutes =
    service?.durationMinutes && service.durationMinutes > 0
      ? service.durationMinutes
      : 30;

  const endTime = useMemo(
    () => shiftSlotTime(selectedSlot.time, durationMinutes),
    [selectedSlot.time, durationMinutes],
  );

  const facilityName = clinic?.name || doctor.clinicName;
  const facilityAddress = clinic?.address || doctor.clinicAddress || '';
  const hasMapTarget = Boolean(facilityAddress || facilityName);

  const handleGetDirections = () => {
    if (!hasMapTarget) return;
    const encoded = encodeURIComponent(
      [facilityName, facilityAddress].filter(Boolean).join(', '),
    );
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const unitPrice = typeof service?.price === 'number' && service.price > 0 ? service.price : 0;
  const formattedPrice = `₱${unitPrice.toFixed(2)}`;
  const costDescription =
    service?.priceBadgeLabel ||
    (unitPrice === 0 ? 'No upfront booking charge' : 'Payable at clinic reception');

  return (
    <View style={styles.container}>
      {bookingPaused ? (
        <View
          style={[
            styles.pausedBanner,
            {
              backgroundColor: colors.amberSoftBg,
              borderRadius: radii.xl,
              padding: spacing.base,
              marginBottom: spacing.md,
              gap: spacing.sm,
            },
          ]}
        >
          <AppIcon name="alert" size={18} color={colors.amberText} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.labelBold, { color: colors.amberText }]}>
              Booking Paused
            </Text>
            <Text style={[typography.bodySm, { color: colors.navyText, marginTop: spacing.xxs }]}>
              Online booking is currently paused for {facilityName}. Choose another clinic or check back later.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Live Reservation Countdown Banner */}
      <View
        style={[
          styles.countdownBanner,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.xl,
            padding: spacing.base,
          },
        ]}
      >
        <View
          style={[
            styles.timerIconBadge,
            {
              backgroundColor: colors.mintAvatarBg,
              borderRadius: radii.full,
            },
          ]}
        >
          <AppIcon name="shieldCheck" size={18} color={colors.mintAvatarText} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[typography.labelBold, { color: colors.navyText }]}>
            Slot reserved for {formattedCountdown} min
          </Text>
          <Text
            style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}
            numberOfLines={1}
          >
            {consultationMode === 'telehealth'
              ? 'No charges until your consultation session begins.'
              : 'No charges until your visit at the clinic reception.'}
          </Text>
        </View>

        <View
          style={[
            styles.statusDot,
            {
              borderRadius: radii.full,
              backgroundColor: colors.primary,
              marginLeft: spacing.sm,
            },
          ]}
        />
      </View>

      {/* Time & Consultation Mode Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
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
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="calendarCheck" size={18} color={colors.primary} />
            </View>
            <Text
              style={[
                typography.cardTitle,
                { color: colors.navyText, marginLeft: spacing.sm, flexShrink: 1 },
              ]}
              numberOfLines={1}
            >
              Time &amp; Consultation Mode
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change time or consultation mode"
            onPress={onChangeTimeOrMode}
            style={({ pressed }) => [
              styles.changeBtn,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs + 1,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[typography.labelSm, { color: colors.primary }]}>Change</Text>
          </Pressable>
        </View>

        {/* Date & Time Row */}
        <View style={[styles.timeRow, { marginTop: spacing.base }]}>
          <View
            style={[
              styles.subIconBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.md,
              },
            ]}
          >
            <AppIcon name="calendar" size={16} color={colors.primary} />
          </View>

          <View style={{ marginLeft: spacing.sm }}>
            <Text style={[typography.cardTitle, { color: colors.navyText }]}>
              {format(selectedDate, 'EEEE, MMM d, yyyy')}
            </Text>
            <Text
              style={[typography.bodyMd, { color: colors.bodyText, marginTop: spacing.xxs }]}
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
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.lg,
              padding: spacing.md,
              marginTop: spacing.md,
            },
          ]}
        >
          <AppIcon name="clock" size={16} color={colors.primary} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text style={[typography.labelMd, { color: colors.navyText }]}>
              {consultationMode === 'telehealth'
                ? `Join 10 minutes early (${earlyArrivalTime})`
                : `Arrive 10 minutes early (${earlyArrivalTime})`}
            </Text>
            <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
              {consultationMode === 'telehealth'
                ? 'Allows time to verify your camera, microphone, and connection.'
                : 'Allows reception team to process vitals & intake check-in smoothly.'}
            </Text>
          </View>
        </View>

        {/* Location / Mode Row */}
        <View style={[styles.locationRow, { marginTop: spacing.base }]}>
          <AppIcon
            name={consultationMode === 'telehealth' ? 'video' : 'location'}
            size={16}
            color={colors.mutedText}
          />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text style={[typography.labelMd, { color: colors.navyText }]} numberOfLines={1}>
              {consultationMode === 'telehealth'
                ? 'Telehealth Video Consultation'
                : facilityAddress || facilityName}
            </Text>
            <Text
              style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}
              numberOfLines={1}
            >
              {consultationMode === 'telehealth'
                ? facilityName
                : facilityAddress
                  ? facilityName
                  : 'In-Person Clinic Visit'}
            </Text>
          </View>

          {consultationMode === 'in_person' && hasMapTarget ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Get directions in Google Maps"
              onPress={handleGetDirections}
              style={styles.directionsBtn}
            >
              <Text
                style={[
                  typography.labelSm,
                  { color: colors.primary, marginRight: spacing.xxs },
                ]}
              >
                Get Directions
              </Text>
              <AppIcon name="externalLink" size={12} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Reason for Visit Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.lg,
          },
          elevation.card,
        ]}
      >
        <Text style={[typography.overline, { color: colors.mutedText }]}>
          REASON FOR VISIT
        </Text>
        <TextInput
          value={reasonForVisit}
          onChangeText={onChangeReasonForVisit}
          placeholder="Describe your reason for this consultation..."
          placeholderTextColor={colors.mutedText}
          multiline
          accessibilityLabel="Reason for visit"
          style={[
            typography.bodyMedium,
            styles.reasonInput,
            {
              color: colors.navyText,
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              marginTop: spacing.sm,
            },
          ]}
        />
      </View>

      {/* Estimated Cost Breakdown Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
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
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="document" size={18} color={colors.primary} />
          </View>
          <Text
            style={[
              typography.cardTitle,
              { color: colors.navyText, marginLeft: spacing.sm },
            ]}
          >
            Estimated Cost Breakdown
          </Text>
        </View>

        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          <View style={styles.costItemRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.labelBold, { color: colors.navyText }]}>
                {service?.name
                  ? `${service.name} (${doctor.name})`
                  : `Consultation (${doctor.name})`}
              </Text>
              <Text
                style={[
                  typography.bodySm,
                  { color: colors.emeraldText, marginTop: spacing.xxs },
                ]}
              >
                {costDescription}
              </Text>
            </View>

            <View style={styles.priceColumn}>
              <Text
                style={[
                  typography.labelBold,
                  { color: unitPrice === 0 ? colors.emeraldText : colors.navyText },
                ]}
              >
                {formattedPrice}
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
              <Text style={[typography.labelBold, { color: colors.navyText }]}>
                Total Patient Responsibility
              </Text>
              <Text
                style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}
              >
                Due at clinic check-in on {format(selectedDate, 'MMM d')}
              </Text>
            </View>

            <Text style={[typography.headlineMd, { color: colors.primary }]}>
              {formattedPrice}
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
            borderColor: colors.borderSubtle,
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
                backgroundColor: colors.mintAvatarBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="shieldCheck" size={18} color={colors.mintAvatarText} />
          </View>
          <Text
            style={[
              typography.cardTitle,
              { color: colors.navyText, marginLeft: spacing.sm },
            ]}
          >
            Clinic EZ Guarantees
          </Text>
        </View>

        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          <View style={styles.guaranteeRow}>
            <AppIcon name="calendarCheck" size={18} color={colors.primary} />
            <Text style={[typography.bodySm, { color: colors.bodyText, marginLeft: spacing.sm, flex: 1 }]}>
              <Text style={{ fontWeight: '700', color: colors.navyText }}>Free cancellation </Text>
              up to 24 hours prior ({cancellationCutoff}) with zero cancellation fees.
            </Text>
          </View>

          <View style={styles.guaranteeRow}>
            <AppIcon name="qrCode" size={18} color={colors.primary} />
            <Text style={[typography.bodySm, { color: colors.bodyText, marginLeft: spacing.sm, flex: 1 }]}>
              <Text style={{ fontWeight: '700', color: colors.navyText }}>Instant digital pass </Text>
              added automatically to your Clinic EZ Health Pass &amp; Apple/Google Wallet.
            </Text>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sendReminders }}
            accessibilityLabel="SMS and Calendar reminders"
            onPress={onToggleSendReminders}
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
            <AppIcon name="notifications" size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelSm, { color: colors.navyText }]}>
                SMS &amp; Calendar reminders
              </Text>
              <Text
                style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xxs }]}
              >
                Sends updates 24h &amp; 2h before consultation
              </Text>
            </View>

            <View
              style={[
                styles.checkbox,
                {
                  borderRadius: radii.xs,
                  backgroundColor: sendReminders ? colors.primary : colors.surface,
                  borderColor: sendReminders ? colors.primary : colors.border,
                },
              ]}
            >
              {sendReminders ? (
                <AppIcon name="check" size={12} color={colors.onPrimary} strokeWidth={2.5} />
              ) : null}
            </View>
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
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerIconBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
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
    paddingRight: 8,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subIconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBtn: {},
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
  reasonInput: {
    minHeight: 48,
    textAlignVertical: 'top',
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
});

export const BookingReviewStep = memo(BookingReviewStepComponent);
export default BookingReviewStep;
