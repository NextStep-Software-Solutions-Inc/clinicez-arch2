import React, { useEffect } from 'react';
import { Modal, View, StyleSheet, Dimensions } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { AppIcon, type IconName } from './Icon';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '@clinicez/design-tokens';
import type { DialogTone } from '../../utils/dialogTypes';
import { resolveDialogTone } from '../../utils/dialogTone';
import { triggerHaptic } from '../../utils/haptics';

interface CustomAlertModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonText?: string;
  icon?: string;
  iconName?: IconName;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  type?: DialogTone;
}

const { width } = Dimensions.get('window');

export default function CustomAlertModal({
  visible,
  onClose,
  title,
  message,
  buttonText = 'OK',
  icon,
  iconName,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  type,
}: CustomAlertModalProps) {
  const { colors, radii, spacing, sizes, shadows } = useAppTheme();

  const tone = resolveDialogTone(title, message, undefined, type, destructive);

  // Trigger haptics when alert opens
  useEffect(() => {
    if (visible) {
      void triggerHaptic(tone);
    }
  }, [visible, tone]);

  const borderColors: Record<DialogTone, string> = {
    error: colors.emergency,
    warning: colors.warning,
    success: colors.success,
    info: colors.border,
  };

  const iconBgColors: Record<DialogTone, string> = {
    error: colors.emergencyBg,
    warning: colors.warningBg,
    success: colors.successBg,
    info: colors.primaryLight,
  };

  const iconColors: Record<DialogTone, ColorToken> = {
    error: 'emergency',
    warning: 'warningText',
    success: 'success',
    info: 'primary',
  };

  const defaultIcons: Record<DialogTone, IconName> = {
    error: 'alert',
    warning: 'warning',
    success: 'check',
    info: 'info',
  };

  const resolvedIconName: IconName = iconName ?? defaultIcons[tone];
  const showCustomIconString = !!icon && !iconName;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <ThemedView
          style={[
            styles.dialog,
            shadows.lg,
            {
              backgroundColor: colors.surface,
              borderColor: borderColors[tone],
              borderWidth: tone === 'info' ? StyleSheet.hairlineWidth : 2,
              borderRadius: radii.xl,
              padding: spacing['2xl'],
            },
          ]}
        >
          {/* Icon Wrapper */}
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: iconBgColors[tone],
                borderRadius: radii.full,
                marginBottom: spacing.xl,
              },
            ]}
          >
            {showCustomIconString ? (
              <ThemedText style={styles.legacyIcon}>{icon}</ThemedText>
            ) : (
              <AppIcon
                name={resolvedIconName}
                size={sizes.iconLg}
                color={iconColors[tone]}
              />
            )}
          </View>

          {/* Texts */}
          <ThemedText variant="h2" style={[styles.title, { marginBottom: spacing.md }]}>
            {title}
          </ThemedText>
          <ThemedText
            variant="body"
            color="textSecondary"
            style={[styles.message, { marginBottom: spacing['2xl'] }]}
          >
            {message}
          </ThemedText>

          {/* Action Buttons */}
          {onConfirm ? (
            <View style={[styles.buttonRow, { gap: spacing.md }]}>
              <Button
                label={cancelText}
                variant="outline"
                onPress={onClose}
                style={styles.flexButton}
              />
              <Button
                label={confirmText}
                variant={destructive || tone === 'error' ? 'danger' : 'primary'}
                onPress={onConfirm}
                style={styles.flexButton}
              />
            </View>
          ) : (
            <Button
              label={buttonText}
              variant={destructive || tone === 'error' ? 'danger' : 'primary'}
              onPress={onClose}
              fullWidth
            />
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: Math.min(width - 48, 380),
    alignItems: 'center',
  },
  iconWrapper: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legacyIcon: {
    textAlign: 'center',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  flexButton: {
    flex: 1,
  },
});
