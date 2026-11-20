import React from 'react';
import { StyleSheet, View } from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';

export interface IdleWarningModalProps {
  visible: boolean;
  secondsRemaining: number | null;
  onStaySignedIn: () => void;
  onLockNow: () => void;
}

/**
 * Displayed during the final 60 seconds before inactivity auto-locks the clinic workstation.
 * Requires an explicit click to dismiss so accidental mouse bumps do not keep an unattended desk open.
 */
export default function IdleWarningModal({
  visible,
  secondsRemaining,
  onStaySignedIn,
  onLockNow,
}: IdleWarningModalProps) {
  if (!visible || secondsRemaining === null) return null;

  const clampedSeconds = Math.max(0, Math.ceil(secondsRemaining));

  return (
    <Modal
      visible
      backdropDismissible={false}
      maxWidth={460}
      title="Still there?"
      subtitle="Workstation auto-lock protects patient privacy when you step away."
      testID="idle-warning-modal"
      footer={
        <View style={styles.footer}>
          <Button
            title="Lock now"
            variant="secondary"
            icon="lock"
            onPress={onLockNow}
            testID="idle-warning-lock-now"
          />
          <Button
            title="Stay signed in"
            variant="primary"
            onPress={onStaySignedIn}
            testID="idle-warning-stay-signed-in"
          />
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.countdownBanner}>
          <View style={styles.iconTile}>
            <Icon name="clock" size={theme.sizes.iconLg} color={theme.colors.warningText} />
          </View>
          <View style={styles.countdownText}>
            <ThemedText variant="smallBold" color={theme.colors.warningText}>
              Locking workstation in {clampedSeconds} second{clampedSeconds === 1 ? '' : 's'}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Unsaved consultation drafts are preserved, and you will resume on this screen once unlocked.
            </ThemedText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.md,
  },
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
  },
  iconTile: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
