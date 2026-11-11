import React, { useSyncExternalStore } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';
import Button from './Button';
import Modal from './Modal';
import Toast, {
  getToastStyle,
  type ToastProps,
  type ToastVisualStyle,
} from './Toast';
import {
  dismissAlert,
  dismissToast,
  getFeedbackState,
  subscribeFeedback,
} from '../../utils/feedback';
import {
  getActiveThemeState,
  subscribeActiveTheme,
  theme,
} from '../../constants/theme';

export { Toast, getToastStyle, type ToastProps, type ToastVisualStyle };

function getActiveThemeSnapshot(): string {
  const s = getActiveThemeState();
  return `${s.brandColorHex}|${s.clinicBrandColorHex}|${s.userBrandColorHex ?? ''}|${s.scheme}`;
}

function getPortal() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('react-dom') as typeof import('react-dom')).createPortal;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Mount once at the app root. Renders web alert dialogs (native uses system dialogs)
 * and unified brand-responsive `<Toast />` notifications for both platforms.
 */
export default function FeedbackHost() {
  const { alerts, toasts } = useSyncExternalStore(
    subscribeFeedback,
    getFeedbackState,
    getFeedbackState
  );
  // Subscribe to active theme updates so open toasts & alert dialogs re-render
  // immediately whenever Clinic Brand Color, Personal Accent Color, or Dark Mode changes.
  useSyncExternalStore(subscribeActiveTheme, getActiveThemeSnapshot, getActiveThemeSnapshot);

  const current = alerts[0];
  const portal = getPortal();

  const toastContainer = (
    <View pointerEvents="box-none" style={styles.toastLayer}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </View>
  );

  const renderedToasts =
    portal && typeof document !== 'undefined' && document.body
      ? portal(toastContainer, document.body)
      : toastContainer;

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

      {toasts.length > 0 ? renderedToasts : null}
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
    zIndex: 999999,
    ...(Platform.OS === 'web' ? {} : { elevation: 999999 }),
    pointerEvents: 'box-none',
  },
});
