import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface MedicationScheduleItem {
  id: string;
  name: string;
  dosage: string;
  instruction: string;
  isTaken: boolean;
}

export interface MedicationsScheduleProps {
  medications: MedicationScheduleItem[];
  isZeroData?: boolean;
  onToggleMedication: (id: string) => void;
  onAddMedication: () => void;
  onManageAll: () => void;
}

export default function MedicationsSchedule({
  medications,
  isZeroData = false,
  onToggleMedication,
  onAddMedication,
  onManageAll,
}: MedicationsScheduleProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  const isEmpty = isZeroData || medications.length === 0;

  return (
    <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <ThemedText variant="title">Today's Schedule</ThemedText>
          <View
            style={[
              styles.countPill,
              {
                backgroundColor: colors.primaryLight,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="primaryText">
              {medications.length}
            </ThemedText>
          </View>
        </View>

        {isEmpty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add medication"
            onPress={onAddMedication}
          >
            <ThemedText variant="smallBold" color="primaryText">
              + Add Medication
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage all prescriptions"
            onPress={onManageAll}
          >
            <ThemedText variant="smallBold" color="primaryText">
              Manage All
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Body */}
      {isEmpty ? (
        /* State 1: Zero-Data Schedule Box */
        <View
          style={[
            styles.emptyBox,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
              gap: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.emptyLeft}>
            <View
              style={[
                styles.emptyIconWrap,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="pill" size={sizes.iconLg} color="textSecondary" />
            </View>
            <View style={styles.emptyTexts}>
              <ThemedText variant="bodyBold" numberOfLines={1}>
                No active medications scheduled
              </ThemedText>
              <ThemedText variant="small" color="textSecondary">
                Have an existing prescription? Tap to add medication or sync with your clinic records.
              </ThemedText>
            </View>
          </View>

          <Button
            label="+ Add"
            variant="outline"
            size="sm"
            onPress={onAddMedication}
          />
        </View>
      ) : (
        /* Populated Medication List */
        <View style={[styles.medicationsList, { gap: spacing.sm }]}>
          {medications.map((item) => (
            <View
              key={item.id}
              style={[
                styles.medicationCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                },
                shadows.sm,
              ]}
            >
              <View style={styles.medicationLeft}>
                <View
                  style={[
                    styles.medicationIconWrap,
                    {
                      backgroundColor: item.isTaken ? colors.successBg : colors.primarySubtle,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <AppIcon
                    name={item.isTaken ? 'checkCircle' : 'clock'}
                    size={sizes.iconMd}
                    color={item.isTaken ? 'success' : 'primary'}
                  />
                </View>

                <View style={styles.medicationDetails}>
                  <View style={styles.medNameRow}>
                    <ThemedText variant="bodyBold" numberOfLines={1}>
                      {item.name}
                    </ThemedText>
                    {item.dosage ? (
                      <ThemedText variant="caption" color="textSecondary">
                        {item.dosage}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                    {item.instruction}
                  </ThemedText>
                </View>
              </View>

              {item.isTaken ? (
                <Badge label="Taken" tone="success" size="sm" />
              ) : (
                <Button
                  label="Log Now"
                  variant="primary"
                  size="sm"
                  onPress={() => onToggleMedication(item.id)}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    alignSelf: 'center',
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  emptyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  emptyIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  medicationsList: {
    width: '100%',
  },
  medicationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  medicationIconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationDetails: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  medNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
