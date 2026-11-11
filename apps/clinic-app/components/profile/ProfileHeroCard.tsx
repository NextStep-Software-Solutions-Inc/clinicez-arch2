import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { initialsOf } from './types';

export interface ProfileHeroCardProps {
  displayName: string;
  roleArchetype: string;
  permissionProfileLabel?: string | null;
  specialty?: string | null;
  facilityName?: string | null;
  planTier?: string | null;
  accountEmail?: string | null;
  offline: boolean;
  isPhysician: boolean;
  showSkeletons?: boolean;
  clinicLoading?: boolean;
}

export default function ProfileHeroCard({
  displayName,
  roleArchetype,
  permissionProfileLabel,
  specialty,
  facilityName,
  planTier,
  accountEmail,
  offline,
  isPhysician,
  showSkeletons = false,
  clinicLoading = false,
}: ProfileHeroCardProps) {
  const cleanName = displayName.trim();
  const cleanRole = roleArchetype.trim();
  const cleanFacility = (facilityName ?? '').trim();
  const cleanEmail = (accountEmail ?? '').trim();

  const distinctPermissionProfile =
    permissionProfileLabel &&
    permissionProfileLabel.trim() &&
    permissionProfileLabel.trim().toLowerCase() !== cleanRole.toLowerCase()
      ? permissionProfileLabel.trim()
      : null;

  return (
    <Card>
      <CardContent style={styles.heroCard}>
        <View style={styles.heroRow}>
          {showSkeletons || !cleanName ? (
            <Skeleton
              width={theme.sizes.controlLg}
              height={theme.sizes.controlLg}
              radius={theme.radii.full}
            />
          ) : (
            <View style={styles.avatar}>
              <ThemedText variant="title" color={theme.colors.onPrimary}>
                {initialsOf(cleanName)}
              </ThemedText>
            </View>
          )}

          <View style={styles.heroDetails}>
            {showSkeletons ? (
              <View style={styles.heroNameRow}>
                <Skeleton width={180} height={20} />
                <Skeleton width={88} height={20} radius={theme.radii.full} />
              </View>
            ) : (
              <View style={styles.heroNameRow}>
                {cleanName ? (
                  <ThemedText variant="title">{cleanName}</ThemedText>
                ) : (
                  <Skeleton width={160} height={20} />
                )}
                {cleanRole ? (
                  <Badge
                    label={cleanRole}
                    variant={isPhysician ? 'primary' : 'purple'}
                    size="sm"
                    icon={isPhysician ? 'stethoscope' : 'shield'}
                  />
                ) : null}
                {distinctPermissionProfile ? (
                  <Badge
                    label={distinctPermissionProfile}
                    variant="neutral"
                    size="sm"
                    icon="shieldCheck"
                  />
                ) : null}
                {specialty?.trim() ? (
                  <Badge label={specialty.trim()} variant="outline" size="sm" />
                ) : null}
              </View>
            )}

            <View style={styles.heroMetaRow}>
              {clinicLoading || (showSkeletons && !cleanFacility) ? (
                <Skeleton width={120} height={14} />
              ) : cleanFacility ? (
                <View style={styles.metaInline}>
                  <Icon name="clinic" size={theme.fontSizes.xs} color={theme.colors.textMuted} />
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {cleanFacility}
                    {planTier ? ` (${planTier} Plan)` : ''}
                  </ThemedText>
                </View>
              ) : null}

              {cleanEmail ? (
                <View style={styles.metaInline}>
                  <Icon name="mail" size={theme.fontSizes.xs} color={theme.colors.textMuted} />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Account: {cleanEmail}
                  </ThemedText>
                </View>
              ) : showSkeletons ? (
                <Skeleton width={160} height={14} />
              ) : null}
            </View>
          </View>

          <View style={styles.connectionColumn}>
            {showSkeletons ? (
              <Skeleton width={88} height={24} radius={theme.radii.full} />
            ) : (
              <Badge
                label={offline ? 'Offline' : 'Connected'}
                variant={offline ? 'warning' : 'success'}
                size="sm"
                icon={offline ? 'alert' : 'check'}
              />
            )}
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    paddingVertical: theme.spacing.xs,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  avatar: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroDetails: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  metaInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  connectionColumn: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
});
