import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface QuickActionsGridProps {
  onReachDoctor: () => void;
  onServices: () => void;
  onRecords: () => void;
  onPrescriptions: () => void;
}

export default function QuickActionsGrid({
  onReachDoctor,
  onServices,
  onRecords,
  onPrescriptions,
}: QuickActionsGridProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  return (
    <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
      <View style={styles.headerRow}>
        <ThemedText variant="title">Quick Actions</ThemedText>
        <ThemedText variant="captionBold" color="primaryText">
          Self-Service
        </ThemedText>
      </View>

      <View style={[styles.grid, { gap: spacing.sm }]}>
        {/* 1. Reach Dr. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reach doctor through direct chat"
          onPress={onReachDoctor}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: colors.primarySubtle,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
              },
            ]}
          >
            <AppIcon name="stethoscope" size={sizes.iconLg} color="primary" />
          </View>
          <ThemedText variant="smallBold" numberOfLines={1} style={styles.tileTitle}>
            Reach Dr.
          </ThemedText>
          <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
            Direct Chat
          </ThemedText>
        </Pressable>

        {/* 2. Services */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore clinics and care packages"
          onPress={onServices}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: colors.successBg,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
              },
            ]}
          >
            <AppIcon name="hospital" size={sizes.iconLg} color="success" />
          </View>
          <ThemedText variant="smallBold" numberOfLines={1} style={styles.tileTitle}>
            Services
          </ThemedText>
          <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
            Packages
          </ThemedText>
        </Pressable>

        {/* 3. Records */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open medical records and lab results"
          onPress={onRecords}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: colors.infoBg,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
              },
            ]}
          >
            <AppIcon name="folder" size={sizes.iconLg} color="info" />
          </View>
          <ThemedText variant="smallBold" numberOfLines={1} style={styles.tileTitle}>
            Records
          </ThemedText>
          <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
            Charts & Labs
          </ThemedText>
        </Pressable>

        {/* 4. Prescriptions */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View prescriptions and refills"
          onPress={onPrescriptions}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: colors.purpleBg,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
              },
            ]}
          >
            <AppIcon name="pill" size={sizes.iconLg} color="purple" />
          </View>
          <ThemedText variant="smallBold" numberOfLines={1} style={styles.tileTitle}>
            Prescriptions
          </ThemedText>
          <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
            Refills
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    textAlign: 'center',
  },
});
