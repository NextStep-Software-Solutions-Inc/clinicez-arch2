import React, { memo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import QrCodeView from '../sharing/QrCodeView';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface DigitalClinicPassCardProps {
  passNumber: string;
  clinicName: string;
  terminalName?: string;
  qrPayload: string;
  isCheckedIn?: boolean;
  readyTimeText?: string;
  onTapEnlarge?: () => void;
  onExpressCheckIn?: () => void;
  isCheckInLoading?: boolean;
}

function DigitalClinicPassCardComponent({
  passNumber,
  clinicName,
  terminalName = 'Bay Terminal',
  qrPayload,
  isCheckedIn = false,
  readyTimeText = 'Ready at 10:15 AM',
  onTapEnlarge,
  onExpressCheckIn,
  isCheckInLoading = false,
}: DigitalClinicPassCardProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.xxl,
          padding: spacing.base,
        },
        elevation.card,
      ]}
    >
      {/* Top Header Row: Category & Pass ID */}
      <View style={styles.topRow}>
        <View style={styles.titleColumn}>
          <Text
            style={[
              typography.overline,
              {
                color: colors.primaryDeep,
                letterSpacing: 0.9,
                fontWeight: '700',
              },
            ]}
          >
            Digital Clinic Pass
          </Text>
          <Text
            style={[
              typography.headlineSm,
              {
                color: colors.navyText,
                fontWeight: '700',
                marginTop: 2,
              },
            ]}
          >
            Express Kiosk Pass
          </Text>
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
            {clinicName} • {terminalName}
          </Text>
        </View>

        <View
          style={[
            styles.passIdBadge,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
              borderColor: colors.border,
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
            {passNumber}
          </Text>
        </View>
      </View>

      {/* QR Code Container */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tap to enlarge reception scanner QR code"
        onPress={onTapEnlarge}
        style={[
          styles.qrWrapper,
          {
            backgroundColor: colors.mintSoftBg,
            borderRadius: radii.xl,
            paddingVertical: spacing.lg,
            marginTop: spacing.md,
          },
        ]}
      >
        <QrCodeView value={qrPayload} size={150} accessibilityLabel={`Clinic Pass QR code for ${passNumber}`} />
        <View style={[styles.enlargeRow, { marginTop: spacing.sm }]}>
          <AppIcon name="fullscreen" size={14} color={colors.primaryDeep} />
          <Text
            style={[
              typography.bodySmMedium,
              {
                color: colors.primaryDeep,
                fontWeight: '600',
                marginLeft: 4,
              },
            ]}
          >
            Tap to enlarge for reception scanner
          </Text>
        </View>
      </Pressable>

      {/* Touchless Check-in NFC Note */}
      <View
        style={[
          styles.nfcNoteBox,
          {
            backgroundColor: colors.mintSoftBg,
            borderRadius: radii.lg,
            padding: spacing.md,
            marginTop: spacing.md,
          },
        ]}
      >
        <View style={styles.nfcIconWrap}>
          <AppIcon name="nfc" size={18} color={colors.primaryDeep} />
        </View>
        <Text
          style={[
            typography.bodySm,
            {
              color: colors.mutedText,
              marginLeft: spacing.sm,
              flex: 1,
              lineHeight: 18,
            },
          ]}
        >
          Touchless Check-in: Present directly at clinic reception kiosk or tablet for priority queuing.
        </Text>
      </View>

      {/* Express Check-In Action Button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isCheckedIn ? 'Checked in successfully' : `Express Check-In, ${readyTimeText}`}
        disabled={isCheckedIn || isCheckInLoading}
        onPress={onExpressCheckIn}
        style={({ pressed }) => [
          styles.checkInBtn,
          {
            backgroundColor: isCheckedIn ? colors.mintSoftBg : colors.primaryDeep,
            borderRadius: radii.full,
            borderColor: isCheckedIn ? colors.border : 'transparent',
            borderWidth: isCheckedIn ? 1 : 0,
            paddingVertical: spacing.md,
            marginTop: spacing.md,
            opacity: pressed && !isCheckedIn ? 0.9 : 1,
          },
        ]}
      >
        <AppIcon
          name={isCheckedIn ? 'checkCircle' : 'badge'}
          size={18}
          color={isCheckedIn ? colors.primaryDeep : colors.onPrimary}
        />
        <Text
          style={[
            typography.labelBold,
            {
              color: isCheckedIn ? colors.primaryDeep : colors.onPrimary,
              fontWeight: '700',
              marginLeft: 6,
            },
          ]}
        >
          {isCheckedIn
            ? 'Checked In'
            : isCheckInLoading
            ? 'Checking In...'
            : `Express Check-In (${readyTimeText})`}
        </Text>
      </Pressable>
    </View>
  );
}

export const DigitalClinicPassCard = memo(DigitalClinicPassCardComponent);
export default DigitalClinicPassCard;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    paddingRight: 12,
  },
  passIdBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  enlargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nfcNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nfcIconWrap: {
    paddingTop: 1,
  },
  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
