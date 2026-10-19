import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import type { ColorToken } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { IconName } from '../ui/iconNames';
import type { TimelineState, TimelineStep } from '../../services/documents/presentation';

interface TimelineProps {
  steps: TimelineStep[];
}

const MARKER_SIZE = 20;
const PENDING_DOT_SIZE = 12;

const STATE_STYLE: Record<TimelineState, { icon: IconName | null; color: ColorToken }> = {
  done: { icon: 'checkCircle', color: 'success' },
  current: { icon: 'clock', color: 'primary' },
  upcoming: { icon: null, color: 'textMuted' },
  failed: { icon: 'alert', color: 'emergency' },
};

export default function Timeline({ steps }: TimelineProps) {
  const { colors, spacing, sizes, radii } = useAppTheme();

  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const style = STATE_STYLE[step.state];
        const isLast = index === steps.length - 1;
        return (
          <View
            key={step.stage}
            style={styles.row}
            accessible
            accessibilityLabel={`${step.label}, ${step.state}`}
          >
            <View style={styles.rail}>
              <View style={styles.marker}>
                {style.icon ? (
                  <AppIcon name={style.icon} size={MARKER_SIZE} color={style.color} />
                ) : (
                  <View
                    style={{
                      width: PENDING_DOT_SIZE,
                      height: PENDING_DOT_SIZE,
                      borderRadius: radii.full,
                      borderWidth: sizes.borderWidth * 2,
                      borderColor: colors.border,
                    }}
                  />
                )}
              </View>
              {isLast ? null : (
                <View
                  style={[
                    styles.line,
                    {
                      width: sizes.borderWidth * 2,
                      backgroundColor: step.state === 'done' ? colors.success : colors.border,
                    },
                  ]}
                />
              )}
            </View>
            <View style={[styles.label, { paddingBottom: spacing.md, paddingLeft: spacing.sm }]}>
              <ThemedText
                variant={step.state === 'current' || step.state === 'failed' ? 'bodyBold' : 'body'}
                color={step.state === 'upcoming' ? 'textMuted' : 'text'}
              >
                {step.label}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rail: { alignItems: 'center' },
  marker: { width: MARKER_SIZE, height: MARKER_SIZE, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, minHeight: 12 },
  label: { flex: 1 },
});
