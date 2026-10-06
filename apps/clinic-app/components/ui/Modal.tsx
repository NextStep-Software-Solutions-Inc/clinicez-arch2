import React from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  DimensionValue,
} from 'react-native';
import ThemedText from './ThemedText';
import Icon from './Icon';
import { theme } from '../../constants/theme';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  maxHeight?: DimensionValue;
  contentStyle?: ViewStyle;
}

export default function Modal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 540,
  maxHeight = '90%',
  contentStyle,
}: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close dialog" />

        <View style={[styles.dialog, { maxWidth, maxHeight }, contentStyle]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText variant="title" style={styles.title}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText variant="small" color={theme.colors.textMuted} style={styles.subtitle}>
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              hitSlop={theme.spacing.sm}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* Body Content */}
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {/* Optional Footer */}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dialog: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing['2xl'],
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
  },
  closeBtn: {
    width: theme.sizes.controlMd - theme.spacing.xs,
    height: theme.sizes.controlMd - theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
  },
  closeBtnPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  body: {
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  footer: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceMuted,
  },
});
