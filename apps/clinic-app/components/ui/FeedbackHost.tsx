import React, { useEffect, useState, useSyncExternalStore } from 'react';
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs]);

  const handleCopyRef = async () => {
    if (!toast.traceId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toast.traceId);
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const look = TOAST_STYLE[toast.kind];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.toast, { backgroundColor: look.bg, borderColor: look.border }]}
    >
      <View style={styles.toastHeaderRow}>
        <Icon name={look.icon} size={theme.sizes.iconMd} color={look.color} />
        <View style={styles.toastBody}>
          <ThemedText variant="bodyBold" color={look.color} style={styles.toastText}>
            {toast.message}
          </ThemedText>

          {toast.traceId ? (
            <View style={styles.traceRow}>
              <ThemedText variant="caption" color={look.color} style={styles.traceText} numberOfLines={1}>
                Ref ID: {toast.traceId}
              </ThemedText>
              <Pressable
                onPress={handleCopyRef}
                style={[styles.copyBtn, copied && styles.copyBtnSuccess]}
                accessibilityRole="button"
                accessibilityLabel="Copy Ref ID"
              >
                <Icon
                  name={copied ? 'check' : 'copy'}
                  size={theme.fontSizes.xs}
                  color={copied ? theme.colors.successText : look.color}
                />
                <ThemedText
                  variant="captionBold"
                  color={copied ? theme.colors.successText : look.color}
                >
                  {copied ? 'Copied' : 'Copy Ref ID'}
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {toast.action ? (
            <Pressable
              onPress={() => {
                toast.action?.onPress();
                dismissToast(toast.id);
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
            >
              <ThemedText variant="captionBold" color={look.color}>
                {toast.action.label}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={() => dismissToast(toast.id)}
          accessibilityLabel="Close notification"
          accessibilityRole="button"
          style={styles.closeBtn}
          hitSlop={theme.spacing.sm}
        >
          <Icon name="close" size={theme.sizes.iconSm} color={look.color} />
        </Pressable>
      </View>
    </View>
  );
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
 * and toasts for both platforms.
 */
export default function FeedbackHost() {
  const { alerts, toasts } = useSyncExternalStore(subscribeFeedback, getFeedbackState, getFeedbackState);
  const current = alerts[0];
  const portal = getPortal();

  const toastContainer = (
    <View pointerEvents="box-none" style={styles.toastLayer}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
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
    elevation: 999999,
    pointerEvents: 'box-none',
  },
  toast: {
    maxWidth: 540,
    width: '100%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    ...theme.shadows.lg,
    pointerEvents: 'auto',
  },
  toastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    width: '100%',
  },
  toastBody: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  toastText: {
    flexShrink: 1,
  },
  traceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  traceText: {
    opacity: 0.9,
    flexShrink: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copyBtnSuccess: {
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.successBg,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginTop: 2,
  },
  closeBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
});
