import React, { memo } from 'react';
import {
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
  terminalName?: string | null;
  qrPayload: string;
  isCheckedIn?: boolean;
  readyTimeText?: string | null;
  onTapEnlarge?: () => void;
  onExpressCheckIn?: () => void;
  isCheckInLoading?: boolean;
}

function DigitalClinicPassCardComponent({
  passNumber,
  clinicName,
  terminalName,
  qrPayload,
  isCheckedIn = false,
  readyTimeText,
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
          borderColor: colors.borderSubtle,
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
                color: colors.mutedText,
              },
            ]}
          >
            DIGITAL CLINIC PASS
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
            {clinicName}
            {terminalName ? ` • ${terminalName}` : ''}
          </Text>
        </View>

        <View
          style={[
            styles.passIdBadge,
            {
              backgroundColor: colors.mintBadgeBg,
              borderRadius: radii.full,
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

      {/* QR Code Outer Well & Crisp Inner White Tile */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tap to enlarge for reception scanner"
        onPress={onTapEnlarge ?? (() => {})}
        style={[
          styles.qrWrapper,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.xl,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.base,
            marginTop: spacing.md,
          },
        ]}
      >
        <View
          style={[
            styles.qrInnerTile,
            elevation.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              padding: spacing.base,
            },
          ]}
        >
          <QrCodeView
            value={qrPayload}
            size={150}
            accessibilityLabel={`Clinic Pass QR code for ${passNumber}`}
          />
        </View>

        <View style={[styles.enlargeRow, { marginTop: spacing.md }]}>
          <AppIcon name="maximize" size={14} color={colors.primary} />
          <Text
            style={[
              typography.bodySmMedium,
              {
                color: colors.mutedText,
                marginLeft: 6,
              },
            ]}
          >
            Tap to enlarge for reception scanner
          </Text>
        </View>
      </Pressable>

      {/* Touchless Check-in Note */}
      <View
        style={[
          styles.nfcNoteBox,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.lg,
            padding: spacing.md,
            marginTop: spacing.md,
          },
        ]}
      >
        <View style={styles.nfcIconWrap}>
          <AppIcon name="nfc" size={18} color={colors.primary} />
        </View>
        <Text
          style={[
            typography.bodySm,
            {
              color: colors.bodyText,
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
        accessibilityLabel={
          isCheckedIn
            ? 'Checked in successfully'
            : readyTimeText
              ? `Express Check-In, ${readyTimeText}`
              : 'Express Check-In'
        }
        disabled={isCheckedIn || isCheckInLoading}
        onPress={onExpressCheckIn}
        style={({ pressed }) => [
          styles.checkInBtn,
          {
            backgroundColor: isCheckedIn ? colors.mintSoftBg : colors.primary,
            borderRadius: radii.full,
            borderColor: isCheckedIn ? colors.mintBadgeBorder : 'transparent',
            borderWidth: isCheckedIn ? 1 : 0,
            paddingVertical: spacing.md,
            marginTop: spacing.md,
            opacity: pressed && !isCheckedIn ? 0.9 : 1,
          },
        ]}
      >
        <AppIcon
          name={isCheckedIn ? 'checkCircle' : 'idCard'}
          size={18}
          color={isCheckedIn ? colors.primaryDeep : colors.onPrimary}
        />
        <Text
          style={[
            typography.labelBold,
            {
              color: isCheckedIn ? colors.primaryDeep : colors.onPrimary,
              marginLeft: 6,
            },
          ]}
        >
          {isCheckedIn
            ? 'Checked In'
            : isCheckInLoading
              ? 'Checking In...'
              : readyTimeText
                ? `Express Check-In (${readyTimeText})`
                : 'Express Check-In'}
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
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrInnerTile: {
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
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
