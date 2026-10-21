import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ClinicEzMark, { type ClinicEzMarkProps } from './ClinicEzMark';
import ThemedText from './ThemedText';

export interface ClinicEzLogoProps {
  size?: number;
  variant?: ClinicEzMarkProps['variant'];
  showWordmark?: boolean;
  subtitle?: string;
  style?: ViewStyle;
}

export default function ClinicEzLogo({
  size = 36,
  variant = 'inverted',
  showWordmark = true,
  subtitle,
  style,
}: ClinicEzLogoProps) {
  const { spacing } = useAppTheme();

  return (
    <View style={[styles.container, style]}>
      <ClinicEzMark size={size} variant={variant} />
      {showWordmark ? (
        <View style={[styles.textBlock, { marginLeft: spacing.sm }]}>
          <ThemedText variant="title" color="text" style={styles.brandTitle}>
            Clinic EZ
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="captionBold" color="primary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textBlock: {
    justifyContent: 'center',
  },
  brandTitle: {
    letterSpacing: -0.5,
    fontWeight: '700',
  },
  subtitle: {
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
