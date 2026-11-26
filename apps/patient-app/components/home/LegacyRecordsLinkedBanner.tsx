import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface LegacyRecordsLinkedBannerProps {
  visible: boolean;
  onViewRecords: () => void;
  onDismiss: () => void;
}

/**
 * One-time welcome-back confirmation card shown to patients whose migrated ClinicEZ v1
 * profile, clinical history, and uploaded files were automatically linked via Clerk verified email.
 */
function LegacyRecordsLinkedBannerComponent({
  visible,
  onViewRecords,
  onDismiss,
}: LegacyRecordsLinkedBannerProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  if (!visible) {
    return null;
  }

  return (
    <View
      testID="legacy-records-linked-banner"
      accessibilityRole="summary"
      style={[
        styles.container,
        {
          backgroundColor: colors.welcomeSurface,
          borderColor: colors.welcomeBorder,
          borderRadius: radii.xl,
          padding: spacing.base,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={[styles.headerRow, { gap: spacing.sm }]}>
        <View style={[styles.headerLeft, { gap: spacing.sm }]}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: colors.mintBadgeBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="shieldCheck" size={16} color={colors.primary} />
          </View>
          <Text style={[typography.cardTitle, { color: colors.navyText, flexShrink: 1 }]}>
            Existing ClinicEZ Records Linked
          </Text>
        </View>

        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss existing records linked banner"
          hitSlop={8}
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <AppIcon name="close" size={16} color={colors.bodyText} />
        </Pressable>
      </View>

      <Text style={[typography.bodySm, { color: colors.bodyText }]}>
        Welcome back! Your previous ClinicEZ profile, health records, and uploaded files were
        restored and linked automatically to your account.
      </Text>

      <View style={[styles.actionsRow, { gap: spacing.sm, marginTop: spacing.xs }]}>
        <Pressable
          onPress={onViewRecords}
          accessibilityRole="button"
          accessibilityLabel="View my restored records"
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              borderRadius: radii.full,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[typography.labelSm, { color: colors.onPrimary }]}>View My Records</Text>
          <AppIcon name="arrowRight" size={14} color={colors.onPrimary} />
        </Pressable>

        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Acknowledge restored records"
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor: colors.mintBadgeBg,
              borderRadius: radii.full,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.sm,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Text style={[typography.labelSm, { color: colors.primary }]}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    padding: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default memo(LegacyRecordsLinkedBannerComponent);
