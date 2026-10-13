import { createContext, useContext } from 'react';

export interface BottomSheetContextValue {
  isInBottomSheet: boolean;
}

export const BottomSheetContext = createContext<BottomSheetContextValue>({
  isInBottomSheet: false,
});

export const useInBottomSheet = (): boolean => useContext(BottomSheetContext).isInBottomSheet;
