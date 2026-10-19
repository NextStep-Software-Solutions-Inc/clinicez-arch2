import React from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colorSchemes } from '@clinicez/design-tokens';
import { useAppTheme } from '../../contexts/ThemeContext';

interface QrCodeViewProps {
  value: string;
  size?: number;
  accessibilityLabel: string;
}

/**
 * QR code rendered dark-on-light in every theme: scanners need the contrast, so the colours
 * come from the light scheme rather than the active (possibly dark) one.
 */
export default function QrCodeView({ value, size = 220, accessibilityLabel }: QrCodeViewProps) {
  const { spacing, radii } = useAppTheme();
  const light = colorSchemes.light;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.frame,
        { backgroundColor: light.card, padding: spacing.md, borderRadius: radii.lg },
      ]}
    >
      <QRCode value={value} size={size} color={light.text} backgroundColor={light.card} ecl="M" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
});
