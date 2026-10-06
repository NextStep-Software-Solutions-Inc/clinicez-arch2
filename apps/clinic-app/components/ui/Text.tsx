import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  TextProps,
  TextInputProps,
} from 'react-native';
import { applyFontFamily } from '../../constants/fonts';

/**
 * Drop-in replacements for react-native's `Text` / `TextInput` that render in the
 * ClinicEz typeface (Geist). Use these - or `ThemedText` / `Input` - instead of the
 * raw react-native versions, otherwise text falls back to the system font.
 */
export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={applyFontFamily(style)} />;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, ...rest },
  ref,
) {
  return <RNTextInput ref={ref} {...rest} style={applyFontFamily(style)} />;
});

// Allows `useRef<TextInput>(null)` exactly like the react-native class.
export type TextInput = RNTextInput;
