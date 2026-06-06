import { Image, StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';

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
  const initials = name
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.wrapper}>
      {coverImageUrl ? (
        <Image
          source={{ uri: coverImageUrl }}
          style={styles.cover}
          resizeMode="cover"
          accessibilityRole="image"
          accessibilityLabel={`${name} cover photo`}
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}

      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <ThemedText style={styles.badgeText}>{badgeLabel}</ThemedText>
      </View>

      <View style={styles.logoFrame}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            resizeMode="cover"
            accessibilityRole="image"
            accessibilityLabel={`${name} logo`}
          />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <ThemedText style={styles.logoInitials}>{initials}</ThemedText>
          </View>
        )}
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
    backgroundColor: '#1D3A6E',
  },
  coverFallback: {
    backgroundColor: '#1D3A6E',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  logoFrame: {
    position: 'absolute',
    left: 14,
    bottom: 0,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: '#fff',
    padding: 3,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  logoInitials: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
