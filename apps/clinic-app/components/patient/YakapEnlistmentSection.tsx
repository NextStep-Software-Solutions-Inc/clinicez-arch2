import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import ValidatedDateInput from '../ui/ValidatedDateInput';
import Modal from '../ui/Modal';
import SegmentedControl from '../ui/SegmentedControl';
import { theme } from '../../constants/theme';
import {
  getYakapEnlistments,
  getActiveYakapEnlistment,
  recordAnnualRenewal,
  formatYakapStatusBadge,
  formatYakapSourceLabel,
  toIsoDateString,
  type YakapEnlistmentEntry,
  type YakapEnlistmentSource,
} from '../../utils/yakapEnlistment';
import { notify } from '../../utils/feedback';

export interface YakapEnlistmentSectionProps {
  customFields?: Record<string, any> | null;
  onCustomFieldsChange?: (nextCustomFields: Record<string, any>) => void;
  readOnly?: boolean;
}

export function YakapEnlistmentSection({
  customFields,
  onCustomFieldsChange,
  readOnly = false,
}: YakapEnlistmentSectionProps) {
  const enlistments = getYakapEnlistments(customFields);
  const activeEnlistment = getActiveYakapEnlistment(enlistments);
  const currentYear = new Date().getFullYear();

  // Renewal dialog state
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [renewalYear, setRenewalYear] = useState(
    activeEnlistment
      ? String(parseInt(activeEnlistment.effective_year, 10) + 1)
      : String(currentYear)
  );
  const [renewalEnlistDate, setRenewalEnlistDate] = useState(toIsoDateString());
  const [renewalValidUntil, setRenewalValidUntil] = useState(`${renewalYear}-12-31`);
  const [renewalSource, setRenewalSource] = useState<YakapEnlistmentSource>('ClinicEnlistment');
  const [historyOpen, setHistoryOpen] = useState(false);

  const statusBadge = formatYakapStatusBadge(activeEnlistment?.status);

  const handleOpenRenewal = () => {
    const nextYear = activeEnlistment
      ? String(parseInt(activeEnlistment.effective_year, 10) + 1)
      : String(currentYear);
    setRenewalYear(nextYear);
    setRenewalEnlistDate(toIsoDateString());
    setRenewalValidUntil(`${nextYear}-12-31`);
    setRenewalSource('ClinicEnlistment');
    setRenewalModalVisible(true);
  };

  const handleConfirmRenewal = () => {
    const trimmedYear = renewalYear.trim();
    if (!trimmedYear || !/^\d{4}$/.test(trimmedYear)) {
      notify.error('Please enter a valid 4-digit benefit year.');
      return;
    }

    const updatedCustomFields = { ...(customFields || {}) };
    recordAnnualRenewal(updatedCustomFields, {
      effectiveYear: trimmedYear,
      enlistedAt: renewalEnlistDate,
      validUntil: renewalValidUntil,
      source: renewalSource,
    });

    onCustomFieldsChange?.(updatedCustomFields);
    setRenewalModalVisible(false);
    notify.success(`Recorded PhilHealth YAKAP renewal for benefit year ${trimmedYear}.`);
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            PhilHealth Konsulta (YAKAP) Annual Enlistment
          </ThemedText>
        </View>
        <Badge
          label={statusBadge.label}
          variant={statusBadge.variant}
          size="sm"
          icon={statusBadge.icon}
        />
      </View>

      {/* Active Enlistment Details Card */}
      {activeEnlistment ? (
        <View style={styles.activeCard}>
          <View style={styles.cardHeaderRow}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              {activeEnlistment.effective_year} Benefit Year
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Source: {formatYakapSourceLabel(activeEnlistment.source)}
            </ThemedText>
          </View>

          <View style={styles.datesRow}>
            <View style={styles.dateCol}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Enlistment Date:
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                {activeEnlistment.enlisted_at}
              </ThemedText>
            </View>
            <View style={styles.dateCol}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Valid Until:
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                {activeEnlistment.valid_until}
              </ThemedText>
            </View>
          </View>

          {/* Read-Only Allocated Control Numbers */}
          <ThemedText
            variant="captionBold"
            color={theme.colors.textSecondary}
            style={styles.controlNoHeader}
          >
            Allocated Journey Control Numbers (Read-Only)
          </ThemedText>
          <View style={styles.controlNumbersWrap}>
            <View style={styles.controlNoBox}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Case Number (pHciCaseNo)
              </ThemedText>
              <ThemedText
                variant="captionBold"
                color={activeEnlistment.case_no ? theme.colors.primaryDark : theme.colors.textMuted}
              >
                {activeEnlistment.case_no || 'Pending Encounter'}
              </ThemedText>
            </View>
            <View style={styles.controlNoBox}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Enlistment Trans No (pHciTransNo)
              </ThemedText>
              <ThemedText
                variant="captionBold"
                color={activeEnlistment.enlistment_no ? theme.colors.primaryDark : theme.colors.textMuted}
              >
                {activeEnlistment.enlistment_no || 'Pending Encounter'}
              </ThemedText>
            </View>
            <View style={styles.controlNoBox}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Profiling Trans No (pHciTransNo)
              </ThemedText>
              <ThemedText
                variant="captionBold"
                color={activeEnlistment.profiling_trans_no ? theme.colors.primaryDark : theme.colors.textMuted}
              >
                {activeEnlistment.profiling_trans_no || 'Pending Encounter'}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="captionBold" color={theme.colors.warningText}>
              No Active YAKAP Enlistment Covering Current Date
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Statutory policy requires an explicit annual enlistment record prior to assigning journey numbers.
            </ThemedText>
          </View>
        </View>
      )}

      {/* Actions Row */}
      {!readOnly && (
        <View style={styles.actionsRow}>
          <Button
            title="Record Annual Renewal"
            variant="outline"
            size="sm"
            icon="refresh"
            onPress={handleOpenRenewal}
          />
          {enlistments.length > 1 && (
            <Button
              title={historyOpen ? 'Hide History' : `View All Years (${enlistments.length})`}
              variant="ghost"
              size="sm"
              onPress={() => setHistoryOpen(!historyOpen)}
            />
          )}
        </View>
      )}

      {/* Historical Benefit Periods List */}
      {historyOpen && enlistments.length > 1 && (
        <View style={styles.historySection}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Historical Benefit Periods
          </ThemedText>
          {enlistments.map((entry, idx) => (
            <View key={`${entry.effective_year}-${idx}`} style={styles.historyRow}>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                {entry.effective_year}:
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {entry.enlisted_at} to {entry.valid_until} • {entry.status} • Case: {entry.case_no || 'None'}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {/* Renewal Dialog Modal */}
      <Modal
        visible={renewalModalVisible}
        onClose={() => setRenewalModalVisible(false)}
        title="Record PhilHealth YAKAP Annual Renewal"
        subtitle="Record a statutory renewal for a new benefit year. Prior years will be preserved for audit compliance."
        maxWidth={480}
      >
        <View style={styles.modalContent}>
          <Input
            label="Benefit Year *"
            value={renewalYear}
            onChangeText={(val) => {
              setRenewalYear(val);
              if (/^\d{4}$/.test(val.trim())) {
                setRenewalValidUntil(`${val.trim()}-12-31`);
              }
            }}
            placeholder="YYYY (e.g. 2027)"
          />

          <ValidatedDateInput
            label="Enlistment Date *"
            value={renewalEnlistDate}
            onChangeText={setRenewalEnlistDate}
            boundaryMode="pastOrToday"
            placeholder="YYYY-MM-DD"
          />

          <ValidatedDateInput
            label="Valid Until *"
            value={renewalValidUntil}
            onChangeText={setRenewalValidUntil}
            placeholder="YYYY-MM-DD"
          />

          <View style={{ gap: 4 }}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Registration Source
            </ThemedText>
            <SegmentedControl
              options={[
                { value: 'ClinicEnlistment', label: 'In-Clinic' },
                { value: 'SelfReported', label: 'Self-Reported' },
                { value: 'PhilHealthMasterlist', label: 'Masterlist' },
              ]}
              value={renewalSource}
              onChange={(val) => setRenewalSource(val as YakapEnlistmentSource)}
            />
          </View>

          <View style={styles.modalButtonsRow}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              onPress={() => setRenewalModalVisible(false)}
            />
            <Button
              title="Confirm Renewal"
              variant="primary"
              size="md"
              onPress={handleConfirmRenewal}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default YakapEnlistmentSection;

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  activeCard: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.xs,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datesRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  dateCol: {
    flex: 1,
  },
  controlNoHeader: {
    marginTop: theme.spacing.xs,
  },
  controlNumbersWrap: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  controlNoBox: {
    flex: 1,
    minWidth: 140,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  historySection: {
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  modalContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
