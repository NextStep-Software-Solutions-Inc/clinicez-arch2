import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, StyleSheet, Dimensions, TextInput, Platform } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

interface RenameModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (newName: string) => void;
  initialName: string;
  title?: string;
}

const { width } = Dimensions.get('window');

export default function RenameModal({
  visible,
  onClose,
  onSave,
  initialName,
  title = 'Rename',
}: RenameModalProps) {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const [name, setName] = useState(initialName);
  const overlayRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  // Elevate container z-index on web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const el = overlayRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const elementsToRestore: Array<{ el: HTMLElement; prevZIndex: string }> = [];
    let curr: HTMLElement | null = el.parentElement;
    while (curr && curr !== document.body) {
      elementsToRestore.push({ el: curr, prevZIndex: curr.style.zIndex });
      curr.style.zIndex = '100000';
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

  const canSave = !!name.trim() && name !== initialName;

  const handleSave = () => {
    if (canSave) {
      onSave(name.trim());
    }
  };

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
              borderColor: colors.border,
              borderRadius: radii.xl,
              padding: spacing['2xl'],
            },
          ]}
        >
          <ThemedText variant="h2" style={[styles.title, { marginBottom: spacing.lg }]}>
            {title}
          </ThemedText>

          <ThemedView
            style={[
              styles.inputWrap,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radii.md,
                marginBottom: spacing.xl,
              },
            ]}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter new name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              onSubmitEditing={handleSave}
              returnKeyType="done"
              style={[
                styles.input,
                { color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
              ]}
            />
          </ThemedView>

          <View style={[styles.buttonRow, { gap: spacing.md }]}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={onClose}
              style={styles.flexButton}
            />
            <Button
              label="Save"
              variant="primary"
              onPress={handleSave}
              disabled={!canSave}
              style={styles.flexButton}
            />
          </View>
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
    maxHeight: '95%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    textAlign: 'center',
  },
  inputWrap: {
    borderWidth: 1,
  },
  input: {
    minHeight: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  flexButton: {
    flex: 1,
  },
});
