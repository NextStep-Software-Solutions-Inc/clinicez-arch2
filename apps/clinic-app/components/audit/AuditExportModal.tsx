import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { IconSlot } from '../ui/Icon';
import Badge from '../ui/Badge';

export interface AuditExportModalProps {
  visible: boolean;
  onClose: () => void;
  onExport: (format: 'csv' | 'json', limit: number) => Promise<{ success: boolean; error?: string } | void>;
  isExporting: boolean;
  activeCategory: string;
  activeSeverity: string;
  activeSearch: string;
  startDate: string;
  endDate: string;
}

export function AuditExportModal({
  visible,
  onClose,
  onExport,
  isExporting,
  activeCategory,
  activeSeverity,
  activeSearch,
  startDate,
  endDate,
}: AuditExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [limit, setLimit] = useState<number>(5000);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    const result = await onExport(format, limit);
    if (result && !result.success && result.error) {
      setExportError(result.error);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Export Audit Records"
      subtitle="Generate compliant forensic log stream"
      maxWidth={520}
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={onClose}
            disabled={isExporting}
          />
          <Button
            title={`Export ${format.toUpperCase()}`}
            variant="primary"
            icon="download"
            loading={isExporting}
            onPress={handleExport}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {/* Format Selection */}
        <View style={styles.formGroup}>
          <ThemedText style={styles.formLabel}>Export Format</ThemedText>
          <View style={styles.formatToggleGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export as CSV"
              onPress={() => setFormat('csv')}
              style={[
                styles.formatButton,
                format === 'csv' ? styles.formatButtonSelected : styles.formatButtonUnselected,
              ]}
            >
              <IconSlot
                value="file"
                size={theme.sizes.iconSm}
                color={format === 'csv' ? theme.colors.primary : theme.colors.textSecondary}
              />
              <View style={styles.formatInfo}>
                <ThemedText
                  style={[
                    styles.formatTitle,
                    format === 'csv' ? styles.formatTitleSelected : styles.formatTitleUnselected,
                  ]}
                >
                  CSV (Spreadsheet)
                </ThemedText>
                <ThemedText style={styles.formatDescription}>
                  RFC 4180 with UTF-8 BOM for Microsoft Excel / Sheets
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export as JSON"
              onPress={() => setFormat('json')}
              style={[
                styles.formatButton,
                format === 'json' ? styles.formatButtonSelected : styles.formatButtonUnselected,
              ]}
            >
              <IconSlot
                value="code"
                size={theme.sizes.iconSm}
                color={format === 'json' ? theme.colors.primary : theme.colors.textSecondary}
              />
              <View style={styles.formatInfo}>
                <ThemedText
                  style={[
                    styles.formatTitle,
                    format === 'json' ? styles.formatTitleSelected : styles.formatTitleUnselected,
                  ]}
                >
                  JSON (Raw Stream)
                </ThemedText>
                <ThemedText style={styles.formatDescription}>
                  Full forensic metadata and SHA-256 prose digests
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Limit Selection */}
        <View style={styles.formGroup}>
          <ThemedText style={styles.formLabel}>Maximum Rows Limit</ThemedText>
          <View style={styles.limitButtonGroup}>
            {[1000, 5000, 10000].map((num) => (
              <Pressable
                key={num}
                accessibilityRole="button"
                accessibilityLabel={`Limit to ${num} records`}
                onPress={() => setLimit(num)}
                style={[
                  styles.limitButton,
                  limit === num ? styles.limitButtonSelected : styles.limitButtonUnselected,
                ]}
              >
                <ThemedText
                  style={[
                    styles.limitButtonText,
                    limit === num ? styles.limitButtonTextSelected : styles.limitButtonTextUnselected,
                  ]}
                >
                  {num.toLocaleString()} rows
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Active Filter Scope Summary */}
        <View style={styles.filterSummaryCard}>
          <ThemedText style={styles.filterSummaryTitle}>Export Scope (Active Filters)</ThemedText>
          <View style={styles.scopeRow}>
            <ThemedText style={styles.scopeKey}>Category:</ThemedText>
            <ThemedText style={styles.scopeValue}>{activeCategory}</ThemedText>
          </View>
          <View style={styles.scopeRow}>
            <ThemedText style={styles.scopeKey}>Severity:</ThemedText>
            <ThemedText style={styles.scopeValue}>{activeSeverity}</ThemedText>
          </View>
          {activeSearch ? (
            <View style={styles.scopeRow}>
              <ThemedText style={styles.scopeKey}>Search:</ThemedText>
              <ThemedText style={styles.scopeValue}>{activeSearch}</ThemedText>
            </View>
          ) : null}
          <View style={styles.scopeRow}>
            <ThemedText style={styles.scopeKey}>Date Range:</ThemedText>
            <ThemedText style={styles.scopeValue}>
              {startDate || 'Beginning'} → {endDate || 'Now'}
            </ThemedText>
          </View>
        </View>

        {/* Forensic Regulatory Notice */}
        <View style={styles.noticeCard}>
          <View style={styles.noticeHeader}>
            <IconSlot value="alert" size={theme.sizes.iconSm} color={theme.colors.urgentText} />
            <ThemedText style={styles.noticeTitle}>Auditing the Auditor Notice</ThemedText>
            <Badge variant="urgent" label="STAT Event" size="xs" />
          </View>
          <ThemedText style={styles.noticeText}>
            Exporting audit logs triggers an immutable audit entry (`audit.log.exported`) with your administrator identity, IP address, and timestamp in compliance with DPA RA 10173.
          </ThemedText>
        </View>

        {/* Error Feedback */}
        {exportError && (
          <View style={styles.errorAlert}>
            <IconSlot value="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText style={styles.errorText}>{exportError}</ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  formGroup: {
    gap: theme.spacing.xs,
  },
  formLabel: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  formatToggleGroup: {
    gap: theme.spacing.sm,
  },
  formatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.md,
  },
  formatButtonSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  formatButtonUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  formatInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  formatTitle: {
    ...theme.typography.bodyBold,
  },
  formatTitleSelected: {
    color: theme.colors.primary,
  },
  formatTitleUnselected: {
    color: theme.colors.text,
  },
  formatDescription: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  limitButtonGroup: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  limitButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    alignItems: 'center',
  },
  limitButtonSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  limitButtonUnselected: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
  },
  limitButtonText: {
    ...theme.typography.smallBold,
  },
  limitButtonTextSelected: {
    color: theme.colors.primary,
  },
  limitButtonTextUnselected: {
    color: theme.colors.textSecondary,
  },
  filterSummaryCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  filterSummaryTitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.captionBold,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  scopeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  scopeKey: {
    color: theme.colors.textMuted,
    ...theme.typography.small,
  },
  scopeValue: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  noticeCard: {
    backgroundColor: theme.colors.urgentBg,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.urgentBorder,
    gap: theme.spacing.xs,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  noticeTitle: {
    flex: 1,
    color: theme.colors.urgentText,
    ...theme.typography.smallBold,
  },
  noticeText: {
    color: theme.colors.urgentText,
    ...theme.typography.caption,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  errorText: {
    color: theme.colors.emergencyText,
    ...theme.typography.captionBold,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    width: '100%',
  },
});
export default AuditExportModal;
