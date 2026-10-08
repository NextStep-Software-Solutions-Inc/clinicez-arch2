import React, { useEffect, useRef } from 'react';
import { Modal, View, StyleSheet, Dimensions, Platform } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { AppIcon, type IconName } from './Icon';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';
import { triggerHaptic } from '../../utils/haptics';

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
  const overlayRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      void triggerHaptic('warning');
    }
  }, [visible]);

  // Elevate container z-index on web so offline alert sits on top of modals & sheets
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const el = overlayRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const elementsToRestore: Array<{ el: HTMLElement; prevZIndex: string }> = [];
    let curr: HTMLElement | null = el.parentElement;
    while (curr && curr !== document.body) {
      elementsToRestore.push({ el: curr, prevZIndex: curr.style.zIndex });
      curr.style.zIndex = '200000';
      curr = curr.parentElement;
    }

    return () => {
      for (const item of elementsToRestore) {
        item.el.style.zIndex = item.prevZIndex;
      }
    };
  }, [visible]);

  // Esc key dismiss on web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visible, onClose]);

  const resolvedIconName: IconName = iconName ?? 'wifiOff';
  const showCustomIconString = !!icon && !iconName;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View ref={overlayRef} style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <ThemedView
          style={[
            styles.dialog,
            shadows.lg,
            {
              backgroundColor: colors.surface,
              borderColor: colors.warning,
              borderWidth: 2,
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
                backgroundColor: colors.warningBg,
                borderRadius: radii.full,
                marginBottom: spacing.xl,
              },
            ]}
          >
            {showCustomIconString ? (
              <ThemedText style={styles.legacyIcon}>{icon}</ThemedText>
            ) : (
              <AppIcon name={resolvedIconName} size={sizes.iconLg} color="warningText" />
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
