import React, { forwardRef } from 'react';
import { Text as RNText, type ColorValue, type TextProps } from 'react-native';
import { typography, type TypographyVariant } from '@clinicez/design-tokens';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import { applyFontFamily } from '../../constants/fonts';

export type ThemedTextProps = TextProps & {
  /** Typography preset (size / weight / line height). Defaults to `body`. */
  variant?: TypographyVariant;
  /** Semantic colour token (preferred) or an explicit colour value. Defaults to `text`. */
  color?: ColorToken | ColorValue;
};

/**
 * Themed, token-driven text. Resolves the colour from the active scheme and applies the
 * Geist family for the variant's weight. Explicit `style` always wins over the variant.
 */
const ThemedText = forwardRef<RNText, ThemedTextProps>(function ThemedText(
  { variant, color, style, ...rest },
  ref,
) {
  const theme = useAppTheme();
  const tokens = theme.colors as Record<string, string>;
  const resolvedColor =
    typeof color === 'string' && color in tokens ? tokens[color] : (color ?? theme.colors.text);

  return (
    <RNText
      ref={ref}
      {...rest}
      style={applyFontFamily([
        variant ? typography[variant] : null,
        { color: resolvedColor },
        style,
      ])}
    />
  );
});

export default ThemedText;