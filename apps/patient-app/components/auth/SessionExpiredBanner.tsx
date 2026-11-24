import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppIcon } from '../ui/Icon';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';

export interface SessionExpiredBannerProps {
  /** Optional top safe-area inset for native screens above the root navigator. */
  topInset?: number;
}

/**
 * Persistent non-destructive banner shown when the user is online with a local
 * PIN vault (`isLocallyAuthenticated`) while their Clerk web/app session is
 * expired or signed out (`isClerkLoaded && !isClerkSignedIn`).
 */
export default function SessionExpiredBanner({ topInset = 0 }: SessionExpiredBannerProps) {
  const { isSessionExpired, startReauth } = useAuth();
  const { colors, spacing, radii, sizes } = useAppTheme();

  if (!isSessionExpired) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.warningBg,
          borderBottomColor: colors.warningBorder,
          borderBottomWidth: sizes.borderWidth,
          paddingTop: topInset + spacing.sm,
          paddingBottom: spacing.sm,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <View style={[styles.messageRow, { gap: spacing.sm }]}>
        <AppIcon name="warning" size={sizes.iconMd} color="warningText" />
        <View style={styles.textGroup}>
          <ThemedText variant="smallBold" color="warningText">
            Session expired — Sign in to sync
          </ThemedText>
          <ThemedText variant="caption" color="warningText">
            Viewing offline cached records. Sign in to sync changes and open online files.
          </ThemedText>
        </View>
      </View>

      <Button
        label="Sign in"
        variant="primary"
        size="sm"
        onPress={startReauth}
        accessibilityLabel="Sign in to restore session"
        style={{ borderRadius: radii.md }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    width: '100%',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 200,
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
  },
});
