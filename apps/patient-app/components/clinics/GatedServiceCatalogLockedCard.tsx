import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { useAppTheme } from '../../contexts/ThemeContext';
import { ClinicDetail } from '../../services/discovery/types';
import { GATED_CATALOG_STRINGS } from '../../constants/gatedCatalogStrings';

export interface GatedServiceCatalogLockedCardProps {
  clinic: ClinicDetail;
  onEnterJoinCode: () => void;
  onScanQr?: () => void;
  onJoinOrganization?: (organizationId: string) => void;
  isLoading?: boolean;
}

export default function GatedServiceCatalogLockedCard({
  clinic,
  onEnterJoinCode,
  onScanQr,
  onJoinOrganization,
  isLoading = false,
}: GatedServiceCatalogLockedCardProps) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();

  // 1. Loading Skeleton State (Zero Layout Shift)
  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: sizes.borderWidth,
            borderRadius: radii.xl,
            padding: spacing.xl,
            gap: spacing.md,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Skeleton width={56} height={56} radius={radii.lg} />
          <View style={[styles.headerText, { gap: spacing.xs }]}>
            <Skeleton width="40%" height={20} radius={radii.full} />
            <Skeleton width="75%" height={22} radius={radii.sm} />
          </View>
        </View>
        <Skeleton width="95%" height={16} radius={radii.xs} />
        <Skeleton width="80%" height={16} radius={radii.xs} />
        <View style={[styles.actionsGroup, { gap: spacing.sm, marginTop: spacing.sm }]}>
          <Skeleton width="100%" height={sizes.controlMd} radius={radii.md} />
          <Skeleton width="100%" height={sizes.controlMd} radius={radii.md} />
        </View>
      </View>
    );
  }

  const hasLinkedOrgs = Boolean(clinic.linkedOrganizations && clinic.linkedOrganizations.length > 0);
  const primaryOrg = hasLinkedOrgs ? clinic.linkedOrganizations[0] : null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radii.xl,
          borderWidth: sizes.borderWidth,
          padding: spacing.xl,
          gap: spacing.md,
        },
        shadows.sm,
      ]}
    >
      {/* Lock Icon Tile + Status Header */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.lockTile,
            {
              backgroundColor: colors.primarySubtle,
              borderColor: colors.primaryBorder,
              borderRadius: radii.lg,
              borderWidth: sizes.borderWidth,
            },
          ]}
        >
          <AppIcon name="lock" size={sizes.iconXl} color="primary" />
        </View>
        <View style={styles.headerText}>
          <Badge
            label={GATED_CATALOG_STRINGS.lockedCard.badge}
            tone="warning"
            icon="lock"
            size="sm"
          />
          <ThemedText variant="title">{GATED_CATALOG_STRINGS.lockedCard.title}</ThemedText>
        </View>
      </View>

      {/* Explanatory Clinical Gating Copy */}
      <ThemedText variant="body" color="textSecondary" style={styles.description}>
        {GATED_CATALOG_STRINGS.lockedCard.description}
      </ThemedText>

      <ThemedText variant="caption" color="textMuted">
        {GATED_CATALOG_STRINGS.lockedCard.reassurance}
      </ThemedText>

      {/* Action Buttons */}
      <View style={[styles.actionsGroup, { gap: spacing.sm }]}>
        <Button
          variant="primary"
          label={GATED_CATALOG_STRINGS.lockedCard.enterCodeCta}
          icon="key"
          fullWidth
          onPress={onEnterJoinCode}
        />

        {onScanQr ? (
          <Button
            variant="outline"
            label={GATED_CATALOG_STRINGS.lockedCard.scanQrCta}
            icon="qrCode"
            fullWidth
            onPress={onScanQr}
          />
        ) : null}

        {primaryOrg && onJoinOrganization ? (
          <View
            style={[
              styles.orgPrompt,
              {
                borderColor: colors.border,
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.lg,
                borderWidth: sizes.borderWidth,
                padding: spacing.md,
                gap: spacing.xs,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="textSecondary">
              Affiliated with {primaryOrg.name}
            </ThemedText>
            <ThemedText variant="caption" color="textMuted">
              Enrolled members of {primaryOrg.name} gain automatic access to this clinic.
            </ThemedText>
            <Button
              variant="secondary"
              label={`${GATED_CATALOG_STRINGS.lockedCard.joinOrgCtaPrefix}${primaryOrg.name}`}
              icon="building"
              fullWidth
              style={{ marginTop: spacing.xs }}
              onPress={() => onJoinOrganization(primaryOrg.id)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  lockTile: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  description: {
    lineHeight: 20,
  },
  actionsGroup: {
    marginTop: 6,
  },
  orgPrompt: {
    marginTop: 4,
  },
});
