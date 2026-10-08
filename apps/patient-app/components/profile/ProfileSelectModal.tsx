import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
  Platform,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface SelectOption {
  label: string;
  value: string;
}

interface ProfileSelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function ProfileSelectModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: ProfileSelectModalProps) {
  const { colors, radii, sizes, shadows } = useAppTheme();
  const rootRef = useRef<View>(null);
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
          damping: 20,
          stiffness: 240,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 0.92,
          useNativeDriver: Platform.OS !== 'web',
          damping: 20,
          stiffness: 240,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [visible, opacity, scale]);

  // Elevate container z-index on web so select dialog sits on top of parent dialogs/bottom sheets
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const el = rootRef.current as unknown as HTMLElement | null;
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

  // Esc key closes on web (capture phase with stopImmediatePropagation so underlying dialog stays open)
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

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View ref={rootRef} style={[styles.root, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close select dialog"
        />
        <Animated.View
          style={[
            styles.sheet,
            shadows.lg,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xl,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          <ThemedText variant="bodyBold" style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((item) => {
              const isSelected = item.value === selected;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => handleSelect(item.value)}
                  style={({ pressed, hovered }: any) => [
                    styles.option,
                    { borderBottomColor: colors.borderLight },
                    hovered && { backgroundColor: colors.surfaceSubtle },
                    pressed && { opacity: 0.6 },
                    isSelected && { backgroundColor: colors.primarySubtle },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <ThemedText
                    variant={isSelected ? 'bodyBold' : 'body'}
                    style={{ color: isSelected ? colors.primary : colors.text, flex: 1 }}
                  >
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <AppIcon name="check" size={sizes.iconSm} color="primary" />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <Pressable
            onPress={onClose}
            style={({ pressed, hovered }: any) => [
              styles.cancelBtn,
              hovered && { backgroundColor: colors.surfaceSubtle },
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <ThemedText variant="bodyBold" color="textMuted">
              Cancel
            </ThemedText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: 520,
    zIndex: 100001,
  },
  title: {
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  scrollList: {
    maxHeight: 340,
  },
  scrollContent: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
});
