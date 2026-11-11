import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Badge, { type BadgeVariant } from '../../ui/Badge';
import Icon, { type IconName } from '../../ui/Icon';
import { Card, CardContent } from '../../ui/Card';
import ErrorState from '../../ui/ErrorState';
import { SkeletonList } from '../../ui/Skeleton';
import { theme } from '../../../constants/theme';

export interface SettingsSplitCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  badgeVariant?: BadgeVariant;
  showSkeletons?: boolean;
  skeletonRows?: number;
  errorTitle?: string;
  errorMessage?: string | null;
  onRetryError?: () => void;
  footer?: React.ReactNode;
  testID?: string;
  children: React.ReactNode;
}

/**
 * Split Context Left + 2-Column Form Grid Right card archetype.
 * Keeps form inputs compact and readable while presenting contextual guidance on the left.
 */
export default function SettingsSplitCard({
  icon,
  title,
  subtitle,
  badgeLabel,
  badgeVariant = 'neutral',
  showSkeletons = false,
  skeletonRows = 2,
  errorTitle = 'Could not load clinic settings',
  errorMessage = null,
  onRetryError,
  footer,
  testID,
  children,
}: SettingsSplitCardProps) {
  return (
    <Card style={styles.card} testID={testID}>
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={skeletonRows} />
        ) : errorMessage ? (
          <ErrorState
            compact
            title={errorTitle}
            message={errorMessage}
            onRetry={onRetryError}
          />
        ) : (
          <View style={styles.splitRow}>
            {/* Left Context Summary Column */}
            <View style={styles.contextCol}>
              <View style={styles.contextHeader}>
                <View style={styles.iconWrap}>
                  <Icon name={icon} size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                {badgeLabel ? (
                  <Badge label={badgeLabel} variant={badgeVariant} size="sm" />
                ) : null}
              </View>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {title}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            </View>

            {/* Right 2-Column Form Grid */}
            <View style={styles.formCol}>
              <View style={styles.formBody}>{children}</View>
              {footer ? <View style={styles.footerRow}>{footer}</View> : null}
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  splitRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xl,
    alignItems: 'flex-start',
  },
  contextCol: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 200,
    maxWidth: '100%',
    gap: theme.spacing.xs,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    lineHeight: 18,
  },
  formCol: {
    flex: 1,
    flexBasis: 320,
    minWidth: 0,
    gap: theme.spacing.md,
  },
  formBody: {
    width: '100%',
    minWidth: 0,
    gap: theme.spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
});
