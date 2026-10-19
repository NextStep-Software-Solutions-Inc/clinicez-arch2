import React from 'react';

/**
 * Safely retrieves the navigation header height if inside a React Navigation header context.
 * Returns 0 if rendered outside a navigator with a header, without throwing runtime errors.
 */
export function useSafeHeaderHeight(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const elements = require('@react-navigation/elements');
    const Context = elements?.HeaderHeightContext;
    if (!Context) {
      return 0;
    }
    const context = React.useContext(Context);
    return typeof context === 'number' ? context : 0;
  } catch {
    return 0;
  }
}

