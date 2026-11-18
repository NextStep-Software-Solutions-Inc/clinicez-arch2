import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { DirectoryDoctorDto } from '../../services/api/homeApi';
import type { BookingStep } from './BookingStepIndicator';

export interface BookingStickyFooterProps {
  currentStep: BookingStep;
  selectedDoctor?: DirectoryDoctorDto | null;
  isBookingPaused?: boolean;
  selectedSlotSummary?: string | null;
  formattedCopay?: string;
  isSubmitting?: boolean;
  bottomInset?: number;
  maxContentWidth?: number;
  horizontalPadding?: number;
  onProceedStep1: () => void;
  onProceedStep2: () => void;
  onConfirmAndBook: () => void;
}

/**
 * Fixed bottom confirmation bar pinned outside the scroll view for Steps 1–3.
 */
function BookingStickyFooterComponent({
  currentStep,
  selectedDoctor,
  isBookingPaused = false,
  selectedSlotSummary,
  formattedCopay = '₱0.00',
  isSubmitting = false,
  bottomInset = 0,
  maxContentWidth,
  horizontalPadding,
  onProceedStep1,
  onProceedStep2,
  onConfirmAndBook,
}: BookingStickyFooterProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();
  const bookingPaused = Boolean(
    isBookingPaused || (selectedDoctor && !selectedDoctor.clinicSupportsAppointments),
  );

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingHorizontal: horizontalPadding ?? spacing.base,
          paddingTop: spacing.md,
          paddingBottom: Math.max(bottomInset, spacing.md),
        },
      ]}
    >
      <View
        style={[
          styles.innerContainer,
          maxContentWidth ? { maxWidth: maxContentWidth, alignSelf: 'center' } : null,
        ]}
      >
        {currentStep === 1 ? (
          <>
            <Text style={[typography.overline, { color: colors.mutedText }]}>
              SELECTED CONSULTATION
            </Text>
            <Text
              style={[
                typography.labelBold,
                { color: colors.navyText, marginTop: spacing.xxs },
              ]}
              numberOfLines={1}
            >
              {selectedDoctor
                ? `${selectedDoctor.name} • ${selectedDoctor.specialty}`
                : 'Select a provider to continue'}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                bookingPaused && selectedDoctor
                  ? 'Booking paused for selected clinic'
                  : 'Proceed to choose slot'
              }
              accessibilityState={{ disabled: !selectedDoctor || bookingPaused }}
              disabled={!selectedDoctor || bookingPaused}
              onPress={() => {
                if (!selectedDoctor || bookingPaused) return;
                onProceedStep1();
              }}
              style={({ pressed }) => [
                styles.fullCtaButton,
                {
                  backgroundColor:
                    selectedDoctor && !bookingPaused ? colors.primary : colors.border,
                  borderRadius: radii.full,
                  paddingVertical: spacing.md + 2,
                  marginTop: spacing.md,
                  opacity: pressed && selectedDoctor && !bookingPaused ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelLg,
                  {
                    color:
                      selectedDoctor && !bookingPaused ? colors.onPrimary : colors.mutedText,
                    marginRight: spacing.xs,
                  },
                ]}
              >
                {bookingPaused && selectedDoctor ? 'Booking Paused' : 'Proceed to Choose Slot'}
              </Text>
              <AppIcon
                name={bookingPaused && selectedDoctor ? 'alert' : 'arrowRight'}
                size={18}
                color={selectedDoctor && !bookingPaused ? colors.onPrimary : colors.mutedText}
              />
            </Pressable>
          </>
        ) : currentStep === 2 ? (
          <>
            <Text style={[typography.overline, { color: colors.mutedText }]}>
              SELECTED APPOINTMENT SLOT
            </Text>
            <Text
              style={[
                typography.labelBold,
                { color: colors.navyText, marginTop: spacing.xxs },
              ]}
              numberOfLines={1}
            >
              {bookingPaused
                ? 'Online booking paused for this clinic'
                : selectedSlotSummary ?? 'Select an available time slot'}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                bookingPaused
                  ? 'Booking paused for selected clinic'
                  : 'Continue to review and confirm'
              }
              accessibilityState={{ disabled: !selectedSlotSummary || bookingPaused }}
              disabled={!selectedSlotSummary || bookingPaused}
              onPress={() => {
                if (!selectedSlotSummary || bookingPaused) return;
                onProceedStep2();
              }}
              style={({ pressed }) => [
                styles.fullCtaButton,
                {
                  backgroundColor:
                    selectedSlotSummary && !bookingPaused ? colors.primary : colors.border,
                  borderRadius: radii.full,
                  paddingVertical: spacing.md + 2,
                  marginTop: spacing.md,
                  opacity: pressed && selectedSlotSummary && !bookingPaused ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelLg,
                  {
                    color:
                      selectedSlotSummary && !bookingPaused
                        ? colors.onPrimary
                        : colors.mutedText,
                    marginRight: spacing.xs,
                  },
                ]}
              >
                {bookingPaused ? 'Booking Paused' : 'Continue to Review &amp; Confirm'}
              </Text>
              <AppIcon
                name={bookingPaused ? 'alert' : 'arrowRight'}
                size={18}
                color={
                  selectedSlotSummary && !bookingPaused ? colors.onPrimary : colors.mutedText
                }
              />
            </Pressable>
          </>
        ) : (
          <View style={styles.confirmRow}>
            <View>
              <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                Estimated Copay
              </Text>
              <Text
                style={[
                  typography.numericMetricCompact,
                  { color: colors.navyText, marginTop: spacing.xxs },
                ]}
              >
                {formattedCopay}
              </Text>
              <Text style={[typography.labelSm, { color: colors.primary }]}>
                due at visit
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                bookingPaused ? 'Booking paused for selected clinic' : 'Confirm and book appointment'
              }
              accessibilityState={{ disabled: isSubmitting || bookingPaused }}
              disabled={isSubmitting || bookingPaused}
              onPress={() => {
                if (isSubmitting || bookingPaused) return;
                onConfirmAndBook();
              }}
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  backgroundColor: bookingPaused ? colors.border : colors.primary,
                  borderRadius: radii.full,
                  paddingVertical: spacing.md + 2,
                  paddingHorizontal: spacing.lg,
                  marginLeft: spacing.lg,
                  opacity: bookingPaused ? 0.75 : isSubmitting ? 0.7 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon
                name={bookingPaused ? 'alert' : 'lock'}
                size={16}
                color={bookingPaused ? colors.mutedText : colors.onPrimary}
              />
              <Text
                style={[
                  typography.labelLg,
                  {
                    color: bookingPaused ? colors.mutedText : colors.onPrimary,
                    marginLeft: spacing.xs,
                  },
                ]}
              >
                {bookingPaused
                  ? 'Booking Paused'
                  : isSubmitting
                    ? 'Booking...'
                    : 'Confirm & Book'}
              </Text>
              {!isSubmitting && !bookingPaused ? (
                <View style={{ marginLeft: spacing.xs }}>
                  <AppIcon name="arrowRight" size={16} color={colors.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  innerContainer: {
    width: '100%',
  },
  fullCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const BookingStickyFooter = memo(BookingStickyFooterComponent);
export default BookingStickyFooter;
