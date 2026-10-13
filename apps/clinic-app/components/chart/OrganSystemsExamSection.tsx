import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, Button, SkeletonList, ErrorState } from '../ui';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';
import type { PhilHealthLibraryName } from '../../services/philHealthCatalogService';

export interface OrganSystemDef {
  key: 'skinId' | 'heentId' | 'chestId' | 'heartId' | 'abdomenId' | 'neuroId' | 'guId' | 'rectalId';
  remarksKey?: 'skinRemarks' | 'heentRemarks' | 'chestRemarks' | 'heartRemarks' | 'abdomenRemarks' | 'neuroRemarks' | 'guRemarks' | 'rectalRemarks';
  label: string;
  library: PhilHealthLibraryName;
  defaultNormalCode: string;
}

export const ORGAN_SYSTEMS: OrganSystemDef[] = [
  { key: 'skinId', remarksKey: 'skinRemarks', label: 'Skin / extremities', library: 'lib_skin_extremities', defaultNormalCode: '1' },
  { key: 'heentId', remarksKey: 'heentRemarks', label: 'HEENT', library: 'lib_heent', defaultNormalCode: '11' },
  { key: 'chestId', remarksKey: 'chestRemarks', label: 'Chest / lungs', library: 'lib_chest', defaultNormalCode: '6' },
  { key: 'heartId', remarksKey: 'heartRemarks', label: 'Heart', library: 'lib_heart', defaultNormalCode: '5' },
  { key: 'abdomenId', remarksKey: 'abdomenRemarks', label: 'Abdomen', library: 'lib_abdomen', defaultNormalCode: '7' },
  { key: 'neuroId', remarksKey: 'neuroRemarks', label: 'Neurological', library: 'lib_neuro', defaultNormalCode: '6' },
  { key: 'guId', remarksKey: 'guRemarks', label: 'Genitourinary', library: 'lib_genitourinary', defaultNormalCode: '1' },
  { key: 'rectalId', remarksKey: 'rectalRemarks', label: 'Rectal', library: 'lib_digital_rectal', defaultNormalCode: '1' },
];

export const DEFAULT_ORGAN_SYSTEM_NORMAL_CODES: Record<OrganSystemDef['key'], string> = {
  skinId: '1',
  heentId: '11',
  chestId: '6',
  heartId: '5',
  abdomenId: '7',
  neuroId: '6',
  guId: '1',
  rectalId: '1',
};

export interface OrganSystemsExamValues {
  skinId?: string;
  skinRemarks?: string;
  heentId?: string;
  heentRemarks?: string;
  chestId?: string;
  chestRemarks?: string;
  heartId?: string;
  heartRemarks?: string;
  abdomenId?: string;
  abdomenRemarks?: string;
  neuroId?: string;
  neuroRemarks?: string;
  guId?: string;
  guRemarks?: string;
  rectalId?: string;
  rectalRemarks?: string;
}

export interface OrganSystemRowProps {
  label: string;
  library: PhilHealthLibraryName;
  value?: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

/** One organ system row with a label, status badge, and horizontally scrollable option chips. */
export function OrganSystemRow({
  label,
  library,
  value,
  onChange,
  disabled = false,
}: OrganSystemRowProps) {
  const { items, loading, error, reload } = usePhilHealthCatalog(library);
  const selectedItem = items.find((i) => i.code === value);
  const isSelectedNormal = selectedItem
    ? /essentially normal/i.test(selectedItem.description) || /normal/i.test(selectedItem.description)
    : true;

  return (
    <View style={styles.organRow}>
      <View style={styles.organHeader}>
        <ThemedText variant="bodyBold" color={theme.colors.textSecondary}>
          {label}
        </ThemedText>
        {selectedItem ? (
          <Badge
            label={selectedItem.description}
            variant={isSelectedNormal ? 'routine' : 'warning'}
            size="sm"
          />
        ) : null}
      </View>

      {loading ? <SkeletonList rows={1} /> : null}
      {error ? (
        <ErrorState
          compact
          title="Catalog unavailable"
          message={error.message}
          onRetry={reload}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.organScroll}
          contentContainerStyle={styles.organScrollContent}
        >
          {items.map((item) => {
            const isNormal =
              /essentially normal/i.test(item.description) || /normal/i.test(item.description);
            const isSelected = value === item.code;
            const textColor = !isSelected
              ? theme.colors.textSecondary
              : isNormal
                ? theme.colors.successText
                : theme.colors.warningText;

            return (
              <Pressable
                key={item.code}
                onPress={() => !disabled && onChange(item.code)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${item.description}`}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.chip,
                  isSelected && isNormal && styles.chipSuccess,
                  isSelected && !isNormal && styles.chipWarning,
                ]}
              >
                {isSelected ? (
                  <Icon
                    name={isNormal ? 'check' : 'alert'}
                    size={theme.fontSizes.sm}
                    color={textColor}
                  />
                ) : null}
                <ThemedText
                  variant={isSelected ? 'smallBold' : 'small'}
                  color={textColor}
                >
                  {item.description}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

export interface OrganSystemsExamSectionProps {
  values: OrganSystemsExamValues;
  onChange: (key: OrganSystemDef['key'], code: string) => void;
  onSetAllNormal?: () => void;
  disabled?: boolean;
  spaced?: boolean;
  title?: string;
  helperText?: string;
}

/** Complete Organ Systems Examination section with horizontally scrollable options. */
export default function OrganSystemsExamSection({
  values,
  onChange,
  onSetAllNormal,
  disabled = false,
  spaced = false,
  title = 'Organ systems examination',
  helperText = 'Select examination findings for each system. Scroll horizontally across findings to review all clinical options.',
}: OrganSystemsExamSectionProps) {
  const abnormalCount = ORGAN_SYSTEMS.filter((sys) => {
    const val = values[sys.key];
    return val && val !== sys.defaultNormalCode;
  }).length;

  return (
    <View style={[styles.sectionContainer, spaced && styles.sectionSpaced]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleGroup}>
          <ThemedText variant="h3">{title}</ThemedText>
          <Badge
            label={abnormalCount > 0 ? `${abnormalCount} Abnormal Finding${abnormalCount > 1 ? 's' : ''}` : 'All Essentially Normal'}
            variant={abnormalCount > 0 ? 'warning' : 'routine'}
            size="sm"
          />
        </View>

        {onSetAllNormal ? (
          <Button
            title="All Essentially Normal"
            variant="outline"
            size="sm"
            icon="check"
            disabled={disabled}
            onPress={onSetAllNormal}
          />
        ) : null}
      </View>

      {helperText ? (
        <ThemedText variant="small" color={theme.colors.textMuted} style={styles.helperText}>
          {helperText}
        </ThemedText>
      ) : null}

      <View style={styles.organsGrid}>
        {ORGAN_SYSTEMS.map((item) => (
          <OrganSystemRow
            key={item.key}
            label={item.label}
            library={item.library}
            value={values[item.key]}
            onChange={(code) => onChange(item.key, code)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    gap: theme.spacing.xs,
  },
  sectionSpaced: {
    marginTop: theme.spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  helperText: {
    marginBottom: theme.spacing.xs,
  },
  organsGrid: {
    gap: theme.spacing.xs,
  },
  organRow: {
    flexDirection: 'column',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  organHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  organScroll: {
    width: '100%',
  },
  organScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 4,
    paddingRight: theme.spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    flexShrink: 0,
  },
  chipSuccess: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  chipWarning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warning,
  },
});
