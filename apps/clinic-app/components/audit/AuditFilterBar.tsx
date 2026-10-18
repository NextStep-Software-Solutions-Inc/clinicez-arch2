import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import { TextInput } from '../ui/Text';
import { IconSlot, type IconName } from '../ui/Icon';
import Button from '../ui/Button';
import ValidatedDateInput from '../ui/ValidatedDateInput';
import type { AuditDatePreset } from '../../services/clinicService';

export type AuditCategoryFilter =
  | 'All'
  | 'Security'
  | 'Operations'
  | 'Billing'
  | 'Clinical Access'
  | 'PhilHealth Yakap';

export interface CategoryPillItem {
  key: string;
  label: string;
  icon: IconName;
  description: string;
}

export const CATEGORY_PILLS: CategoryPillItem[] = [
  { key: 'All', label: 'All', icon: 'clipboard', description: 'Complete clinic-wide audit trail' },
  { key: 'Security', label: 'Security', icon: 'lock', description: 'Authentication, credentials, role changes' },
  { key: 'Operations', label: 'Operations', icon: 'settings', description: 'Schedules, rooms, custom fields, settings' },
  { key: 'Billing', label: 'Billing', icon: 'billing', description: 'Invoices, payments, receipts, voids, refunds' },
  { key: 'Clinical Access', label: 'Clinical Access', icon: 'consultations', description: 'Consultations, vitals, problems, chart views' },
  { key: 'PhilHealth Yakap', label: 'PhilHealth Yakap', icon: 'yakap', description: 'PIN queries, eKAS, ATC, transmittals' },
];

