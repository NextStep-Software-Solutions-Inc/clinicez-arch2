import React, { forwardRef, useCallback } from 'react';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { useAppTheme } from '../../contexts/ThemeContext';
import { BottomSheetContext } from './BottomSheetContext';

const ThemedBottomSheetModal = forwardRef<BottomSheetModal, BottomSheetModalProps>(
  (
    {
      children,
      keyboardBehavior = 'interactive',
      keyboardBlurBehavior = 'restore',
      android_keyboardInputMode = 'adjustResize',
      ...props
    },
    ref
  ) => {
    const { colors } = useAppTheme();
    const renderBackdrop = useCallback(
      (backdropProps: any) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
        />
      ),
      []
    );
    return (
      <BottomSheetModal
        keyboardBehavior={keyboardBehavior}
        keyboardBlurBehavior={keyboardBlurBehavior}
        android_keyboardInputMode={android_keyboardInputMode}
        {...props}
        ref={ref}
        backdropComponent={renderBackdrop}
        backgroundStyle={[{ backgroundColor: colors.surface }, props.backgroundStyle]}
        handleIndicatorStyle={[{ backgroundColor: colors.borderDark }, props.handleIndicatorStyle]}
      >
        {typeof children === 'function'
          ? ((data: any) => (
              <BottomSheetContext.Provider value={{ isInBottomSheet: true }}>
                {(children as any)(data)}
              </BottomSheetContext.Provider>
            )) as any
          : (
              <BottomSheetContext.Provider value={{ isInBottomSheet: true }}>
                {children as React.ReactNode}
              </BottomSheetContext.Provider>
            )}
      </BottomSheetModal>
    );
  }
);

ThemedBottomSheetModal.displayName = 'ThemedBottomSheetModal';

export type WebBottomSheetModalRef = BottomSheetModal;

export default ThemedBottomSheetModal;
