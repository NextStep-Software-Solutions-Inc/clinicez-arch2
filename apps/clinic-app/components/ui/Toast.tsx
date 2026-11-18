import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';
import Icon, { type IconName } from './Icon';
import Button from './Button';
import { dismissToast, type ToastKind, type ToastRequest } from '../../utils/feedback';
import {
  getActiveThemeState,
  subscribeActiveTheme,
  theme,
  type NativeShadowToken,
} from '../../constants/theme';

function getActiveThemeSnapshot(): string {
  const s = getActiveThemeState();
  return `${s.brandColorHex}|${s.clinicBrandColorHex}|${s.userBrandColorHex ?? ''}|${s.scheme}`;
}

export interface ToastVisualStyle {
  icon: IconName;
  color: string;
  accent: string;
  bg: string;
  border: string;
  shadow: NativeShadowToken;
}

export interface ToastProps {
  toast: ToastRequest;
  onDismiss?: (id: number) => void;
}

/**
 * Resolves brand-cohesive and semantic visual tokens for unified `<Toast />` notifications:
 * - `success` & `info`: dynamically track the active Clinic / Personal Brand Palette + `shadows.brandMd`
 * - `warning`: semantic clinical amber + `shadows.md`
 * - `error`: semantic clinical crimson + `shadows.dangerMd`
 */
export function getToastStyle(kind: ToastKind): ToastVisualStyle {
  switch (kind) {
    case 'success':
      return {
        icon: 'checkCircle',
        color: theme.colors.primaryDark,
        accent: theme.colors.primary,
        bg: theme.colors.primaryLight,
        border: theme.colors.primaryBorder,
        shadow: theme.shadows.brandMd,
      };
    case 'error':
      return {
        icon: 'alertCircle',
        color: theme.colors.emergencyText,
        accent: theme.colors.emergency,
        bg: theme.colors.emergencyBg,
        border: theme.colors.emergencyBorder,
        shadow: theme.shadows.dangerMd,
      };
    case 'warning':
      return {
        icon: 'alert',
        color: theme.colors.warningText,
        accent: theme.colors.warning,
        bg: theme.colors.warningBg,
        border: theme.colors.warningBorder,
        shadow: theme.shadows.md,
      };
    case 'info':
    default:
      return {
        icon: 'info',
        color: theme.colors.primaryDark,
        accent: theme.colors.primary,
        bg: theme.colors.primaryLight,
        border: theme.colors.primaryBorder,
        shadow: theme.shadows.brandMd,
      };
  }
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  useSyncExternalStore(subscribeActiveTheme, getActiveThemeSnapshot, getActiveThemeSnapshot);
  const [copied, setCopied] = useState(false);
  const slideAnim = useRef(new Animated.Value(-16)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const finalizeDismiss = useCallback(() => {
    if (onDismiss) {
      onDismiss(toast.id);
    } else {
      dismissToast(toast.id);
    }
  }, [onDismiss, toast.id]);

  const handleDismiss = useCallback(() => {
    if (typeof Animated.parallel === 'function') {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -16,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(() => {
        finalizeDismiss();
      });
    } else {
      finalizeDismiss();
    }
  }, [finalizeDismiss, opacityAnim, slideAnim]);

  useEffect(() => {
    if (typeof Animated.parallel === 'function') {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }

    const timer = setTimeout(handleDismiss, toast.durationMs);
    return () => clearTimeout(timer);
  }, [handleDismiss, opacityAnim, slideAnim, toast.durationMs]);

  const handleCopyRef = async () => {
    if (!toast.traceId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toast.traceId);
      }
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const look = getToastStyle(toast.kind);

  return (
    <Animated.View
      accessibilityRole="alert"
      style={[
        styles.toast,
        look.shadow,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: look.accent }]} />

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
              <Button
                title={copied ? 'Copied' : 'Copy Ref ID'}
                icon={copied ? 'check' : 'copy'}
                variant={copied ? 'outline' : 'secondary'}
                size="xs"
                accessibilityLabel="Copy Ref ID"
                onPress={handleCopyRef}
              />
            </View>
          ) : null}

          {toast.action ? (
            <Button
              title={toast.action.label}
              variant="secondary"
              size="xs"
              accessibilityLabel={toast.action.label}
              onPress={() => {
                toast.action?.onPress();
                handleDismiss();
              }}
              style={styles.actionBtnWrap}
            />
          ) : null}
        </View>

        <Button
          variant="ghost"
          size="xs"
          icon="close"
          iconOnly
          accessibilityLabel="Close notification"
          onPress={handleDismiss}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'relative',
    overflow: 'hidden',
    maxWidth: 540,
    width: '100%',
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.lg + 4,
    paddingRight: theme.spacing.lg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    pointerEvents: 'auto',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
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
  actionBtnWrap: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
