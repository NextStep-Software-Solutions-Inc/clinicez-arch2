import React, { forwardRef, useCallback } from 'react';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { useAppTheme } from '../../contexts/ThemeContext';

const ThemedBottomSheetModal = forwardRef<BottomSheetModal, BottomSheetModalProps>(
  (props, ref) => {
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
        {...props}
        ref={ref}
        backdropComponent={renderBackdrop}
        backgroundStyle={[{ backgroundColor: colors.surface }, props.backgroundStyle]}
        handleIndicatorStyle={[{ backgroundColor: colors.borderDark }, props.handleIndicatorStyle]}
      />
    );
  }
);

ThemedBottomSheetModal.displayName = 'ThemedBottomSheetModal';

export type WebBottomSheetModalRef = BottomSheetModal;

export default ThemedBottomSheetModal;
