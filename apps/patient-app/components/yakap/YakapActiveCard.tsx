import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { ProgressBar } from '../ui/Primitives';

export interface YakapActiveCardProps {
  philhealthPin: string | null;
  assignedClinicName?: string | null;
  gamotUsed: number;
  annualAllocation?: number;
  onViewGuide?: () => void;
  onExploreClinics?: () => void;
}

/**
 * Benefit tracker card shown ONLY when a patient is 100% confirmed registered
 * with an accredited ClinicEZ partner facility.
 * Uses friendly, accessible language with zero technical or statutory jargon.
 * Clinical records (Health Questionnaire & Digital Prescriptions) remain in Profile.
 */
export default function YakapActiveCard({
  philhealthPin,
  assignedClinicName = 'Partner Health Center',
  gamotUsed,
  annualAllocation = 20000,
  onViewGuide,
  onExploreClinics,
}: YakapActiveCardProps) {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const navigation = useNavigation<any>();

  const usedClamped = Math.min(annualAllocation, Math.max(0, gamotUsed));
  const remaining = Math.max(0, annualAllocation - usedClamped);
  const percentageUsed = Math.min(100, Math.round((usedClamped / annualAllocation) * 100));

  const handleViewGuide = () => {
    if (onViewGuide) {
      onViewGuide();
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
      <View style={styles.topRow}>
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
            <ThemedText variant="h3">PhilHealth YAKAP Benefit</ThemedText>
            <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
              Assigned: {assignedClinicName}
            </ThemedText>
            {philhealthPin ? (
              <ThemedText variant="caption" color="textSecondary">
                PhilHealth ID: {philhealthPin}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <Badge
          label={`₱${annualAllocation.toLocaleString('en-US')}/yr`}
          tone="info"
          size="sm"
        />
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressLabels}>
          <ThemedText variant="smallBold" color="text">
            Annual Medicine Allowance
          </ThemedText>
          <ThemedText variant="smallBold" color="infoText">
            {percentageUsed}% used
          </ThemedText>
        </View>

        <ProgressBar
          value={usedClamped / annualAllocation}
          tone="success"
          label="Annual Medicine Allowance"
        />

        <View style={styles.progressLabels}>
          <ThemedText variant="caption" color="textMuted">
            Claimed: ₱{usedClamped.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </ThemedText>
          <ThemedText variant="captionBold" color="successText">
            ₱{remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })} available
          </ThemedText>
        </View>
      </View>

      <View style={[styles.actionRow, { gap: spacing.sm }]}>
        <Button
          label="View Benefits Guide"
          variant="outline"
          size="sm"
          icon="info"
          style={styles.flexBtn}
          onPress={handleViewGuide}
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
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  progressSection: {
    gap: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
});
