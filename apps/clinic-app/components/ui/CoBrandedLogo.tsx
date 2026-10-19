import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import { ClinicEzMark } from './ClinicEzLogo';
import { theme } from '../../constants/theme';

export interface CoBrandedLogoProps {
  /** Clinic custom logo URL / base64 data URI */
  clinicLogo?: string | null;
  /** Clinic facility name (e.g. 'Nextstep OPD') */
  clinicName?: string | null;
  /** Clinic primary brand color override (e.g. '#0D6963') */
  primaryColor?: string | null;
  /** Size in pixels for each brand tile (Clinic EZ mark & Clinic logo). Default: theme.sizes.controlLg (48px) */
  size?: number;
  /** Variant for the Clinic EZ mark */
  variant?: 'squircle' | 'bare' | 'inverted';
  /** Optional container style */
  style?: ViewStyle;
}

/**
 * Extracts a 2-letter uppercase monogram from a clinic facility name.
 * e.g. "Nextstep OPD" -> "NO", "Metro Health" -> "MH", "Clinic" -> "CL"
 */
export function getClinicInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return 'CL';
  const words = clean
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return 'CL';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Displays a co-branded header mark: Clinic EZ logo × Clinic logo.
 * If a custom clinic logo image is available, it renders the image in a matching squircle frame.
 * If no image has been uploaded yet, it renders a personalized clinic monogram badge using the facility name.
 * If no clinic identity is available, it cleanly falls back to just the Clinic EZ brand mark.
 */
export default function CoBrandedLogo({
  clinicLogo,
  clinicName,
  primaryColor,
  size = theme.sizes.controlLg,
  variant = 'squircle',
  style,
}: CoBrandedLogoProps) {
  const hasClinic = Boolean(clinicLogo || (clinicName && clinicName.trim().length > 0));
  const squircleRadius = Math.round(size * 0.22); // Mirrors 84/380 squircle curvature
  const monogramFontSize = Math.max(12, Math.round(size * 0.35));
  const crossFontSize = Math.max(14, Math.round(size * 0.38));

  if (!hasClinic) {
    return (
      <View style={[styles.brandTile, { width: size, height: size }, style]}>
        <ClinicEzMark size={size} variant={variant} />
      </View>
    );
  }

  const resolvedColor = primaryColor || theme.colors.primary;
  const accessibilityLabel = clinicName
    ? `${clinicName} partnered with Clinic EZ`
    : 'Clinic EZ co-branded mark';

  return (
    <View
      style={[styles.coBrandRow, style]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {/* 1. Clinic EZ Brand Mark */}
      <View style={[styles.brandTile, { width: size, height: size }]}>
        <ClinicEzMark size={size} variant={variant} />
      </View>

      {/* 2. Co-branding Separator ("×") */}
      <View style={styles.separatorContainer} aria-hidden>
        <ThemedText
          style={[styles.crossText, { fontSize: crossFontSize, lineHeight: crossFontSize + 4 }]}
          color={theme.colors.textMuted}
        >
          ×
        </ThemedText>
      </View>

      {/* 3. Clinic Logo or Monogram Badge */}
      <View
        style={[
          styles.clinicTile,
          {
            width: size,
            height: size,
            borderRadius: squircleRadius,
          },
        ]}
      >
        {clinicLogo ? (
          <Image
            source={{ uri: clinicLogo }}
            style={styles.clinicImage}
            resizeMode="contain"
            accessibilityLabel={`${clinicName || 'Clinic'} logo`}
          />
        ) : (
          <View
            style={[
              styles.monogramContainer,
              {
                borderRadius: squircleRadius,
                backgroundColor: theme.colors.primarySubtle,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.monogramText,
                {
                  fontSize: monogramFontSize,
                  color: resolvedColor,
                },
              ]}
            >
              {getClinicInitials(clinicName || '')}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  brandTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  separatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs / 2,
  },
  crossText: {
    fontWeight: '400',
    textAlign: 'center',
  },
  clinicTile: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clinicImage: {
    width: '100%',
    height: '100%',
    padding: theme.spacing.xs,
  },
  monogramContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
