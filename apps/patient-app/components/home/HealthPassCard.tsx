import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { PatientHealthPassDto } from '../../services/api/homeApi';

export interface HealthPassCardProps {
  healthPass: PatientHealthPassDto;
  onViewCardPress: () => void;
}

function HealthPassCardComponent({ healthPass, onViewCardPress }: HealthPassCardProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <LinearGradient
      colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        elevation.interactive,
        {
          borderRadius: radii.xl,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <View style={[styles.topRow, { gap: spacing.md }]}>
        <View
          style={[
            styles.waveBadge,
            {
              backgroundColor: colors.glassWaveBg,
              borderRadius: radii.md,
            },
          ]}
        >
          <AppIcon name="nfc" size={18} color={colors.onPrimary} />
        </View>
        <View style={styles.brandStack}>
          <Text style={[typography.overline, { color: colors.healthPassMuted }]}>
            CLINIC EZ •
          </Text>
          <Text style={[typography.overline, { color: colors.onPrimary }]}>
            HEALTH PASS
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text
          numberOfLines={1}
          style={[typography.headlineMd, { color: colors.onPrimary }]}
        >
          {healthPass.fullName}
        </Text>

        <View style={[styles.pillsRow, { gap: spacing.sm }]}>
          <View
            style={[
              styles.idPill,
              {
                backgroundColor: colors.onPrimary,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <Text style={[typography.labelSm, { color: colors.primaryDeep }]}>
              {healthPass.clinicEzId}
            </Text>
          </View>

          <View
            style={[
              styles.bloodPill,
              {
                backgroundColor: colors.glassPillBg,
                borderColor: colors.glassPillBorder,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                gap: spacing.xs,
              },
            ]}
          >
            <AppIcon name="droplet" size={12} color={colors.mintAvatarBg} />
            <Text style={[typography.labelSm, { color: colors.healthPassMuted }]}>
              Blood Group:{' '}
              <Text style={[typography.labelSm, { color: colors.mintAvatarBg }]}>
                {healthPass.bloodGroupDisplay ?? 'Unset'}
              </Text>
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.bottomRow,
          {
            marginTop: spacing.xs,
            gap: spacing.sm,
          },
        ]}
      >
        <View style={[styles.terminalHint, { gap: spacing.xs }]}>
          <AppIcon name="scanBarcode" size={15} color={colors.healthPassMuted} />
          <Text
            numberOfLines={1}
            style={[typography.bodySm, styles.hintText, { color: colors.healthPassMuted }]}
          >
            Tap terminal or present barcode
          </Text>
        </View>

        <Pressable
          onPress={onViewCardPress}
          accessibilityRole="button"
          accessibilityLabel="View Health Pass Card"
          style={({ pressed }) => [
            styles.viewCardBtn,
            {
              backgroundColor: colors.onPrimary,
              borderRadius: radii.full,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.sm,
              gap: spacing.xs,
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <Text style={[typography.labelMd, { color: colors.primary }]}>View Card</Text>
          <AppIcon name="forward" size={14} color={colors.primary} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waveBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandStack: {
    justifyContent: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  idPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  terminalHint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  hintText: {
    flex: 1,
  },
  viewCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
});

export const HealthPassCard = memo(HealthPassCardComponent);
export default HealthPassCard;
