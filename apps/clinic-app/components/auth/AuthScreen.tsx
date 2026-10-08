import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';

/** Shared chrome for sign-in, setup and unlock screens: centered card with the Clinic EZ brand mark. */
export function AuthScreen({
  title,
  subtitle,
  children,
  topRight,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  topRight?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.center}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.topRow}>
            <BrandMark />
            {topRight}
          </View>
          <View style={styles.header}>
            <ThemedText variant="h1">{title}</ThemedText>
            {subtitle ? (
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {children}
        </View>
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function BrandMark() {
  return (
    <View style={styles.brandTile}>
      <Icon name="clinic" size={theme.sizes.iconLg} color={theme.colors.onPrimary} />
    </View>
  );
}

/** Inline error message in the shared emergency colors. */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.errorText}>
        {message}
      </ThemedText>
    </View>
  );
}

export function InfoNotice({ message }: { message: string }) {
  return (
    <View style={styles.infoBanner}>
      <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.infoText} />
      <ThemedText variant="small" color={theme.colors.infoText} style={styles.errorText}>
        {message}
      </ThemedText>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  actions: {
    gap: theme.spacing.sm,
  },
  form: {
    gap: theme.spacing.lg,
  },
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing['3xl'],
    maxWidth: 480,
    width: '100%',
    gap: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    gap: theme.spacing.sm,
  },
  brandTile: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.infoBg,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  errorText: {
    flex: 1,
  },
});
