import React, { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { ConsultationMode } from './BookingSlotStep';

export interface BookingConfirmationStepProps {
  bookingReference: string;
  patientEmail?: string | null;
  doctorName: string;
  consultationMode?: ConsultationMode;
  onViewAppointments: () => void;
  onBackToHome: () => void;
}

function BookingConfirmationStepComponent({
  bookingReference,
  patientEmail,
  doctorName,
  consultationMode = 'in_person',
  onViewAppointments,
  onBackToHome,
}: BookingConfirmationStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [hasCopied, setHasCopied] = useState(false);

  const maskedEmail = useMemo(() => {
    if (!patientEmail) return 'your registered email';
    const parts = patientEmail.split('@');
    if (parts.length < 2) return patientEmail;
    const name = parts[0] || '';
    const domain = parts[1] || '';
    const prefix = name.slice(0, Math.min(name.length, 5));
    return `${prefix}***@${domain}`;
  }, [patientEmail]);

  const handleCopyReference = async () => {
    try {
      await Clipboard.setStringAsync(bookingReference);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // Clipboard may be restricted in some environments
    }
  };

  return (
    <View style={styles.container}>
      {/* Success Hero Section */}
      <View style={[styles.heroSection, { marginTop: spacing.lg }]}>
        <View
          style={[
            styles.outerBadgeCircle,
            {
              borderRadius: radii.full,
              backgroundColor: colors.mintSoftBg,
            },
          ]}
        >
          <View
            style={[
              styles.middleBadgeCircle,
              {
                borderRadius: radii.full,
                backgroundColor: colors.mintBadgeBg,
              },
            ]}
          >
            <View
              style={[
                styles.innerBadgeCircle,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.primary,
                },
              ]}
            >
              <AppIcon name="check" size={30} color={colors.onPrimary} strokeWidth={3} />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.completedPill,
            {
              backgroundColor: colors.mintAvatarBg,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              marginTop: spacing.lg,
            },
          ]}
        >
          <Text
            style={[
              typography.labelSm,
              { color: colors.mintAvatarText, fontWeight: '700', letterSpacing: 0.5 },
            ]}
          >
            STEP 3 OF 3 • COMPLETED
          </Text>
        </View>

        <Text
          style={[
            typography.headlineLg,
            {
              color: colors.navyText,
              textAlign: 'center',
              marginTop: spacing.md,
            },
          ]}
        >
          Appointment Confirmed!
        </Text>

        <Text
          style={[
            typography.bodyMd,
            {
              color: colors.bodyText,
              textAlign: 'center',
              marginTop: spacing.sm,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          Your consultation is officially scheduled. We&apos;ve sent a summary to{' '}
          <Text style={{ fontWeight: '700', color: colors.navyText }}>{maskedEmail}</Text>{' '}
          and via SMS.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Booking Ref ${bookingReference}, tap to copy`}
          onPress={handleCopyReference}
          style={({ pressed }) => [
            styles.bookingRefPill,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm + 2,
              marginTop: spacing.lg,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[typography.labelMd, { color: colors.bodyText }]}>
            Booking Ref{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>
              #{bookingReference}
            </Text>
          </Text>
          <View style={{ marginLeft: spacing.xs }}>
            <AppIcon
              name={hasCopied ? 'check' : 'copy'}
              size={14}
              color={colors.primary}
            />
          </View>
        </Pressable>
      </View>

      {/* Before Your Visit Checklist Card */}
      <View
        style={[
          styles.checklistCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.xxl,
          },
          elevation.card,
        ]}
      >
        <View style={styles.checklistHeaderRow}>
          <AppIcon name="checklist" size={18} color={colors.primary} />
          <Text
            style={[
              typography.cardTitle,
              { color: colors.navyText, marginLeft: spacing.xs },
            ]}
          >
            {consultationMode === 'telehealth' ? 'Before Your Virtual Visit' : 'Before Your Visit'}
          </Text>
        </View>

        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          <View
            style={[
              styles.checklistItem,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
              },
            ]}
          >
            <View style={styles.itemIconWrap}>
              <AppIcon name="checkCircle" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelBold, { color: colors.navyText }]}>
                {consultationMode === 'telehealth'
                  ? 'Camera & Microphone Check'
                  : 'Government Photo ID & Insurance Card'}
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                {consultationMode === 'telehealth'
                  ? 'Join your virtual waiting room 10 minutes early to test audio and video.'
                  : 'Required for front-desk identification and insurance verification.'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.checklistItem,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
              },
            ]}
          >
            <View style={styles.itemIconWrap}>
              <AppIcon name="checkCircle" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelBold, { color: colors.navyText }]}>
                {consultationMode === 'telehealth'
                  ? 'Quiet, Well-Lit Space'
                  : 'Current Prescription Bottles or List'}
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                {consultationMode === 'telehealth'
                  ? 'Ensure a private location with a stable internet connection for your consult.'
                  : `Helps ${doctorName} review dosage and check contraindications.`}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.checklistItem,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
              },
            ]}
          >
            <View style={styles.itemIconWrap}>
              <AppIcon name="info" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelBold, { color: colors.navyText }]}>
                {consultationMode === 'telehealth'
                  ? 'Current Medication List'
                  : 'No Fasting Required'}
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                {consultationMode === 'telehealth'
                  ? `Have your medications and questions ready so ${doctorName} can review them smoothly.`
                  : 'You may have your normal meals and water prior to this consult.'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Primary Action Buttons */}
      <View style={[styles.actionsSection, { marginTop: spacing.xxl, gap: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View in My Appointments"
          onPress={onViewAppointments}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              borderRadius: radii.full,
              paddingVertical: spacing.md + 2,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[typography.labelLg, { color: colors.onPrimary, marginRight: spacing.xs }]}>
            View in My Appointments
          </Text>
          <AppIcon name="arrowRight" size={18} color={colors.onPrimary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          onPress={onBackToHome}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.full,
              paddingVertical: spacing.md + 2,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[typography.labelLg, { color: colors.primary }]}>
            Back to Home
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  heroSection: {
    alignItems: 'center',
    width: '100%',
  },
  outerBadgeCircle: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleBadgeCircle: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBadgeCircle: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingRefPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistCard: {
    width: '100%',
    borderWidth: 1,
  },
  checklistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  itemIconWrap: {
    marginTop: 2,
  },
  actionsSection: {
    width: '100%',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

export const BookingConfirmationStep = memo(BookingConfirmationStepComponent);
export default BookingConfirmationStep;
