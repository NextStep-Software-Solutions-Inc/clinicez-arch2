import React from 'react';
import { Modal, View, StyleSheet, Dimensions } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { AppIcon, type IconName } from './Icon';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

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
}: CustomAlertModalProps) {
  const { colors, radii, spacing, sizes, shadows } = useAppTheme();

  // If no explicit icon or iconName, default to a semantic icon name (no emoji)
  const resolvedIconName: IconName = iconName ?? (destructive ? 'alert' : 'info');
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
              borderColor: colors.border,
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
                backgroundColor: destructive ? colors.emergencyBg : colors.primaryLight,
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
                color={destructive ? 'emergencyText' : 'primary'}
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
                variant={destructive ? 'danger' : 'primary'}
                onPress={onConfirm}
                style={styles.flexButton}
              />
            </View>
          ) : (
            <Button
              label={buttonText}
              variant="primary"
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
    borderWidth: StyleSheet.hairlineWidth,
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
