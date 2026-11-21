import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Badge from '../../ui/Badge';
import Icon from '../../ui/Icon';
import { Card } from '../../ui/Card';
import EdgeServerSwitcherSection from '../EdgeServerSwitcherSection';
import DevDataSeederCard from '../DevDataSeederCard';
import { theme } from '../../../constants/theme';

const DEV_NODE_KEYWORDS = ['edge', 'server', 'seed', 'seeder', 'dev', 'developer', 'node', 'test', 'url', 'api'];

export interface WorkstationNodeDevSectionProps {
  filterQuery?: string;
  onNavigatePatients?: () => void;
  defaultExpanded?: boolean;
}

export default function WorkstationNodeDevSection({
  filterQuery = '',
  onNavigatePatients,
  defaultExpanded = false,
}: WorkstationNodeDevSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return;
    if (DEV_NODE_KEYWORDS.some((kw) => kw.includes(q) || q.includes(kw))) {
      setExpanded(true);
    }
  }, [filterQuery]);

  return (
    <View style={styles.wrapper} testID="workstation-node-dev-section">
      <Card style={styles.card}>
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel="Toggle Server Connection and Sample Data"
          testID="toggle-workstation-node-dev"
          style={({ pressed, hovered }: any) => [
            styles.toggleHeader,
            hovered && styles.toggleHeaderHover,
            pressed && styles.toggleHeaderPressed,
          ]}
        >
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <Icon name="radio" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
            </View>
            <View style={styles.titleWrap}>
              <View style={styles.titleRow}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Server Connection &amp; Sample Data
                </ThemedText>
                <Badge label="Advanced" variant="neutral" size="sm" />
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Check server connection or load sample patients for testing.
              </ThemedText>
            </View>
          </View>

          <Icon
            name={expanded ? 'chevronUp' : 'chevronDown'}
            size={theme.sizes.iconMd}
            color={theme.colors.textMuted}
          />
        </Pressable>
      </Card>

      {expanded ? (
        <View style={styles.expandedStack}>
          <EdgeServerSwitcherSection />
          <DevDataSeederCard onNavigatePatients={onNavigatePatients} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  toggleHeaderHover: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  toggleHeaderPressed: {
    opacity: 0.85,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  expandedStack: {
    width: '100%',
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
});
