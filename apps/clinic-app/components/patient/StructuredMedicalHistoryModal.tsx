import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { TextInput } from '../ui/Text';
import { theme } from '../../constants/theme';

export interface MedicalHistoryItem {
  id?: string;
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  onsetDate?: string | null;
  isResolved?: boolean;
  clinicalNotes?: string | null;
}

export interface PhilHealthMdiseaseDef {
  code: string;
  description: string;
  aliases?: string[];
}

export const PHILHEALTH_MDISEASES_CONDITIONS: PhilHealthMdiseaseDef[] = [
  { code: '001', description: 'Allergy', aliases: ['Allergies'] },
  { code: '002', description: 'Asthma', aliases: ['Bronchial Asthma'] },
  { code: '003', description: 'Cancer', aliases: ['Malignancy', 'Neoplasm'] },
  { code: '004', description: 'Cerebrovascular Disease', aliases: ['Stroke', 'CVA', 'TIA'] },
  { code: '005', description: 'Coronary Artery Disease', aliases: ['CAD', 'Ischemic Heart Disease', 'IHD'] },
  { code: '006', description: 'Diabetes Mellitus', aliases: ['DM', 'Diabetes', 'Type 2 Diabetes', 'T2DM'] },
  { code: '007', description: 'Emphysema', aliases: ['COPD'] },
  { code: '008', description: 'Epilepsy/Seizure Disorder', aliases: ['Epilepsy', 'Seizures', 'Seizure Disorder'] },
  { code: '009', description: 'Hepatitis', aliases: ['Hep B', 'Hep A', 'Viral Hepatitis'] },
  { code: '010', description: 'Hyperlipidemia', aliases: ['Dyslipidemia', 'High Cholesterol'] },
  { code: '011', description: 'Hypertension', aliases: ['HTN', 'High Blood Pressure', 'HBP'] },
  { code: '012', description: 'Peptic Ulcer', aliases: ['PUD', 'Gastric Ulcer', 'Peptic Ulcer Disease'] },
  { code: '013', description: 'Pneumonia', aliases: ['Community Acquired Pneumonia', 'CAP'] },
  { code: '014', description: 'Thyroid Disease', aliases: ['Hypothyroidism', 'Hyperthyroidism', 'Goiter'] },
  { code: '015', description: 'Pulmonary Tuberculosis', aliases: ['PTB', 'Pulmonary TB', 'Tuberculosis'] },
  { code: '016', description: 'Extrapulmonary Tuberculosis', aliases: ['EPTB', 'TB Lymphadenitis'] },
  { code: '017', description: 'Urinary Tract Infection', aliases: ['UTI', 'Cystitis'] },
  { code: '018', description: 'Mental Illness', aliases: ['Depression', 'Anxiety', 'Bipolar'] },
  { code: '998', description: 'Others', aliases: ['Other'] },
];

export const PHILHEALTH_QUICK_CONDITIONS = [
  { code: '011', label: 'Hypertension', title: 'Hypertension' },
  { code: '006', label: 'Diabetes Mellitus', title: 'Diabetes Mellitus' },
  { code: '002', label: 'Asthma', title: 'Asthma' },
  { code: '010', label: 'Hyperlipidemia', title: 'Hyperlipidemia' },
  { code: '015', label: 'Pulmonary TB', title: 'Pulmonary Tuberculosis' },
  { code: '012', label: 'Peptic Ulcer', title: 'Peptic Ulcer' },
];

/**
 * Derives a clean comma-separated chronic conditions summary string for compact display.
 */
