import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';

export interface CashierModeOption {
  id: 'ClinicDesk' | 'CashierCounter';
  label: string;
  badge: string;
  icon: 'billing' | 'clinic';
  description: string;
}

export const CASHIER_MODE_OPTIONS: CashierModeOption[] = [
  {
    id: 'ClinicDesk',
    label: 'Clinic Desk Collection',
    badge: 'Standalone / In-Clinic',
    icon: 'billing',
    description:
      'Official receipts, PhilHealth discounts, and payments are collected directly at the clinic desk. Invoices remain local to the clinic workstation.',
  },
  {
    id: 'CashierCounter',
    label: 'Centralized Cashier Counter',
    badge: 'Hospital / Multi-Department',
    icon: 'clinic',
    description:
      'Invoices are forwarded to the centralized cashier counter (Cashier App). Payments and official receipts are processed at the central cashier station.',
  },
];

export interface CashierStationSettingsCardProps {
  cashierMode: 'ClinicDesk' | 'CashierCounter';
  onChangeCashierMode: (mode: 'ClinicDesk' | 'CashierCounter') => void;
  onSave?: () => Promise<void> | void;
  saving?: boolean;
  showSkeletons?: boolean;
}

export default function CashierStationSettingsCard({
  cashierMode,
  onChangeCashierMode,
  onSave,
  saving = false,
  showSkeletons = false,
}: CashierStationSettingsCardProps) {
  return (
    <Card>
      <CardHeader
        title="Billing & Cashier Station"
        subtitle="Configure whether payments and official receipts are handled directly at the Clinic Desk or routed to a Centralized Cashier Counter"
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={2} />
        ) : (
          <View style={styles.cardContainer}>
            <View style={styles.selectorGrid}>
              {CASHIER_MODE_OPTIONS.map((opt) => {
                const isSelected = cashierMode === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => onChangeCashierMode(opt.id)}
                    style={({ pressed }) => [
                      styles.modeCard,
                      isSelected && styles.modeCardSelected,
                      pressed && styles.modeCardPressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${opt.label} (${opt.badge})`}
                  >
                    <View style={styles.modeCardHeader}>
                      <View style={styles.modeCardIconTitle}>
                        <View style={[styles.modeIconWrap, isSelected && styles.modeIconWrapSelected]}>
                          <Icon
                            name={opt.icon}
                            size={theme.sizes.iconLg}
                            color={isSelected ? theme.colors.onPrimary : theme.colors.primaryDark}
                          />
                        </View>
                        <View style={styles.modeTitleGroup}>
                          <ThemedText
                            variant="bodyBold"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                          >
                            {opt.label}
                          </ThemedText>
                          <Badge
                            label={opt.badge}
                            variant={isSelected ? 'info' : 'neutral'}
                            size="sm"
                          />
                        </View>
                      </View>

                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </View>

                    <ThemedText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.modeDescription}
                    >
                      {opt.description}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {onSave && (
              <View style={styles.actionsEnd}>
                <Button
                  title="Save billing station preferences"
                  onPress={onSave}
                  loading={saving}
                />
              </View>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    gap: theme.spacing.md,
  },
  selectorGrid: {
    gap: theme.spacing.md,
  },
  modeCard: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modeCardSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
  modeCardPressed: {
    opacity: 0.85,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeCardIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeIconWrapSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  modeTitleGroup: {
    gap: theme.spacing.xs,
    flex: 1,
  },
  modeDescription: {
    lineHeight: 18,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
  },
});
