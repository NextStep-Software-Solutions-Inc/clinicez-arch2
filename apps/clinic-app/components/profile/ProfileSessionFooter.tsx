import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { Card, CardContent } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../constants/theme';

export interface ProfileSessionFooterProps {
  displayName: string;
  roleLabel: string;
  accountEmail?: string | null;
  facilityName?: string | null;
  serverLabel?: string | null;
  offline: boolean;
  showSkeletons?: boolean;
  clinicLoading?: boolean;
  onSignOut: () => void | Promise<void>;
}

export default function ProfileSessionFooter({
  displayName,
  roleLabel,
  accountEmail,
  facilityName,
  serverLabel,
  offline,
  showSkeletons = false,
  clinicLoading = false,
  onSignOut,
}: ProfileSessionFooterProps) {
  const cleanName = displayName.trim();
  const cleanRole = roleLabel.trim();
  const cleanEmail = (accountEmail ?? '').trim();
  const cleanFacility = (facilityName ?? '').trim();
  const cleanServer = (serverLabel ?? '').trim();

  return (
    <Card variant="subtle">
      <CardContent style={styles.footerContent}>
        <View style={styles.footerRow}>
          <View style={styles.sessionSummary}>
            <View style={styles.iconTile}>
              <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.primary} />
            </View>
            <View style={styles.sessionDetails}>
              <View style={styles.titleRow}>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Signed-In Account
                </ThemedText>
                {showSkeletons ? (
                  <Skeleton width={64} height={20} radius={theme.radii.full} />
                ) : (
                  <Badge
                    label={offline ? 'Offline' : 'Online'}
                    variant={offline ? 'warning' : 'success'}
                    size="xs"
                    icon={offline ? 'alert' : 'check'}
                  />
                )}
              </View>

              {showSkeletons && !cleanName && !cleanEmail ? (
                <Skeleton width={190} height={14} />
              ) : (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Signed in as {cleanName || cleanEmail}
                  {cleanRole ? ` (${cleanRole})` : ''}
                  {cleanName && cleanEmail ? ` | ${cleanEmail}` : ''}
                </ThemedText>
              )}

              {clinicLoading || (showSkeletons && !cleanFacility && !cleanServer) ? (
                <Skeleton width={160} height={14} />
              ) : cleanFacility || cleanServer ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {[
                    cleanFacility ? `Clinic: ${cleanFacility}` : null,
                    cleanServer ? `Server: ${cleanServer}` : null,
                  ]
                    .filter(Boolean)
                    .join(' | ')}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <View style={styles.actionWrap}>
            <Button
              title="Sign Out"
              variant="danger"
              icon="logout"
              onPress={onSignOut}
            />
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  footerContent: {
    paddingVertical: theme.spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  sessionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
    minWidth: 240,
  },
  iconTile: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sessionDetails: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  actionWrap: {
    flexShrink: 0,
  },
});