export function formatMedicalHistoriesSummary(items?: MedicalHistoryItem[] | null): string {
  if (!items || items.length === 0) return '';
  return items
    .map((item) => {
      const desc = item.specificDescription?.trim();
      return desc ? desc : item.conditionTitle.trim();
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Defensive parser for legacy comma-separated condition strings or JSON structures.
 */
export function parseChronicConditionsStringToStructured(raw?: string | null): MedicalHistoryItem[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (/^(none|no known.*|nil|nkda|none known)$/i.test(trimmed)) return [];

  // Try JSON array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({
            conditionTitle: String(item.conditionTitle || item.title || '').trim(),
            philHealthMdiseaseCode: item.philHealthMdiseaseCode ? String(item.philHealthMdiseaseCode).trim() : null,
            icd10Code: item.icd10Code ? String(item.icd10Code).trim() : null,
            specificDescription: item.specificDescription ? String(item.specificDescription).trim() : null,
            onsetDate: item.onsetDate ? String(item.onsetDate).trim() : null,
            isResolved: Boolean(item.isResolved),
            clinicalNotes: item.clinicalNotes ? String(item.clinicalNotes).trim() : null,
          }))
          .filter((x) => x.conditionTitle.length > 0);
      }
    } catch {}
  }

  // Parse comma-separated summary: "Hypertension, Diabetes Mellitus, Asthma"
  const segments = trimmed.split(/,\s*/);
  const result: MedicalHistoryItem[] = [];

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    // Check if matches known PhilHealth mdisease
    const match = PHILHEALTH_MDISEASES_CONDITIONS.find(
      (c) =>
        c.description.toLowerCase() === s.toLowerCase() ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === s.toLowerCase()))
    );

    if (match) {
      result.push({
        conditionTitle: match.description,
        philHealthMdiseaseCode: match.code,
      });
    } else {
      result.push({
        conditionTitle: s,
        philHealthMdiseaseCode: '998',
        specificDescription: s,
      });
    }
  }

  return result;
}

