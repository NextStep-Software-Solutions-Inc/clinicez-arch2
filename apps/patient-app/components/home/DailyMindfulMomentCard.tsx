import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { DailyMindfulMomentDto } from '../../services/api/homeApi';

export interface DailyMindfulMomentCardProps {
  moment: DailyMindfulMomentDto;
}

function DailyMindfulMomentCardComponent({ moment }: DailyMindfulMomentCardProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceLow,
          borderColor: colors.borderSubtle,
          borderRadius: radii.xl,
          padding: spacing.base,
          gap: spacing.md,
        },
      ]}
    >
      <View
        style={[
          styles.illustrationBox,
          {
            backgroundColor: colors.mintSoftBg,
            borderRadius: radii.lg,
            borderColor: colors.welcomeBorder,
          },
        ]}
      >
        <Svg width={64} height={64} viewBox="0 0 64 64">
          <Rect x="0" y="0" width="64" height="64" rx="14" fill={colors.mintSoftBg} />
          <Circle cx="48" cy="16" r="10" fill={colors.mintBadgeBg} />
          <Path
            d="M14 48 H50"
            stroke={colors.primary}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.35"
          />
          <Path
            d="M20 28 H40 V38 C40 43.5 35.5 48 30 48 C24.5 48 20 43.5 20 38 Z"
            fill={colors.surface}
            stroke={colors.primary}
            strokeWidth="2"
          />
          <Path
            d="M40 31 H43 C45.2 31 47 32.8 47 35 C47 37.2 45.2 39 43 39 H40"
            fill="none"
            stroke={colors.primary}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d="M26 22 C26 19.5 28 18 28 15.5 M33 22 C33 19.5 35 18 35 15.5"
            fill="none"
            stroke={colors.primaryVibrant}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Svg>
      </View>

      <View style={[styles.copyCol, { gap: spacing.xs }]}>
        <Text style={[typography.overline, { color: colors.primary }]}>
          {moment.category}
        </Text>
        <Text numberOfLines={3} style={[typography.labelMd, { color: colors.navyText }]}>
          {moment.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  illustrationBox: {
    width: 64,
    height: 64,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyCol: {
    flex: 1,
    minWidth: 0,
  },
});

export const DailyMindfulMomentCard = memo(DailyMindfulMomentCardComponent);
export default DailyMindfulMomentCard;
