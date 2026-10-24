import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from './ThemedText';
import Button from './Button';
import { AppIcon } from './Icon';

export interface SearchModalProps {
  visible: boolean;
  title?: string;
  placeholder?: string;
  value: string;
  onApply: (keyword: string) => void;
  onClose: () => void;
}

/**
 * Universal popup search dialog triggered from screen headers (Appointments & Health Records).
 * Supports Escape dismissal, Enter submission, inline clear, and active keyword reset.
 */
export function SearchModal({
  visible,
  title = 'Search',
  placeholder = 'Enter keyword to search...',
  value,
  onApply,
  onClose,
}: SearchModalProps) {
  const { colors, radii, spacing, sizes, typography, shadows } = useAppTheme();
  const [draft, setDraft] = useState(value);
  const overlayRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [visible, value]);

  // Elevate container z-index on web above navigation chrome
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

  if (!visible) return null;

  const handleSubmit = () => {
    onApply(draft.trim());
    onClose();
  };

  const handleClear = () => {
    setDraft('');
    onApply('');
    onClose();
  };

  const hasExistingOrDraft = value.trim().length > 0 || draft.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View ref={overlayRef} style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss search dialog"
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
          pointerEvents="box-none"
        >
          <View
            accessibilityRole="none"
            style={[
              styles.dialog,
              shadows.lg,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.xl,
                maxWidth: Math.min(sizes.dialogWidth - 80, 420),
                padding: spacing.xl,
                gap: spacing.lg,
              },
            ]}
          >
            <View style={[styles.headerRow, { gap: spacing.sm }]}>
              <View
                style={[
                  styles.iconBadge,
                  {
                    width: sizes.controlSm,
                    height: sizes.controlSm,
                    borderRadius: radii.md,
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <AppIcon name="search" size={sizes.iconMd} color="primary" />
              </View>
              <ThemedText variant="title" style={styles.flex}>
                {title}
              </ThemedText>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close search dialog"
                hitSlop={8}
                style={({ pressed }) => [{ padding: spacing.xxs, opacity: pressed ? 0.7 : 1 }]}
              >
                <AppIcon name="close" size={sizes.iconMd} color="textMuted" />
              </Pressable>
            </View>

            <View
              style={[
                styles.inputBox,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.primary,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  minHeight: sizes.controlLg,
                  gap: spacing.sm,
                },
              ]}
            >
              <AppIcon name="search" size={sizes.iconSm} color="textMuted" />
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                accessibilityLabel={title}
                style={[
                  typography.body,
                  styles.input,
                  { color: colors.text, paddingVertical: spacing.sm },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                ]}
              />
              {draft.length > 0 ? (
                <Pressable
                  onPress={() => setDraft('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear keyword"
                  hitSlop={8}
                >
                  <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.actionsRow, { gap: spacing.sm }]}>
              {hasExistingOrDraft ? (
                <Button
                  label="Clear"
                  variant="outline"
                  onPress={handleClear}
                  style={styles.flexButton}
                />
              ) : (
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={onClose}
                  style={styles.flexButton}
                />
              )}
              <Button
                label="Search"
                variant="primary"
                icon="search"
                onPress={handleSubmit}
                style={styles.flexButton}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/**
 * Compact active-keyword pill displayed when a header search filter is active,
 * allowing one-tap edit or clear without reopening the modal.
 */
export function ActiveSearchBanner({
  query,
  onEdit,
  onClear,
}: {
  query: string;
  onEdit: () => void;
  onClear: () => void;
}) {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const trimmed = query.trim();
  if (!trimmed) return null;

  return (
    <View style={styles.bannerWrap}>
      <View
        style={[
          styles.activePill,
          {
            backgroundColor: colors.primaryLight,
            borderColor: colors.primaryBorder,
            borderWidth: sizes.borderWidth,
            borderRadius: radii.full,
            paddingLeft: spacing.md,
            paddingRight: spacing.xs,
            paddingVertical: spacing.xs,
            gap: spacing.xs,
          },
        ]}
      >
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit search keyword ${trimmed}`}
          style={[styles.activePillLabel, { gap: spacing.xs }]}
        >
          <AppIcon name="search" size={sizes.iconSm} color="primaryText" />
          <ThemedText variant="smallBold" color="primaryText" numberOfLines={1}>
            {`Search: "${trimmed}"`}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search filter"
          hitSlop={8}
          style={[
            styles.clearBadge,
            {
              width: sizes.iconLg,
              height: sizes.iconLg,
              borderRadius: radii.full,
            },
          ]}
        >
          <AppIcon name="close" size={sizes.iconSm} color="primaryText" />
        </Pressable>
      </View>
    </View>
  );
}

export default SearchModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  keyboardAvoid: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: '100%',
    maxHeight: '95%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  flexButton: {
    flex: 1,
  },
  bannerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
  },
  activePillLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  clearBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
