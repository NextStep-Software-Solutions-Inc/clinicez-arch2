import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface HealthPassQrModalProps {
  visible: boolean;
  patientFullName: string;
  patientIdCode: string;
  bloodGroup?: string | null;
  onClose: () => void;
}

export default function HealthPassQrModal({
  visible,
  patientFullName,
  patientIdCode,
  bloodGroup = 'A+ Pos',
  onClose,
}: HealthPassQrModalProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay, padding: spacing.xl }]}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderRadius: radii.xl,
              padding: spacing.xl,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              gap: spacing.lg,
            },
            shadows.lg,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close enlarged QR code"
            onPress={onClose}
            style={({ pressed }) => [
              styles.modalCloseBtn,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                top: spacing.md,
                right: spacing.md,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <AppIcon name="close" size={sizes.iconMd} color="textSecondary" />
          </Pressable>

          <Badge label="VERIFIED HEALTH PASS" tone="success" size="sm" icon="checkCircle" />

          <View style={[styles.modalHeaderInfo, { gap: spacing.xs }]}>
            <ThemedText variant="h2" style={styles.textCenter}>
              {patientFullName}
            </ThemedText>
            <ThemedText variant="caption" color="textSecondary" style={styles.textCenter}>
              {patientIdCode} • Blood Group: {bloodGroup || 'A+ Pos'}
            </ThemedText>
          </View>

          {/* QR Code Container */}
          <View
            style={[
              styles.qrBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.lg,
                padding: spacing.xl,
                gap: spacing.md,
              },
            ]}
          >
            <AppIcon name="qrCode" size={160} color="text" />
            <View
              style={[
                styles.securityPill,
                {
                  backgroundColor: colors.surfaceInverse,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xxs,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="onPrimary">
                CLINIC-EZ-VERIFIED
              </ThemedText>
            </View>
          </View>

          {/* Brightness note */}
          <View
            style={[
              styles.brightnessNote,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                gap: spacing.xs,
              },
            ]}
          >
            <AppIcon name="info" size={sizes.iconSm} color="primary" />
            <ThemedText variant="caption" color="textSecondary">
              Screen brightness automatically optimized
            </ThemedText>
          </View>

          <Button
            label="Done / Tap to Dismiss"
            variant="primary"
            fullWidth
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modalHeaderInfo: {
    alignItems: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  securityPill: {
    alignSelf: 'center',
  },
  brightnessNote: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
