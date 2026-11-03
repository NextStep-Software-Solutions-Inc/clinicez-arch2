import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface HealthPassCardProps {
  patientFullName: string;
  patientIdCode: string;
  bloodGroup?: string | null;
  onOpenQrModal: () => void;
}

export default function HealthPassCard({
  patientFullName,
  patientIdCode,
  bloodGroup = 'A+',
  onOpenQrModal,
}: HealthPassCardProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        {
          borderRadius: radii.xl,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        shadows.md,
      ]}
    >
      {/* Top Bar: Contactless & Verified Shield */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.sm,
                padding: spacing.xs,
              },
            ]}
          >
            <AppIcon name="activity" size={sizes.iconSm} color="primary" />
          </View>
          <ThemedText variant="captionBold" color="onPrimary" style={styles.trackingWide}>
            CLINIC EZ • HEALTH PASS
          </ThemedText>
        </View>
        <View style={[styles.verifiedWrap, { padding: spacing.xxs }]}>
          <AppIcon name="shield" size={sizes.iconSm} color="onPrimary" />
        </View>
      </View>

      {/* Middle: Patient Name & Verification Badges */}
      <View style={[styles.patientInfoBlock, { marginVertical: spacing.xs, gap: spacing.xs }]}>
        <View style={styles.nameRow}>
          <ThemedText variant="h2" color="onPrimary" numberOfLines={1} style={styles.patientName}>
            {patientFullName}
          </ThemedText>
          <AppIcon name="checkCircle" size={sizes.iconMd} color="onPrimary" />
        </View>

        <View style={styles.badgesRow}>
          <View
            style={[
              styles.patientIdBadge,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <ThemedText variant="code" color="primaryText">
              {patientIdCode}
            </ThemedText>
          </View>

          <View
            style={[
              styles.bloodBadge,
              {
                borderColor: colors.primaryLight,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="onPrimary">
              Blood Group: {bloodGroup || 'A+'}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Bottom Bar: NFC Terminal Prompt & View Card Button */}
      <View style={[styles.footer, { paddingTop: spacing.xs }]}>
        <View style={styles.nfcHintWrap}>
          <AppIcon name="qrCode" size={sizes.iconSm} color="onPrimary" />
          <ThemedText variant="caption" color="onPrimary" numberOfLines={1}>
            Tap terminal or present barcode
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Health Pass Card"
          onPress={onOpenQrModal}
          style={({ pressed }) => [
            styles.viewCardButton,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <ThemedText variant="smallBold" color="primaryText">
            View Card
          </ThemedText>
          <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 160,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackingWide: {
    letterSpacing: 0.8,
  },
  patientInfoBlock: {
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patientName: {
    letterSpacing: -0.3,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  patientIdBadge: {
    alignSelf: 'flex-start',
  },
  bloodBadge: {
    alignSelf: 'flex-start',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nfcHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  viewCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