export const DATE_PRESETS: Array<{ key: AuditDatePreset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

export const SEVERITY_OPTIONS = [
  { key: 'All', label: 'All Severities' },
  { key: 'Emergency', label: 'Emergency (STAT)' },
  { key: 'Urgent', label: 'Urgent' },
  { key: 'Routine', label: 'Routine' },
];

export interface AuditFilterBarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  severityFilter: string;
  onSeverityFilterChange: (sev: string) => void;
  datePreset?: AuditDatePreset;
  onDatePresetChange?: (preset: AuditDatePreset) => void;
  dateRangeError?: string | null;
  onResetFilters: () => void;
  onOpenExport?: () => void;
  isExporting?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AuditFilterBar({
  selectedCategory,
  onSelectCategory,
  search,
  onSearchChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  severityFilter,
  onSeverityFilterChange,
  datePreset = '7d',
  onDatePresetChange,
  dateRangeError,
  onResetFilters,
  onOpenExport,
  isExporting = false,
  onRefresh,
  isRefreshing = false,
}: AuditFilterBarProps) {
  const isDateInvalid = Boolean(dateRangeError || (startDate && endDate && startDate > endDate));

  return (
    <View style={styles.container}>
      {/* Category Pills Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsScrollContainer}
      >
        {CATEGORY_PILLS.map((pill) => {
          const isSelected = selectedCategory.toLowerCase() === pill.key.toLowerCase();
          return (
            <Pressable
              key={pill.key}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${pill.label}`}
              onPress={() => onSelectCategory(pill.key)}
              style={[styles.pill, isSelected ? styles.pillSelected : styles.pillUnselected]}
            >
              <IconSlot
                value={pill.icon}
                size={theme.sizes.iconSm}
                color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
              />
              <ThemedText
                style={[
                  styles.pillText,
                  isSelected ? styles.pillTextSelected : styles.pillTextUnselected,
                ]}
              >
                {pill.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Search Input Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIcon}>
            <IconSlot
              value="search"
              size={theme.sizes.iconSm}
              color={theme.colors.textMuted}
            />
          </View>
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search action, actor name, patient, entity ID or description..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            accessibilityLabel="Search audit trail"
          />
          {search.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => onSearchChange('')}
              style={styles.clearSearchButton}
            >
              <IconSlot value="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Severities Picker */}
        <View style={styles.severityContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.severityScroll}>
            {SEVERITY_OPTIONS.map((opt) => {
              const isSelected = severityFilter.toLowerCase() === opt.key.toLowerCase();
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by severity ${opt.label}`}
                  onPress={() => onSeverityFilterChange(opt.key)}
                  style={[
                    styles.severityPill,
                    isSelected ? styles.severityPillSelected : styles.severityPillUnselected,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.severityText,
                      isSelected ? styles.severityTextSelected : styles.severityTextUnselected,
                    ]}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Date Presets and Date Inputs Row */}
      <View style={styles.controlsRow}>
        <View style={styles.datePresetsGroup}>
          {DATE_PRESETS.map((preset) => {
            const isSelected = datePreset === preset.key;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="button"
                accessibilityLabel={`Date preset ${preset.label}`}
                onPress={() => onDatePresetChange && onDatePresetChange(preset.key)}
                style={[
                  styles.presetButton,
                  isSelected ? styles.presetButtonSelected : styles.presetButtonUnselected,
                ]}
              >
                <ThemedText
                  style={[
                    styles.presetText,
                    isSelected ? styles.presetTextSelected : styles.presetTextUnselected,
                  ]}
                >
                  {preset.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dateInputsContainer}>
          <View style={styles.dateField}>
            <ValidatedDateInput
              value={startDate}
              onChangeText={onStartDateChange}
              boundaryMode="pastOrToday"
              placeholder="Start Date (YYYY-MM-DD)"
              testID="audit-start-date"
              containerStyle={styles.dateInputStyle}
            />
          </View>
          <ThemedText style={styles.dateRangeSeparator}>to</ThemedText>
          <View style={styles.dateField}>
            <ValidatedDateInput
              value={endDate}
              onChangeText={onEndDateChange}
              boundaryMode="pastOrToday"
              placeholder="End Date (YYYY-MM-DD)"
              testID="audit-end-date"
              containerStyle={styles.dateInputStyle}
            />
          </View>
        </View>

        <View style={styles.actionsGroup}>
          <Button
            title="Reset Filters"
            variant="secondary"
            size="sm"
            icon="refresh"
            onPress={onResetFilters}
          />
          {onOpenExport && (
            <Button
              title="Export Log"
              variant="outline"
              size="sm"
              icon="download"
              loading={isExporting}
              onPress={onOpenExport}
            />
          )}
          {onRefresh && (
            <Button
              title="Refresh"
              variant="outline"
              size="sm"
              icon="refresh"
              loading={isRefreshing}
              onPress={onRefresh}
            />
          )}
        </View>
      </View>

      {/* Inline Date Validation Alert */}
      {isDateInvalid && (
        <View style={styles.dateErrorAlert} accessibilityRole="alert">
          <IconSlot value="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
          <ThemedText style={styles.dateErrorText}>
            {dateRangeError || 'Start date cannot exceed end date.'}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  pillsScrollContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  pillSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  pillUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  pillText: {
    ...theme.typography.smallBold,
  },
  pillTextSelected: {
    color: theme.colors.primary,
  },
  pillTextUnselected: {
    color: theme.colors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  searchInputContainer: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    height: theme.sizes.controlMd,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    ...theme.typography.body,
    paddingVertical: 0,
  },
  clearSearchButton: {
    padding: theme.spacing.xs,
  },
  severityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  severityScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  severityPill: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
  },
  severityPillSelected: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderColor: theme.colors.borderDark,
  },
  severityPillUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
  },
  severityText: {
    ...theme.typography.captionBold,
  },
  severityTextSelected: {
    color: theme.colors.text,
  },
  severityTextUnselected: {
    color: theme.colors.textMuted,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  datePresetsGroup: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  presetButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
  },
  presetButtonSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  presetButtonUnselected: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
  },
  presetText: {
    ...theme.typography.captionBold,
  },
  presetTextSelected: {
    color: theme.colors.primary,
  },
  presetTextUnselected: {
    color: theme.colors.textSecondary,
  },
  dateInputsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dateField: {
    width: 140,
  },
  dateInputStyle: {
    marginBottom: 0,
  },
  dateRangeSeparator: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dateErrorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  dateErrorText: {
    color: theme.colors.emergencyText,
    ...theme.typography.captionBold,
  },
});
export default AuditFilterBar;
