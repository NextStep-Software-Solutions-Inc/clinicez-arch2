import React, { useState, useEffect } from 'react';
import { Image, StyleSheet, View, ViewStyle, ActivityIndicator } from 'react-native';
import ThemedText from './ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

const COVER_HEIGHT = 180;
const LOGO_SIZE = 72;

interface EntityCoverHeaderProps {
  name: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  badgeLabel?: string;
  badgeColor?: string;
  style?: ViewStyle;
}

/**
 * Renders a full-width cover photo with a floating circular logo avatar
 * at the bottom-left and an optional status badge at the top-right.
 */
export default function EntityCoverHeader({
  name,
  logoUrl,
  coverImageUrl,
  badgeLabel,
  badgeColor,
  style,
}: EntityCoverHeaderProps) {
  const { colors, radii, shadows } = useAppTheme();
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [coverError, setCoverError] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [coverImageUrl]);

  useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  return (
    <View style={[styles.wrapper, style]}>
      {/* Cover photo */}
      <View style={styles.coverWrapper}>
        <Image
          source={require('../../assets/fallback_cover.jpg')}
          style={styles.cover}
          resizeMode="cover"
        />
        {coverImageUrl && !coverError && (
          <Image
            source={{ uri: coverImageUrl }}
            style={[styles.cover, { position: 'absolute', top: 0, left: 0, right: 0 }]}
            resizeMode="cover"
            accessibilityRole="image"
            accessibilityLabel={`${name} cover photo`}
            onLoadStart={() => setCoverLoading(true)}
            onLoadEnd={() => setCoverLoading(false)}
            onError={() => {
              setCoverError(true);
              setCoverLoading(false);
            }}
          />
        )}
        {coverLoading && (
          <View style={[StyleSheet.absoluteFill, styles.loaderContainer, { backgroundColor: colors.overlay }]}>
            <ActivityIndicator size="large" color={colors.onPrimary} />
          </View>
        )}
      </View>

      {/* Status badge – top-right */}
      {badgeLabel ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeColor ?? colors.primary,
              borderRadius: radii.full,
            },
          ]}
        >
          <ThemedText variant="badge" style={{ color: colors.onPrimary }}>
            {badgeLabel}
          </ThemedText>
        </View>
      ) : null}

      {/* Logo avatar – bottom-left, half-overlapping the cover */}
      <View style={[styles.logoShadow, shadows.md]}>
        <View style={[styles.logoWrapper, { borderRadius: radii.full }]}>
          <Image
            source={require('../../assets/fallback_profile.jpg')}
            style={[styles.logo, { borderColor: colors.surface, borderRadius: radii.full }]}
            resizeMode="cover"
          />
          {logoUrl && !logoError && (
            <Image
              source={{ uri: logoUrl }}
              style={[
                styles.logo,
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  borderColor: colors.surface,
                  borderRadius: radii.full,
                },
              ]}
              resizeMode="cover"
              accessibilityRole="image"
              accessibilityLabel={`${name} logo`}
              onLoadStart={() => setLogoLoading(true)}
              onLoadEnd={() => setLogoLoading(false)}
              onError={() => {
                setLogoError(true);
                setLogoLoading(false);
              }}
            />
          )}
          {(!logoUrl || logoError) && (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.logoFallback,
                { backgroundColor: colors.primary, borderRadius: radii.full },
              ]}
            >
              <ThemedText variant="h2" style={{ color: colors.onPrimary }}>
                {initials}
              </ThemedText>
            </View>
          )}
          {logoLoading && (
            <View style={[StyleSheet.absoluteFill, styles.logoLoaderContainer, { backgroundColor: colors.overlay }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: COVER_HEIGHT + LOGO_SIZE / 2,
    position: 'relative',
    overflow: 'visible',
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
  },
  coverWrapper: {
    height: COVER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  logoWrapper: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    overflow: 'hidden',
    position: 'relative',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLoaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  logoShadow: {
    position: 'absolute',
    bottom: 0,
    left: 16,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderWidth: 3,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
