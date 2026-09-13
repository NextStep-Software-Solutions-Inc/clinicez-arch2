import React, { forwardRef, useCallback } from 'react';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { useTheme } from '@react-navigation/native';

const ThemedBottomSheetModal = forwardRef<BottomSheetModal, BottomSheetModalProps>(
  (props, ref) => {
    const { colors } = useTheme();
    const renderBackdrop = useCallback(
      (backdropProps: any) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          // Optional: You can change the opacity or add custom styles here
          // opacity={0.5} 
        />
      ),
      []
    );
    return (
      <BottomSheetModal
        {...props}
        ref={ref}
        backdropComponent={renderBackdrop}
        backgroundStyle={[{ backgroundColor: colors.card }, props.backgroundStyle]}
        handleIndicatorStyle={[{ backgroundColor: colors.text }, props.handleIndicatorStyle]}
      />
    );
  }
);

ThemedBottomSheetModal.displayName = 'ThemedBottomSheetModal';

export default ThemedBottomSheetModal;
