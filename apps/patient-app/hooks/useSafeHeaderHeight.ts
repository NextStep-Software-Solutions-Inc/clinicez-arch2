import React from 'react';
import { HeaderHeightContext } from '@react-navigation/elements';

/**
 * Safely retrieves the navigation header height if inside a React Navigation header context.
 * Returns 0 if rendered outside a navigator with a header, without throwing runtime errors.
 */
export function useSafeHeaderHeight(): number {
  try {
    const context = React.useContext(HeaderHeightContext);
    return typeof context === 'number' ? context : 0;
  } catch {
    return 0;
  }
}
