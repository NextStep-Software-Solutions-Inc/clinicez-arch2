import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export interface WebBottomSheetModalRef {
  present: () => void;
  dismiss: () => void;
  close: () => void;
  expand?: () => void;
  collapse?: () => void;
  snapToIndex?: (index: number) => void;
  snapToPosition?: (position: string | number) => void;
  forceClose?: () => void;
}

export interface ThemedBottomSheetModalProps {
  children?: React.ReactNode;
  snapPoints?: (string | number)[];
  backgroundStyle?: StyleProp<ViewStyle>;
  handleIndicatorStyle?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
  enablePanDownToClose?: boolean;
  keyboardBehavior?: string;
  keyboardBlurBehavior?: string;
  backdropComponent?: React.ComponentType<any>;
  [key: string]: any;
}

const ThemedBottomSheetModal = forwardRef<WebBottomSheetModalRef, ThemedBottomSheetModalProps>(
  (props, ref) => {
    const { colors, radii, sizes, shadows } = useAppTheme();
    const { isCompact } = useBreakpoint();
    const [visible, setVisible] = useState(false);

    const handleDismiss = () => {
      setVisible(false);
      props.onDismiss?.();
    };

    useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: handleDismiss,
      close: handleDismiss,
      expand: () => {},
      collapse: () => {},
      snapToIndex: () => {},
      snapToPosition: () => {},
      forceClose: handleDismiss,
    }));

    // Esc closes on web
    useEffect(() => {
      if (!visible || typeof window === 'undefined') return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handleDismiss();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [visible]);

    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <View
          style={[
            styles.overlay,
            { backgroundColor: colors.overlay },
            isCompact ? styles.overlaySheet : styles.overlayDialog,
          ]}
        >
          {/* Backdrop dismiss */}
          <Pressable
            style={styles.backdrop}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close modal"
          />

          {/* Modal Container: sheet on compact (<768), centered dialog on desktop (>=768) */}
          <View
            accessibilityRole="alert"
            style={[
              styles.baseContainer,
              shadows.lg,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              isCompact
                ? [
                    styles.sheetContainer,
                    {
                      borderTopLeftRadius: radii.xl,
                      borderTopRightRadius: radii.xl,
                    },
                  ]
                : [
                    styles.dialogContainer,
                    {
                      width: sizes.dialogWidth,
                      borderRadius: radii.xl,
                    },
                  ],
              props.backgroundStyle,
            ]}
          >
            {/* Grab handle indicator only on mobile bottom sheet */}
            {isCompact && (
              <View style={styles.handleContainer}>
                <View
                  style={[
                    styles.handleIndicator,
                    { backgroundColor: colors.borderDark, borderRadius: radii.full },
                    props.handleIndicatorStyle,
                  ]}
                />
              </View>
            )}

            <View style={styles.contentContainer}>{props.children}</View>
          </View>
        </View>
      </Modal>
    );
  }
);

ThemedBottomSheetModal.displayName = 'ThemedBottomSheetModal';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    zIndex: 9999,
  },
  overlaySheet: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  overlayDialog: {
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
  baseContainer: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: '100%',
    borderBottomWidth: 0,
  },
  dialogContainer: {
    maxWidth: '92%',
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleIndicator: {
    width: 40,
    height: 4,
  },
  contentContainer: {
    flexShrink: 1,
    maxHeight: '100%',
  },
});

export default ThemedBottomSheetModal;
