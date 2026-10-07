import React, { useState, useEffect } from 'react';
import { Image, StyleSheet, View, ActivityIndicator } from 'react-native';
import ThemedText from './ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

const COVER_HEIGHT = 104;
const LOGO_SIZE = 52;

interface EntityMediaCardHeaderProps {
  name: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  badgeLabel: string;
  badgeColor: string;
}

export default function EntityMediaCardHeader({
  name,
  logoUrl,
  coverImageUrl,
  badgeLabel,
  badgeColor,
}: EntityMediaCardHeaderProps) {
  const { colors, radii } = useAppTheme();
  const initials = name
    .split(' ')
    .map((word) => word[0])
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
    <View style={styles.wrapper}>
      <View style={styles.coverWrapper}>
        <Image
          source={require('../../assets/fallback_cover.jpg')}
          style={styles.cover}
          resizeMode="cover"
        />
        {coverImageUrl && !coverError && (
          <Image
            source={{ uri: coverImageUrl }}
            style={[
              styles.cover,
              { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'transparent' },
            ]}
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
            <ActivityIndicator size="small" color={colors.onPrimary} />
          </View>
        )}
      </View>

      <View style={[styles.badge, { backgroundColor: badgeColor, borderRadius: radii.full }]}>
        <ThemedText variant="badge" style={{ color: colors.onPrimary }}>
          {badgeLabel}
        </ThemedText>
      </View>

      <View
        style={[
          styles.logoFrame,
          {
            borderRadius: radii.full,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <View style={[styles.logoWrapper, { borderRadius: radii.full }]}>
          <Image
            source={require('../../assets/fallback_profile.jpg')}
            style={[styles.logo, { borderRadius: radii.full }]}
            resizeMode="cover"
          />
          {logoUrl && !logoError && (
            <Image
              source={{ uri: logoUrl }}
              style={[
                styles.logo,
                { position: 'absolute', top: 0, left: 0, backgroundColor: 'transparent', borderRadius: radii.full },
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
              <ThemedText variant="title" style={{ color: colors.onPrimary }}>
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
  },
  cover: {
    height: COVER_HEIGHT,
    width: '100%',
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
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  logoFrame: {
    position: 'absolute',
    left: 14,
    bottom: 0,
    padding: 3,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
