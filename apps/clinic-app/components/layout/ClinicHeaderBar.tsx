import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';

export interface ClinicHeaderBarProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export default function ClinicHeaderBar({
  title,
  subtitle,
  rightAction,
  style,
}: ClinicHeaderBarProps) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.leftSection}>
        {title ? (
          <View>
            <ThemedText variant="h2" style={styles.title}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <View style={styles.clinicBranding}>
            <View style={styles.logoBadge}>
              <ThemedText style={styles.logoIcon}>🏥</ThemedText>
            </View>
            <View>
              <ThemedText variant="bodyBold" style={styles.clinicName}>
                St. Jude Family Clinic & Primary Care
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Laguna Primary Care Network • Facility #04-102
              </ThemedText>
            </View>
          </View>
        )}
      </View>

      <View style={styles.rightSection}>
        <View style={styles.statusPill}>
          <Badge label="🟢 Live Queue Active" variant="success" size="sm" />
        </View>

        <View style={styles.dateBadge}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            📅 {currentDate}
          </ThemedText>
        </View>

        {rightAction ? (
          rightAction
        ) : (
          <View style={styles.userBadge}>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>MC</ThemedText>
            </View>
            <View style={styles.userInfo}>
              <ThemedText variant="captionBold" style={styles.userName}>
                Dr. Cruz, MD
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Attending
              </ThemedText>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    ...theme.shadows.sm,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
  },
  clinicBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 20,
  },
  clinicName: {
    color: theme.colors.text,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  statusPill: {
    display: 'flex',
  },
  dateBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  userInfo: {
    display: 'flex',
  },
  userName: {
    color: theme.colors.text,
    fontSize: 12,
  },
});
