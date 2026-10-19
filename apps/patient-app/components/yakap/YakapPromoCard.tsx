import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';

export interface YakapPromoCardProps {
  onLearnMore?: () => void;
  onExploreClinics?: () => void;
}

/**
 * Compact, welcoming promotional card for patients who are not yet verified
 * or registered in PhilHealth YAKAP with an accredited ClinicEZ facility.
 * Uses plain, friendly language with zero technical or statutory jargon.
 */
export default function YakapPromoCard({ onLearnMore, onExploreClinics }: YakapPromoCardProps) {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const navigation = useNavigation<any>();

  const handleLearnMore = () => {
    if (onLearnMore) {
      onLearnMore();
    } else {
      navigation.navigate('Main', { screen: 'YakapDetailsScreen' });
    }
  };

  const handleExploreClinics = () => {
    if (onExploreClinics) {
      onExploreClinics();
    } else {
      navigation.navigate('Main', { screen: 'ExploreClinicsScreen' });
    }
  };

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: colors.primaryLight, borderRadius: radii.md },
            ]}
          >
            <AppIcon name="shield" size={sizes.iconMd} color="primary" />
          </View>
          <View style={styles.titleWrap}>
            <ThemedText variant="h3">PhilHealth YAKAP Benefits</ThemedText>
            <ThemedText variant="caption" color="textMuted">
              Primary care covered by Universal Health Care
            </ThemedText>
          </View>
        </View>
        <Badge label="Free with PhilHealth" tone="success" size="sm" />
      </View>

      <ThemedText variant="small" color="textSecondary" style={styles.description}>
        Get free doctor check-ups, routine laboratory tests, and up to ₱20,000 every year in maintenance medicines.
      </ThemedText>

      <View style={[styles.actionRow, { gap: spacing.sm }]}>
        <Button
          label="How to Avail"
          variant="primary"
          size="sm"
          icon="info"
          style={styles.flexBtn}
          onPress={handleLearnMore}
        />
        <Button
          label="Find a Clinic"
          variant="outline"
          size="sm"
          icon="hospital"
          style={styles.flexBtn}
          onPress={handleExploreClinics}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  description: {
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  flexBtn: {
    flex: 1,
  },
});
