import { useState, useEffect } from 'react';
import { Image, StyleSheet, View, ViewStyle, ActivityIndicator } from 'react-native';
import ThemedText from './ThemedText';

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
            onError={() => { setCoverError(true); setCoverLoading(false); }}
          />
        )}
        {coverLoading && (
          <View style={[StyleSheet.absoluteFill, styles.loaderContainer]}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}
      </View>

      {/* Status badge – top-right */}
      {badgeLabel ? (
        <View style={[styles.badge, { backgroundColor: badgeColor ?? '#3B82F6' }]}>
          <ThemedText style={styles.badgeText}>{badgeLabel}</ThemedText>
        </View>
      ) : null}

      {/* Logo avatar – bottom-left, half-overlapping the cover */}
      <View style={styles.logoShadow}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('../../assets/fallback_profile.jpg')}
            style={styles.logo}
            resizeMode="cover"
          />
          {logoUrl && !logoError && (
            <Image
              source={{ uri: logoUrl }}
              style={[styles.logo, { position: 'absolute', top: 0, left: 0 }]}
              resizeMode="cover"
              accessibilityRole="image"
              accessibilityLabel={`${name} logo`}
              onLoadStart={() => setLogoLoading(true)}
              onLoadEnd={() => setLogoLoading(false)}
              onError={() => { setLogoError(true); setLogoLoading(false); }}
            />
          )}
          {logoLoading && (
            <View style={[StyleSheet.absoluteFill, styles.logoLoaderContainer]}>
              <ActivityIndicator size="small" color="#3B82F6" />
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
    borderRadius: 0,
  },
  coverWrapper: {
    height: COVER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  logoWrapper: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  logoLoaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  coverFallback: {
    backgroundColor: '#1D3A6E',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  logoShadow: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 5,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  logoFallback: {
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
});
