import { createElement } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';
import { format } from 'date-fns';

/**
 * Web date/time field: the browser's native picker (`<input type="date|time">`) replaces the
 * touch-only scroll-wheel modal used on mobile. Values keep the same string formats
 * (`yyyy-MM-dd` / `HH:mm`) so screens and the database are unaffected.
 */

type PickerMode = 'date' | 'time';

interface ProfileDatePickerProps {
  label: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  mode?: PickerMode;
  minimumDate?: Date;
  maximumDate?: Date;
  required?: boolean;
}

export default function ProfileDatePicker({
  label,
  value,
  onChange,
  mode = 'date',
  minimumDate,
  maximumDate,
  required = false,
}: ProfileDatePickerProps) {
  const theme = useAppTheme();
  const { colors, radii, spacing, fontSizes, fonts } = theme;

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: theme.sizes.controlLg,
    padding: `0 ${spacing.md}px`,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    colorScheme: theme.dark ? 'dark' : 'light',
    fontFamily: fonts.sans['400'],
    fontSize: fontSizes.lg,
    outlineColor: colors.focusRing,
  };

  const fmt = mode === 'date' ? 'yyyy-MM-dd' : 'HH:mm';

  return (
    <View style={[styles.container, { marginBottom: spacing.lg }]}>
      <ThemedText variant="smallBold" color="textSecondary" style={{ marginBottom: spacing.xs }}>
        {label}
        {required && <ThemedText variant="smallBold" color="emergency"> *</ThemedText>}
      </ThemedText>
      {createElement('input', {
        type: mode,
        value: value ?? '',
        'aria-label': label,
        required,
        min: minimumDate ? format(minimumDate, fmt) : undefined,
        max: maximumDate ? format(maximumDate, fmt) : undefined,
        style: inputStyle,
        onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
