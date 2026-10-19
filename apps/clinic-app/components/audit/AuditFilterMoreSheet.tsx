import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import { IconSlot } from '../ui/Icon';
import Modal from '../ui/Modal';
import {
  CATEGORY_PILLS,
  SEVERITY_OPTIONS,
} from './AuditFilterBar';

export interface AuditFilterMoreSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  severityFilter: string;
  onSeverityFilterChange: (sev: string) => void;
  startDate: string;
  endDate: string;
  onOpenDateRangePicker: () => void;
  onResetFilters: () => void;
  activeFiltersCount?: number;
  testID?: string;
}

export default function AuditFilterMoreSheet({
  visible,
  onClose,
  selectedCategory,
  onSelectCategory,
  severityFilter,
  onSeverityFilterChange,
  startDate,
  endDate,
  onOpenDateRangePicker,
  onResetFilters,
  activeFiltersCount = 0,
  testID = 'audit-filter-more-sheet',
}: AuditFilterMoreSheetProps) {
  const dateSummary = startDate && endDate
    ? `${startDate}  →  ${endDate}`
    : startDate
    ? `From ${startDate}`
    : endDate
    ? `Until ${endDate}`
    : 'All Time (No date restrictions)';

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Filter Audit Trail"
      subtitle={activeFiltersCount > 0 ? `${activeFiltersCount} active filter criteria` : 'Configure forensic search criteria'}
      maxWidth={460}
      testID={testID}
      footer={
        <View style={styles.footerContainer}>
          <Button
            title="Reset All"
            variant="ghost"
            size="sm"
            onPress={() => {
              onResetFilters();
            }}
          />
          <Button
            title="Done"
            variant="primary"
            size="sm"
            onPress={onClose}
          />
        </View>
      }
    >
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Severity / Clinical Urgency Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>CLINICAL SEVERITY</ThemedText>
          <View style={styles.severityGrid}>
            {SEVERITY_OPTIONS.map((opt) => {
              const isSelected = severityFilter.toLowerCase() === opt.key.toLowerCase();
              const isStat = opt.key === 'Emergency';
              const isUrgent = opt.key === 'Urgent';
              const isRoutine = opt.key === 'Routine';

              const badgeBg = isSelected
                ? isStat
                  ? theme.colors.emergencyBg
                  : isUrgent
                  ? theme.colors.urgentBg
                  : isRoutine
                  ? theme.colors.routineBg
                  : theme.colors.primaryLight
                : theme.colors.surfaceSubtle;

              const badgeBorder = isSelected
                ? isStat
                  ? theme.colors.emergencyBorder
                  : isUrgent
                  ? theme.colors.urgentBorder
                  : isRoutine
                  ? theme.colors.routineBorder
                  : theme.colors.primary
                : theme.colors.borderLight;

              const textColor = isSelected
                ? isStat
                  ? theme.colors.emergencyText
                  : isUrgent
                  ? theme.colors.urgentText
                  : isRoutine
                  ? theme.colors.routineText
                  : theme.colors.primary
                : theme.colors.textSecondary;

              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by severity ${opt.label}`}
                  onPress={() => onSeverityFilterChange(opt.key)}
                  style={[
                    styles.severityOption,
                    { backgroundColor: badgeBg, borderColor: badgeBorder },
                  ]}
                >
                  <ThemedText style={[styles.severityLabel, { color: textColor }]}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Date Range Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>DATE SPAN</ThemedText>
          <View style={styles.dateRangeBox}>
            <View style={styles.dateSummaryRow}>
              <IconSlot value="calendar" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText style={styles.dateSummaryText}>{dateSummary}</ThemedText>
            </View>
            <Button
              title="Change Date Range"
              variant="outline"
              size="sm"
              icon="calendar"
              onPress={() => {
                onClose();
                onOpenDateRangePicker();
              }}
            />
          </View>
        </View>

        {/* Category Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>CATEGORY & SYSTEM DOMAIN</ThemedText>
          <View style={styles.categoryList}>
            {CATEGORY_PILLS.map((cat) => {
              const isSelected = selectedCategory.toLowerCase() === cat.key.toLowerCase();
              return (
                <Pressable
                  key={cat.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${cat.label}`}
                  onPress={() => onSelectCategory(cat.key)}
                  style={[
                    styles.categoryRow,
                    isSelected ? styles.categoryRowSelected : styles.categoryRowUnselected,
                  ]}
                >
                  <View style={styles.categoryIconWrap}>
                    <IconSlot
                      value={cat.icon}
                      size={theme.sizes.iconSm}
                      color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                    />
                  </View>
                  <View style={styles.categoryTextWrap}>
                    <ThemedText
                      style={[
                        styles.categoryTitle,
                        isSelected ? styles.categoryTitleSelected : styles.categoryTitleUnselected,
                      ]}
                    >
                      {cat.label}
                    </ThemedText>
                    <ThemedText style={styles.categoryDesc}>{cat.description}</ThemedText>
                  </View>
                  {isSelected && (
                    <IconSlot value="check" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.xs,
  },
  sectionTitle: {
    ...theme.typography.captionBold,
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  severityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  severityOption: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityLabel: {
    ...theme.typography.captionBold,
  },
  dateRangeBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  dateSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dateSummaryText: {
    ...theme.typography.smallBold,
    color: theme.colors.text,
  },
  categoryList: {
    gap: theme.spacing.xs,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.sm,
  },
  categoryRowSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  categoryRowUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
  },
  categoryIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  categoryTextWrap: {
    flex: 1,
  },
  categoryTitle: {
    ...theme.typography.smallBold,
  },
  categoryTitleSelected: {
    color: theme.colors.primary,
  },
  categoryTitleUnselected: {
    color: theme.colors.text,
  },
  categoryDesc: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
});
