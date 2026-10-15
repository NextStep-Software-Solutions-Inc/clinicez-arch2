import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  TextProps,
  TextInputProps,
  StyleSheet,
  TextStyle,
  StyleProp,
} from 'react-native';
import { applyFontFamily } from '../../constants/fonts';
import { useTextScale } from '../../context/TextScaleContext';

function scaleTextStyle(style: StyleProp<TextStyle>, scale: number): StyleProp<TextStyle> {
  if (scale === 1 || !style) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat) return style;

  const res: TextStyle = { ...flat };
  if (typeof flat.fontSize === 'number') {
    res.fontSize = Math.round(flat.fontSize * scale);
  }
  if (typeof flat.lineHeight === 'number') {
    res.lineHeight = Math.round(flat.lineHeight * scale);
  }
  return res;
}

/**
 * Drop-in replacements for react-native's `Text` / `TextInput` that render in the
 * Clinic EZ typeface (Geist) and respect user text scaling preferences.
 */
export function Text({ style, ...rest }: TextProps) {
  const { scale } = useTextScale();
  const scaled = scale !== 1 ? scaleTextStyle(style, scale) : style;
  return <RNText {...rest} style={applyFontFamily(scaled)} />;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, ...rest },
  ref,
) {
  const { scale } = useTextScale();
  const scaled = scale !== 1 ? scaleTextStyle(style, scale) : style;
  return <RNTextInput ref={ref} {...rest} style={applyFontFamily(scaled)} />;
});

// Allows `useRef<TextInput>(null)` exactly like the react-native class.
export type TextInput = RNTextInput;
