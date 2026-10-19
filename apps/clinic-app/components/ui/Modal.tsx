import React, { useRef, useEffect } from 'react';
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
import {
  useModalStack,
  findPortalContainer,
  attachPortalElement,
  ModalStackContext,
  BASE_MODAL_Z_INDEX,
} from './modalStack';

export interface ModalProps {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  maxHeight?: DimensionValue;
  contentStyle?: ViewStyle;
  raw?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  transparent?: boolean;
  testID?: string;
  zIndex?: number;
  backdropDismissible?: boolean;
}

export default function Modal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 540,
  maxHeight = '95%',
  contentStyle,
  raw = false,
  animationType = 'fade',
  transparent = true,
  testID,
  zIndex: customZIndex,
  backdropDismissible = true,
}: ModalProps) {
  const rootRef = useRef<any>(null);
  const { modalId, depth, zIndex, isTop } = useModalStack(visible, {
    onClose,
    zIndex: customZIndex,
    elementRef: rootRef,
  });

  useEffect(() => {
    if (!visible) return;
    if (typeof document !== 'undefined' && rootRef.current) {
      const node = (rootRef.current as any)?.node || rootRef.current;
      const portal = findPortalContainer(node);
      if (portal) {
        attachPortalElement(modalId, portal);
      }
    }
  }, [visible, modalId, zIndex]);

  const handleBackdropPress = () => {
    if (backdropDismissible && onClose && isTop) {
      onClose();
    }
  };

  // Suppress dormant modal portal mounting in DOM environments (R1)
  if (!visible && typeof document !== 'undefined') {
    return null;
  }

  return (
    <RNModal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={isTop ? onClose : undefined}
      testID={testID}
    >
      <ModalStackContext.Provider
        value={{
          parentDepth: depth,
          parentModalId: modalId,
          parentZIndex: zIndex,
        }}
      >
        {raw ? (
          <View
            ref={rootRef}
            style={[styles.rawContainer, { zIndex }]}
            testID={testID}
          >
            {children}
          </View>
        ) : (
          <KeyboardAvoidingView
            ref={rootRef}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.overlay,
              { zIndex },
              depth > 0 && styles.nestedOverlay,
            ]}
            testID={testID}
          >
            <Pressable
              style={styles.backdrop}
              onPress={handleBackdropPress}
              accessibilityLabel="Close dialog"
            />

            <View
              style={[
                styles.dialog,
                { maxWidth, maxHeight, zIndex: zIndex + 1 },
                depth > 0 && styles.nestedDialog,
                contentStyle,
              ]}
            >
              {/* Header */}
              {(title || onClose) ? (
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    {title ? (
                      <ThemedText variant="title" style={styles.title}>
                        {title}
                      </ThemedText>
                    ) : null}
                    {subtitle ? (
                      <ThemedText
                        variant="small"
                        color={theme.colors.textMuted}
                        style={styles.subtitle}
                      >
                        {subtitle}
                      </ThemedText>
                    ) : null}
                  </View>

                  {onClose ? (
                    <Pressable
                      onPress={onClose}
                      style={({ pressed }) => [
                        styles.closeBtn,
                        pressed && styles.closeBtnPressed,
                      ]}
                      hitSlop={theme.spacing.sm}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Icon
                        name="close"
                        size={theme.sizes.iconMd}
                        color={theme.colors.textMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* Body Content */}
              <ScrollView
                style={styles.scrollArea}
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
        )}
      </ModalStackContext.Provider>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  rawContainer: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  nestedOverlay: {
    backgroundColor: theme.colors.overlay,
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
    maxHeight: '95%',
    display: 'flex',
    flexDirection: 'column',
    ...theme.shadows.lg,
  },
  nestedDialog: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.lg,
    elevation: 20,
  },
  scrollArea: {
    flexShrink: 1,
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
