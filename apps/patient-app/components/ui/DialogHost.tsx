import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { resolveDialog, subscribeDialogs } from '../../utils/dialogQueue';
import type { DialogButton, DialogRequest, DialogTone } from '../../utils/dialogTypes';
import ThemedText from './ThemedText';
import Button from './Button';
import { AppIcon, type IconName } from './Icon';
import type { ColorToken } from '@clinicez/design-tokens';
import { triggerHaptic } from '../../utils/haptics';

/**
 * Universal DialogHost for Native and Web.
 * Renders modal alerts and confirms with distinct border colors for error, warning,
 * and success, accompanied by haptic feedback.
 */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);

  const current = queue[0];
  if (!current) return null;
  return <DialogView key={current.id} request={current} />;
}

function variantFor(button: DialogButton, index: number, total: number, tone: DialogTone) {
  if (button.style === 'destructive') return 'danger' as const;
  if (button.style === 'cancel') return 'outline' as const;
  if (tone === 'error' && index === total - 1) return 'danger' as const;
  // Primary action is the last non-cancel button.
  return index === total - 1 ? ('primary' as const) : ('secondary' as const);
}

export function DialogView({ request }: { request: DialogRequest }) {
  const theme = useAppTheme();
  const { buttons, options, tone } = request;
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const overlayRef = useRef<View>(null);

  const close = (button?: DialogButton) => {
    resolveDialog(request.id);
    if (button) {
      void button.onPress?.();
    } else {
      options?.onDismiss?.();
    }
  };

  // Trigger haptics when dialog is shown
  useEffect(() => {
    void triggerHaptic(tone);
  }, [request.id, tone]);

  // Esc dismisses on web (as cancel when a cancel button exists)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        close(cancelButton);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  // Elevate container z-index on web so alerts/confirms always sit on top of modals & sheets
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
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
  }, [request.id]);

  const borderColors: Record<DialogTone, string> = {
    error: theme.colors.emergency,
    warning: theme.colors.warning,
    success: theme.colors.success,
    info: theme.colors.border,
  };

  const iconBgColors: Record<DialogTone, string> = {
    error: theme.colors.emergencyBg,
    warning: theme.colors.warningBg,
    success: theme.colors.successBg,
    info: theme.colors.primaryLight,
  };

  const iconColors: Record<DialogTone, ColorToken> = {
    error: 'emergency',
    warning: 'warningText',
    success: 'success',
    info: 'primary',
  };

  const toneIcons: Record<DialogTone, IconName> = {
    error: 'alert',
    warning: 'warning',
    success: 'check',
    info: 'info',
  };

  // Order: cancel first (left), other actions after it.
  const ordered = [
    ...buttons.filter((b) => b.style === 'cancel'),
    ...buttons.filter((b) => b.style !== 'cancel'),
  ];
  const stacked = ordered.length > 2;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(cancelButton)}>
      <View ref={overlayRef} style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss dialog"
          onPress={() => {
            if (options?.cancelable !== false) close(cancelButton);
          }}
        />
        <View
          accessibilityRole="alert"
          style={[
            styles.card,
            theme.shadows.lg,
            {
              backgroundColor: theme.colors.surface,
              borderColor: borderColors[tone],
              borderWidth: tone === 'info' ? 1 : 2,
              borderRadius: theme.radii.xl,
              maxWidth: Math.min(theme.sizes.dialogWidth - 120, 420),
              padding: theme.spacing['2xl'],
              gap: theme.spacing.md,
            },
          ]}
        >
          <View style={[styles.headerRow, { gap: theme.spacing.md }]}>
            <View
              style={[
                styles.iconWrapper,
                {
                  backgroundColor: iconBgColors[tone],
                  borderRadius: theme.radii.full,
                },
              ]}
            >
              <AppIcon name={toneIcons[tone]} size={theme.sizes.iconMd} color={iconColors[tone]} />
            </View>
            <View style={styles.headerTextWrap}>
              <ThemedText variant="title" accessibilityRole="header">
                {request.title}
              </ThemedText>
            </View>
          </View>
          {request.message ? (
            <ThemedText variant="body" color="textSecondary">
              {request.message}
            </ThemedText>
          ) : null}
          <View
            style={[
              styles.actions,
              stacked ? styles.actionsStacked : styles.actionsRow,
              { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
            ]}
          >
            {ordered.map((button, i) => (
              <Button
                key={`${button.text}-${i}`}
                label={button.text ?? 'OK'}
                variant={variantFor(button, i, ordered.length, tone)}
                fullWidth={stacked}
                onPress={() => close(button)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxHeight: '95%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  actions: {},
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  actionsStacked: { flexDirection: 'column' },
});
