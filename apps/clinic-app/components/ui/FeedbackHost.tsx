import React, { useEffect, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import ThemedText from './ThemedText';
import Icon, { IconName } from './Icon';
import Button from './Button';
import Modal from './Modal';
import {
  getFeedbackState,
  subscribeFeedback,
  dismissAlert,
  dismissToast,
  ToastRequest,
  ToastKind,
} from '../../utils/feedback';
import { theme } from '../../constants/theme';

const TOAST_STYLE: Record<ToastKind, { icon: IconName; color: string; bg: string; border: string }> = {
  success: {
    icon: 'checkCircle',
    color: theme.colors.successText,
    bg: theme.colors.successBg,
    border: theme.colors.successBorder,
  },
  error: {
    icon: 'alertCircle',
    color: theme.colors.emergencyText,
    bg: theme.colors.emergencyBg,
    border: theme.colors.emergencyBorder,
  },
  info: {
    icon: 'info',
    color: theme.colors.primaryDark,
    bg: theme.colors.primaryLight,
    border: theme.colors.primaryBorder,
  },
};

function Toast({ toast }: { toast: ToastRequest }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs]);

  const look = TOAST_STYLE[toast.kind];
  return (
    <Pressable
      onPress={() => dismissToast(toast.id)}
      accessibilityRole="alert"
      style={[styles.toast, { backgroundColor: look.bg, borderColor: look.border }]}
    >
      <Icon name={look.icon} size={theme.sizes.iconMd} color={look.color} />
      <ThemedText variant="bodyBold" color={look.color} style={styles.toastText}>
        {toast.message}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Mount once at the app root. Renders web alert dialogs (native uses system dialogs)
 * and toasts for both platforms.
 */
export default function FeedbackHost() {
  const { alerts, toasts } = useSyncExternalStore(subscribeFeedback, getFeedbackState, getFeedbackState);
  const current = alerts[0];

  return (
    <>
      {current ? (
        <Modal
          visible
          title={current.title}
          maxWidth={440}
          onClose={() => {
            if (!current.cancelable) return;
            dismissAlert(current.id);
            current.buttons.find((b) => b.style === 'cancel')?.onPress?.();
          }}
          footer={
            <View style={styles.actions}>
              {current.buttons.map((button, index) => (
                <Button
                  key={`${button.text}-${index}`}
                  title={button.text || 'OK'}
                  size="md"
                  variant={
                    button.style === 'destructive'
                      ? 'danger'
                      : button.style === 'cancel'
                        ? 'secondary'
                        : 'primary'
                  }
                  onPress={() => {
                    dismissAlert(current.id);
                    button.onPress?.();
                  }}
                />
              ))}
            </View>
          }
        >
          {current.message ? (
            <ThemedText variant="body" color={theme.colors.textSecondary}>
              {current.message}
            </ThemedText>
          ) : null}
        </Modal>
      ) : null}

      <View pointerEvents="box-none" style={styles.toastLayer}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  toastLayer: {
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    top: theme.spacing.lg,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    maxWidth: 520,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    ...theme.shadows.lg,
  },
  toastText: {
    flexShrink: 1,
  },
});
