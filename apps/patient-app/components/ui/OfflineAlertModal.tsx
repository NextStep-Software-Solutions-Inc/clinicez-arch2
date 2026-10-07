import React from 'react';
import { Modal, View, StyleSheet, Dimensions } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { AppIcon, type IconName } from './Icon';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

interface OfflineAlertModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  icon?: string;
  iconName?: IconName;
  buttonText?: string;
}

const { width } = Dimensions.get('window');

export default function OfflineAlertModal({
  visible,
  onClose,
  title = 'Internet Required',
  message = 'This action requires a live connection to the backend server. Please connect to the internet and try again.',
  icon,
  iconName,
  buttonText = 'Got it',
}: OfflineAlertModalProps) {
  const { colors, radii, spacing, sizes, shadows } = useAppTheme();

  const resolvedIconName: IconName = iconName ?? 'wifiOff';
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
          {/* Signal Icon Wrapper */}
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: colors.urgentBg,
                borderRadius: radii.full,
                marginBottom: spacing.xl,
              },
            ]}
          >
            {showCustomIconString ? (
              <ThemedText style={styles.legacyIcon}>{icon}</ThemedText>
            ) : (
              <AppIcon name={resolvedIconName} size={sizes.iconLg} color="urgentText" />
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

          {/* Action Button */}
          <Button
            label={buttonText}
            variant="primary"
            onPress={onClose}
            fullWidth
          />
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
});