export interface MedicalHistoryPillListProps {
  items: MedicalHistoryItem[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export const MedicalHistoryPillList: React.FC<MedicalHistoryPillListProps> = ({
  items,
  onRemove,
  readOnly = false,
}) => {
  if (!items || items.length === 0) {
    return (
      <View style={styles.emptyPillContainer}>
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          No past medical conditions documented (Patient has no known chronic illnesses).
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.pillListContainer}>
      {items.map((item, index) => {
        const title = item.specificDescription?.trim() || item.conditionTitle;
        const code = item.philHealthMdiseaseCode;

        return (
          <View key={`${item.conditionTitle}-${index}`} style={styles.pillCard}>
            <View style={styles.pillContent}>
              <View style={styles.badgeRow}>
                {item.icd10Code ? (
                  <Badge
                    label={`ICD: ${item.icd10Code}`}
                    variant="neutral"
                    size="sm"
                  />
                ) : null}
                {item.isResolved ? (
                  <Badge
                    label="Resolved"
                    variant="success"
                    size="sm"
                  />
                ) : null}
              </View>

              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {title}
              </ThemedText>

              {item.clinicalNotes ? (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.notesText}>
                  {item.clinicalNotes}
                </ThemedText>
              ) : null}
            </View>

            {!readOnly && onRemove ? (
              <Pressable
                accessibilityLabel={`Remove ${title}`}
                style={styles.pillRemoveBtn}
                onPress={() => onRemove(index)}
                hitSlop={8}
              >
                <Icon name="close" size={14} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

export interface StructuredMedicalHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  conditions?: MedicalHistoryItem[];
  onChange?: (conditions: MedicalHistoryItem[]) => void;
  title?: string;
}

export default function StructuredMedicalHistoryModal({
  visible,
  onClose,
  conditions = [],
  onChange,
  title = 'Past Medical History & Chronic Conditions',
}: StructuredMedicalHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConditions, setSelectedConditions] = useState<MedicalHistoryItem[]>(conditions);

  // Custom condition form state
  const [customTitle, setCustomTitle] = useState('');
  const [customIcd10, setCustomIcd10] = useState('');
  const [customNotes, setCustomNotes] = useState('');

  // Sync incoming props
  React.useEffect(() => {
    setSelectedConditions(conditions);
  }, [conditions, visible]);

  const filteredStatutory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return PHILHEALTH_MDISEASES_CONDITIONS.filter((c) => c.code !== '998');
    return PHILHEALTH_MDISEASES_CONDITIONS.filter(
      (c) =>
        c.description.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(q)))
    );
  }, [searchQuery]);

  const isConditionSelected = (code: string, titleStr: string) => {
    return selectedConditions.some(
      (c) =>
        (code && c.philHealthMdiseaseCode === code) ||
        c.conditionTitle.trim().toLowerCase() === titleStr.trim().toLowerCase()
    );
  };

  const toggleStatutoryCondition = (def: PhilHealthMdiseaseDef) => {
    const exists = isConditionSelected(def.code, def.description);
    let updated: MedicalHistoryItem[];

    if (exists) {
      updated = selectedConditions.filter(
        (c) =>
          c.philHealthMdiseaseCode !== def.code &&
          c.conditionTitle.trim().toLowerCase() !== def.description.trim().toLowerCase()
      );
    } else {
      updated = [
        ...selectedConditions,
        {
          conditionTitle: def.description,
          philHealthMdiseaseCode: def.code,
        },
      ];
    }

    setSelectedConditions(updated);
    onChange?.(updated);
  };

  const handleAddCustomCondition = () => {
    const trimmedTitle = customTitle.trim();
    if (!trimmedTitle) return;

    const alreadyExists = selectedConditions.some(
      (c) =>
        (c.specificDescription || c.conditionTitle).trim().toLowerCase() ===
        trimmedTitle.toLowerCase()
    );
    if (alreadyExists) return;

    const newCond: MedicalHistoryItem = {
      conditionTitle: trimmedTitle,
      philHealthMdiseaseCode: '998', // Others
      specificDescription: trimmedTitle,
      icd10Code: customIcd10.trim() || undefined,
      clinicalNotes: customNotes.trim() || undefined,
    };

    const updated = [...selectedConditions, newCond];
    setSelectedConditions(updated);
    onChange?.(updated);

    // Reset inputs
    setCustomTitle('');
    setCustomIcd10('');
    setCustomNotes('');
  };

  const handleRemoveCondition = (index: number) => {
    const updated = selectedConditions.filter((_, i) => i !== index);
    setSelectedConditions(updated);
    onChange?.(updated);
  };

  const handleClearAll = () => {
    setSelectedConditions([]);
    onChange?.([]);
  };

  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <View style={styles.modalBody}>
        <View style={styles.headerInfo}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Document patient's chronic conditions, medical history, and diagnoses.
          </ThemedText>
        </View>

        {/* Selected Conditions Pills View */}
        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Documented Conditions ({selectedConditions.length})
          </ThemedText>
          {selectedConditions.length > 0 ? (
            <Button
              title="Clear All"
              variant="outline"
              size="sm"
              onPress={handleClearAll}
            />
          ) : null}
        </View>

        <View style={styles.activePillsBox}>
          {selectedConditions.length === 0 ? (
            <View style={styles.emptyPillContainer}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                No conditions selected yet. Tap standard conditions below or add a custom diagnosis.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.compactChipsWrap}>
              {selectedConditions.map((item, index) => {
                const title = item.specificDescription?.trim() || item.conditionTitle;
                return (
                  <View key={`${item.conditionTitle}-${index}`} style={styles.compactSelectedChip}>
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      {title}
                    </ThemedText>
                    {item.icd10Code ? (
                      <Badge
                        label={`ICD: ${item.icd10Code}`}
                        variant="neutral"
                        size="sm"
                      />
                    ) : null}
                    <Pressable
                      accessibilityLabel={`Remove ${title}`}
                      style={styles.compactRemoveBtn}
                      onPress={() => handleRemoveCondition(index)}
                      hitSlop={8}
                    >
                      <Icon name="close" size={12} color={theme.colors.primaryDark} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search conditions (e.g. Hypertension, Asthma)..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search"
          />
        </View>

        {/* Catalog Selector Grid */}
        <ScrollView style={styles.catalogScroll} showsVerticalScrollIndicator={true}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.catalogSubtitle}>
            Standard Medical Conditions
          </ThemedText>

          <View style={styles.catalogGrid}>
            {filteredStatutory.map((item) => {
              const active = isConditionSelected(item.code, item.description);
              return (
                <Pressable
                  key={item.code}
                  style={[
                    styles.catalogItem,
                    active && styles.catalogItemActive,
                  ]}
                  onPress={() => toggleStatutoryCondition(item)}
                >
                  <View style={styles.catalogItemContent}>
                    <ThemedText
                      variant={active ? 'bodyBold' : 'body'}
                      color={active ? theme.colors.primary : theme.colors.text}
                      style={styles.catalogItemTitle}
                    >
                      {item.description}
                    </ThemedText>
                  </View>
                  {active ? (
                    <Icon name="check" size={16} color={theme.colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Custom Condition Intake Section */}
          <View style={styles.customIntakeSection}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.customSectionTitle}>
              + Add Custom Diagnosis / Other Condition
            </ThemedText>

            <View style={styles.customInputRow}>
              <View style={styles.customTitleInput}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Condition Name / Diagnosis (e.g. Chronic Kidney Disease Stage 3)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={customTitle}
                  onChangeText={setCustomTitle}
                />
              </View>
              <View style={styles.customIcdInput}>
                <TextInput
                  style={styles.textInput}
                  placeholder="ICD-10 (e.g. N18.3)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={customIcd10}
                  onChangeText={setCustomIcd10}
                />
              </View>
            </View>

            <TextInput
              style={[styles.textInput, styles.notesInput]}
              placeholder="Clinical notes, medication control, or severity details..."
              placeholderTextColor={theme.colors.textMuted}
              value={customNotes}
              onChangeText={setCustomNotes}
            />

            <View style={styles.customBtnRow}>
              <Button
                title="+ Add Custom Diagnosis"
                variant="outline"
                size="sm"
                icon="plus"
                onPress={handleAddCustomCondition}
                disabled={!customTitle.trim()}
              />
            </View>
          </View>
        </ScrollView>

        {/* Modal Footer */}
        <View style={styles.modalFooter}>
          <Button
            title="Done"
            variant="primary"
            size="md"
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    maxHeight: 650,
  },
  headerInfo: {
    marginBottom: theme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  activePillsBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    minHeight: 48,
  },
  compactChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  compactSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1,
    borderRadius: theme.radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  compactRemoveBtn: {
    padding: 2,
    marginLeft: 2,
  },
  searchContainer: {
    marginBottom: theme.spacing.sm,
  },
  catalogSubtitle: {
    marginBottom: theme.spacing.xs,
  },
  catalogScroll: {
    maxHeight: 340,
  },
  catalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '49%',
    minWidth: 200,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  catalogItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  catalogItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  catalogItemTitle: {
    flex: 1,
  },
  customIntakeSection: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  customSectionTitle: {
    marginBottom: theme.spacing.xs,
  },
  customInputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  customTitleInput: {
    flex: 2,
  },
  customIcdInput: {
    flex: 1,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    color: theme.colors.text,
  },
  notesInput: {
    marginBottom: theme.spacing.xs,
  },
  customBtnRow: {
    alignItems: 'flex-end',
  },
  modalFooter: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  emptyPillContainer: {
    paddingVertical: theme.spacing.xs,
  },
  pillListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  pillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    gap: theme.spacing.sm,
  },
  pillContent: {
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notesText: {
    maxWidth: 220,
  },
  pillRemoveBtn: {
    padding: 2,
    marginLeft: 4,
  },
});
