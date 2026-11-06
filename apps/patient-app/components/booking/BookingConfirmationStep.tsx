import React, { memo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppIcon } from '../ui/Icon';
import ClinicEzLogo from '../ui/ClinicEzLogo';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface BookingConfirmationStepProps {
  bookingReference: string;
  patientEmail?: string | null;
  doctorName: string;
  onViewAppointments: () => void;
  onBackToHome: () => void;
  onDone: () => void;
}

function BookingConfirmationStepComponent({
  bookingReference,
  patientEmail,
  doctorName,
  onViewAppointments,
  onBackToHome,
  onDone,
}: BookingConfirmationStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [hasCopied, setHasCopied] = useState(false);

  // Mask patient email for privacy: sarah.j***@email.com
  const maskedEmail = React.useMemo(() => {
    if (!patientEmail) return 'your registered email';
    const parts = patientEmail.split('@');
    if (parts.length < 2) return patientEmail;
    const name = parts[0] || '';
    const domain = parts[1] || '';
    const visibleLen = Math.min(name.length, 7);
    const prefix = name.slice(0, Math.min(visibleLen, 5));
    return `${prefix}***@${domain}`;
  }, [patientEmail]);

  const handleCopyReference = async () => {
    try {
      await Clipboard.setStringAsync(bookingReference);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar with Logo & Done */}
      <View style={styles.topBar}>
        <ClinicEzLogo size={32} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={onDone}
          style={({ pressed }) => [
            styles.doneBtn,
            {
              backgroundColor: colors.skySoftBg,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppIcon name="check" size={14} color={colors.primaryDeep} strokeWidth={2.5} />
          <Text
            style={[
              typography.labelMd,
              { color: colors.primaryDeep, fontWeight: '700', marginLeft: spacing.xxs + 2 },
            ]}
          >
            Done
          </Text>
        </Pressable>
      </View>

      {/* Success Hero Section */}
      <View style={[styles.heroSection, { marginTop: spacing.xxl }]}>
        {/* Large Checkmark Badge */}
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
              styles.innerBadgeCircle,
              {
                borderRadius: radii.full,
                backgroundColor: colors.primaryDeep,
              },
            ]}
          >
            <AppIcon name="check" size={32} color={colors.onPrimary} strokeWidth={3} />
          </View>
        </View>

        {/* Step 3 of 3 Completed Pill */}
        <View
          style={[
            styles.completedPill,
            {
              backgroundColor: colors.mintBadgeBg,
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
              { color: colors.primaryDeep, fontWeight: '700', letterSpacing: 0.5 },
            ]}
          >
            STEP 3 OF 3 • COMPLETED
          </Text>
        </View>

        {/* Headline & Subtitle */}
        <Text
          style={[
            typography.displayLg,
            {
              color: colors.navyText,
              fontWeight: '800',
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
              lineHeight: 22,
              marginTop: spacing.sm,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          Your consultation is officially scheduled. We&apos;ve sent a summary to{' '}
          <Text style={{ fontWeight: '700', color: colors.navyText }}>{maskedEmail}</Text> and via
          SMS.
        </Text>

        {/* Booking Reference Pill */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Booking reference ${bookingReference}, tap to copy`}
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
            <Text style={{ color: colors.primaryDeep, fontWeight: '800' }}>
              #{bookingReference}
            </Text>
          </Text>
          <View style={{ marginLeft: spacing.xs }}>
            <AppIcon
              name={hasCopied ? 'check' : 'copy'}
              size={14}
              color={colors.primaryDeep}
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
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.xxl,
          },
          elevation.card,
        ]}
      >
        <View style={styles.checklistHeaderRow}>
          <AppIcon name="checklist" size={18} color={colors.primaryDeep} />
          <Text
            style={[
              typography.headlineMd,
              { color: colors.navyText, fontWeight: '700', marginLeft: spacing.xs },
            ]}
          >
            Before Your Visit
          </Text>
        </View>

        <View style={{ marginTop: spacing.base, gap: spacing.md }}>
          {/* Item 1 */}
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
              <AppIcon name="checkCircle" size={18} color={colors.primaryDeep} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '700' }]}>
                Government Photo ID & Insurance Card
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                Required for front-desk identification and insurance verification.
              </Text>
            </View>
          </View>

          {/* Item 2 */}
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
              <AppIcon name="checkCircle" size={18} color={colors.primaryDeep} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '700' }]}>
                Current Prescription Bottles or List
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                Helps {doctorName} review dosage and check contraindications.
              </Text>
            </View>
          </View>

          {/* Item 3 */}
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
              <AppIcon name="info" size={18} color={colors.primaryDeep} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[typography.labelMd, { color: colors.navyText, fontWeight: '700' }]}>
                No Fasting Required
              </Text>
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
                You may have your normal meals and water prior to this consult.
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
              backgroundColor: colors.primaryDeep,
              borderRadius: radii.full,
              paddingVertical: spacing.md,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text
            style={[
              typography.labelLg,
              { color: colors.onPrimary, fontWeight: '700', marginRight: spacing.xs },
            ]}
          >
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
              paddingVertical: spacing.md,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              typography.labelLg,
              { color: colors.primaryDeep, fontWeight: '700' },
            ]}
          >
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    width: '100%',
  },
  outerBadgeCircle: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBadgeCircle: {
    width: 64,
    height: 64,
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
