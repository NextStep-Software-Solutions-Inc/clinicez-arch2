import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import Icon from '../../ui/Icon';
import { Card, CardContent } from '../../ui/Card';
import Skeleton from '../../ui/Skeleton';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { PERMISSIONS } from '../../../constants/permissions';

export interface BillingShortcutEligibilityInput {
  cashierMode?: 'ClinicDesk' | 'CashierCounter' | null;
  userRole?: string | null;
  hasBillingPermission?: boolean;
  canAccessBillingOverride?: boolean;
}

export function isBillingShortcutEnabled({
  cashierMode,
  userRole,
  hasBillingPermission = false,
  canAccessBillingOverride,
}: BillingShortcutEligibilityInput): boolean {
  if (!cashierMode || cashierMode === 'CashierCounter') {
    return false;
  }
  if (canAccessBillingOverride !== undefined) {
    return Boolean(canAccessBillingOverride);
  }
  if (hasBillingPermission) {
    return true;
  }
  if (!userRole) {
    return false;
  }
  return userRole === 'Admin' || userRole === 'Cashier' || userRole === 'Receptionist';
}

export interface BillingLiveShortcutCardProps {
  cashierMode?: 'ClinicDesk' | 'CashierCounter';
  canAccessBilling?: boolean;
  onNavigateBilling?: () => void;
  showSkeletons?: boolean;
}

export default function BillingLiveShortcutCard({
  cashierMode,
  canAccessBilling,
  onNavigateBilling,
  showSkeletons = false,
}: BillingLiveShortcutCardProps) {
  const { user, can } = useAuth();

  if (showSkeletons) {
    return (
      <Card style={styles.card} testID="billing-live-shortcut-skeleton">
        <CardContent>
          <Skeleton height={52} />
        </CardContent>
      </Card>
    );
  }

  const hasBillingPermission =
    can(PERMISSIONS.billingRead) || can(PERMISSIONS.billingWrite);

  const isPermitted = isBillingShortcutEnabled({
    cashierMode,
    userRole: user?.role ?? null,
    hasBillingPermission,
    canAccessBillingOverride: canAccessBilling,
  });

  if (!isPermitted) {
    return null;
  }

  return (
    <Card style={styles.card} testID="billing-live-shortcut-card">
      <CardContent>
        <View style={styles.row}>
          <View style={styles.leftGroup}>
            <View style={styles.iconBadge}>
              <Icon name="billing" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
            </View>
            <View style={styles.textGroup}>
              <View style={styles.titleRow}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Today&apos;s Billing &amp; Daily Summary
                </ThemedText>
                <Badge label="Front-Desk Billing" variant="info" size="sm" />
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                View today&apos;s payments, Senior/PWD discounts, and open bills, or close out the day in Billing.
              </ThemedText>
            </View>
          </View>

          <Button
            title="Open Billing"
            icon="arrowRight"
            variant="outline"
            size="sm"
            onPress={onNavigateBilling ?? (() => {})}
            testID="btn-open-live-billing"
          />
        </View>
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
  row: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
});
