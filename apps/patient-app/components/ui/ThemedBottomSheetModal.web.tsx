import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useTheme } from '@react-navigation/native';

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
    const { colors } = useTheme();
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

    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <View style={styles.overlay}>
          {/* Dimmed backdrop */}
          <Pressable
            style={styles.backdrop}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close modal"
          />

          {/* Modal Card / Bottom Sheet Container */}
          <View
            style={[
              styles.sheetContainer,
              { backgroundColor: colors.card, borderColor: colors.border },
              props.backgroundStyle,
            ]}
          >
            {/* Grab handle indicator */}
            <View style={styles.handleContainer}>
              <View
                style={[
                  styles.handleIndicator,
                  { backgroundColor: colors.border },
                  props.handleIndicatorStyle,
                ]}
              />
            </View>

            <View style={styles.contentContainer}>
              {props.children}
            </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  contentContainer: {
    flexShrink: 1,
    maxHeight: '100%',
  },
});

export default ThemedBottomSheetModal;
