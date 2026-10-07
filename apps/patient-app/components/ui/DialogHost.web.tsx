import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import {
  resolveDialog,
  subscribeDialogs,
} from '../../utils/dialog.web';
import type { DialogButton, DialogRequest } from '../../utils/dialogTypes';
import ThemedText from './ThemedText';
import Button from './Button';

/**
 * Web renderer for `dialog.alert` / `dialog.confirm`. Mounted once near the app root.
 * react-native-web's `Alert.alert` is a no-op, so this is what makes confirmation
 * prompts (sign out, cancel appointment, delete file, ...) work in the browser.
 */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);

  const current = queue[0];
  if (!current) return null;
  return <DialogView key={current.id} request={current} />;
}

function variantFor(button: DialogButton, index: number, total: number) {
  if (button.style === 'destructive') return 'danger' as const;
  if (button.style === 'cancel') return 'outline' as const;
  // Primary action is the last non-cancel button.
  return index === total - 1 ? ('primary' as const) : ('secondary' as const);
}

function DialogView({ request }: { request: DialogRequest }) {
  const theme = useAppTheme();
  const { buttons, options } = request;
  const cancelButton = buttons.find((b) => b.style === 'cancel');

  const close = (button?: DialogButton) => {
    resolveDialog(request.id);
    if (button) {
      void button.onPress?.();
    } else {
      options?.onDismiss?.();
    }
  };

  // Esc dismisses (as cancel when a cancel button exists).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(cancelButton);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  // Order: cancel first (left), other actions after it.
  const ordered = [
    ...buttons.filter((b) => b.style === 'cancel'),
    ...buttons.filter((b) => b.style !== 'cancel'),
  ];
  const stacked = ordered.length > 2;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(cancelButton)}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
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
              borderColor: theme.colors.border,
              borderRadius: theme.radii.xl,
              maxWidth: theme.sizes.dialogWidth - 120,
              padding: theme.spacing['2xl'],
              gap: theme.spacing.md,
            },
          ]}
        >
          <ThemedText variant="title" accessibilityRole="header">
            {request.title}
          </ThemedText>
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
                variant={variantFor(button, i, ordered.length)}
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
    borderWidth: 1,
  },
  actions: {},
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  actionsStacked: { flexDirection: 'column' },
});
