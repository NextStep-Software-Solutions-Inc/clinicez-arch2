import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import type { IconName } from '../ui/iconNames';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export type QuickActionKey = 'reach_dr' | 'services' | 'records' | 'prescriptions';

interface QuickActionItem {
  key: QuickActionKey;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: 'mint' | 'lavender';
}

const QUICK_ACTIONS: readonly QuickActionItem[] = [
  {
    key: 'reach_dr',
    title: 'Reach Dr.',
    subtitle: 'Direct Chat',
    icon: 'headset',
    tone: 'mint',
  },
  {
    key: 'services',
    title: 'Services',
    subtitle: 'Packages',
    icon: 'squarePlus',
    tone: 'mint',
  },
  {
    key: 'records',
    title: 'Records',
    subtitle: 'Charts & Labs',
    icon: 'folderHeart',
    tone: 'lavender',
  },
  {
    key: 'prescriptions',
    title: 'Prescriptions',
    subtitle: 'Refills',
    icon: 'clipboardPen',
    tone: 'mint',
  },
];

export interface QuickActionsGridProps {
  onSelectAction: (action: QuickActionKey) => void;
  onSelfServicePress: () => void;
}

function QuickActionsGridComponent({
  onSelectAction,
  onSelfServicePress,
}: QuickActionsGridProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.headerRow}>
        <Text style={[typography.headlineSm, { color: colors.navyText }]}>Quick Actions</Text>
        <Pressable
          onPress={onSelfServicePress}
          accessibilityRole="button"
          accessibilityLabel="Explore Self-Service options"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          <Text style={[typography.labelMd, { color: colors.primary }]}>Self-Service</Text>
        </Pressable>
      </View>

      <View style={[styles.grid, { gap: spacing.sm }]}>
        {QUICK_ACTIONS.map((item) => {
          const badgeBg =
            item.tone === 'lavender' ? colors.lavenderSoftBg : colors.mintSoftBg;
          const iconColor =
            item.tone === 'lavender' ? colors.lavenderIcon : colors.primary;

          return (
            <Pressable
              key={item.key}
              onPress={() => onSelectAction(item.key)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.subtitle}`}
              style={({ pressed }) => [
                styles.card,
                elevation.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                  borderRadius: radii.lg,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.xs,
                  gap: spacing.xs,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: badgeBg,
                    borderRadius: radii.full,
                    marginBottom: spacing.xxs,
                  },
                ]}
              >
                <AppIcon name={item.icon} size={20} color={iconColor} />
              </View>
              <Text
                numberOfLines={1}
                style={[typography.labelMd, styles.centerText, { color: colors.navyText }]}
              >
                {item.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[typography.bodySm, styles.centerText, { color: colors.mutedText }]}
              >
                {item.subtitle}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
});

export const QuickActionsGrid = memo(QuickActionsGridComponent);
export default QuickActionsGrid;
