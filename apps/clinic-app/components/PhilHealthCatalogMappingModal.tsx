import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, Badge, Icon, EmptyState, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';

export interface CatalogMappingResult {
  code: string;
  description: string;
  category?: string;
  isNonFormulary?: boolean;
}

interface PhilHealthCatalogMappingModalProps {
  visible: boolean;
  onClose: () => void;
  itemName: string;
  itemType: 'Medicine' | 'Diagnostic';
  initialGenericName?: string;
  initialDosage?: string;
  onSaveMapping: (mapping: CatalogMappingResult) => void;
}

export interface FormularyQuickItem {
  code: string;
  name: string;
  category: string;
}

export const CORE_GAMOT_FORMULARY: FormularyQuickItem[] = [
  { code: 'AMLOD0000000005TAB00000000100', name: 'Amlodipine 5mg Tablet', category: 'Antihypertensive' },
  { code: 'AMLOD0000000010TAB00000000100', name: 'Amlodipine 10mg Tablet', category: 'Antihypertensive' },
  { code: 'LOSAR0000000050TAB00000000100', name: 'Losartan Potassium 50mg Tablet', category: 'Antihypertensive' },
  { code: 'LOSAR0000000100TAB00000000100', name: 'Losartan Potassium 100mg Tablet', category: 'Antihypertensive' },
  { code: 'METFO0000000500TAB00000000100', name: 'Metformin HCl 500mg Tablet', category: 'Antidiabetic' },
  { code: 'GLICL0000000080TAB00000000100', name: 'Gliclazide 80mg Tablet', category: 'Antidiabetic' },
  { code: 'SIMVA0000000020TAB00000000100', name: 'Simvastatin 20mg Tablet', category: 'Lipid-Lowering' },
  { code: 'ATORV0000000020TAB00000000100', name: 'Atorvastatin 20mg Tablet', category: 'Lipid-Lowering' },
  { code: 'SALBU0000000100INH00000000001', name: 'Salbutamol 100mcg/dose MDI Inhaler', category: 'Respiratory / Asthma' },
  { code: 'AMOXC0000000500CAP00000000100', name: 'Amoxicillin 500mg Capsule', category: 'Antibiotic' },
  { code: 'COAMO0000000625TAB00000000100', name: 'Co-Amoxiclav 625mg Tablet', category: 'Antibiotic' },
  { code: 'AZITH0000000500TAB00000000003', name: 'Azithromycin 500mg Tablet', category: 'Antibiotic' },
  { code: 'PARAC0000000500TAB00000000100', name: 'Paracetamol 500mg Tablet', category: 'Analgesic / Antipyretic' },
  { code: 'IBUPR0000000200TAB00000000100', name: 'Ibuprofen 200mg Tablet', category: 'NSAID / Analgesic' },
  { code: 'OMEPZ0000000020CAP00000000100', name: 'Omeprazole 20mg Capsule', category: 'Gastrointestinal' },
  { code: 'ORSOL0000000000SACH0000000025', name: 'Oral Rehydration Salts (ORS) Sachet', category: 'Fluid & Electrolyte' },
];

export const STATUTORY_YAKAP_DIAGNOSTICS: FormularyQuickItem[] = [
  { code: '1', name: 'Complete Blood Count (CBC) with Platelet', category: 'Mandatory Lab' },
  { code: '2', name: 'Routine Urinalysis', category: 'Mandatory Lab' },
  { code: '3', name: 'Fecalysis / Stool Exam', category: 'Mandatory Lab' },
  { code: '4', name: 'Sputum Microscopy / GeneXpert (TB)', category: 'Mandatory Lab' },
  { code: '5', name: 'Fasting Blood Sugar (FBS)', category: 'Mandatory Lab' },
  { code: '6', name: 'Random Blood Sugar (RBS)', category: 'Mandatory Lab' },
  { code: '7', name: 'Oral Glucose Tolerance Test (OGTT)', category: 'Specialized Lab' },
  { code: '8', name: 'Lipid Profile (Chol, HDL, LDL, Trig)', category: 'Mandatory Lab' },
  { code: '9', name: 'Serum Creatinine & eGFR', category: 'Mandatory Lab' },
  { code: '10', name: 'HbA1c (Glycated Hemoglobin)', category: 'Specialized Lab' },
  { code: '11', name: 'Chest X-Ray (PA View)', category: 'Imaging' },
  { code: '12', name: 'Electrocardiogram (12-Lead ECG)', category: 'Diagnostic Cardio' },
  { code: '13', name: 'Pap Smear / VIA (Cervical Screening)', category: 'Preventive Screening' },
  { code: '99', name: 'Other Diagnostic Exam (Non-Mandatory)', category: 'Other Diagnostics' },
];

export default function PhilHealthCatalogMappingModal({
  visible,
  onClose,
  itemName,
  itemType,
  initialGenericName,
  initialDosage,
  onSaveMapping,
}: PhilHealthCatalogMappingModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedDesc, setSelectedDesc] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [isNonFormulary, setIsNonFormulary] = useState(false);

  useEffect(() => {
    if (visible) {
      // Auto-suggest matching based on item name or generic name
      const query = initialGenericName || itemName || '';
      setSearchQuery(query);
      autoSuggest(query);
    }
  }, [visible, itemName, initialGenericName]);

  const autoSuggest = (q: string) => {
    const list = itemType === 'Medicine' ? CORE_GAMOT_FORMULARY : STATUTORY_YAKAP_DIAGNOSTICS;
    const lower = q.toLowerCase();
    const match = list.find((item) =>
      item.name.toLowerCase().includes(lower) ||
      (initialGenericName && item.name.toLowerCase().includes(initialGenericName.toLowerCase()))
    );
    if (match) {
      setSelectedCode(match.code);
      setSelectedDesc(match.name);
      setSelectedCat(match.category);
      setIsNonFormulary(false);
    } else {
      setSelectedCode('');
      setSelectedDesc('');
      setSelectedCat('');
      setIsNonFormulary(false);
    }
  };

  const handleSelectOption = (item: FormularyQuickItem) => {
    setSelectedCode(item.code);
    setSelectedDesc(item.name);
    setSelectedCat(item.category);
    setIsNonFormulary(false);
  };

  const handleSelectNonFormulary = () => {
    setSelectedCode(itemType === 'Medicine' ? 'NOMED0000000000000000000000000' : '99');
    setSelectedDesc(`${itemName} (Non-Formulary / Out of Pocket)`);
    setSelectedCat('Non-Yakap Out-of-Pocket');
    setIsNonFormulary(true);
  };

  const handleConfirm = () => {
    if (!selectedCode && !isNonFormulary) {
      Alert.alert('Selection Required', 'Please select an equivalent PhilHealth catalog code or mark as Non-Formulary.');
      return;
    }
    onSaveMapping({
      code: selectedCode,
      description: selectedDesc,
      category: selectedCat,
      isNonFormulary,
    });
    onClose();
  };

  const list = itemType === 'Medicine' ? CORE_GAMOT_FORMULARY : STATUTORY_YAKAP_DIAGNOSTICS;
  const filteredList = list.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });


  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Map to PhilHealth catalog"
      subtitle={`${itemName} · ${itemType === 'Medicine' ? 'GAMOT formulary' : 'Yakap diagnostics'}`}
      maxWidth={680}
      maxHeight="90%"
      footer={
        <View style={styles.footerRow}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title="Save mapping"
            onPress={handleConfirm}
            disabled={!selectedCode && !isNonFormulary}
          />
        </View>
      }
    >
      {/* Search Bar */}
      <Input
        label="Search the PhilHealth catalog"
        leftIcon="search"
        placeholder={itemType === 'Medicine' ? 'Search by molecule, dosage or code' : 'Search diagnostic test'}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Selected Preview Box */}
      <View style={[styles.previewBox, isNonFormulary && styles.previewBoxNonFormulary]}>
        <View style={styles.previewHeader}>
          <ThemedText variant="captionBold" color={isNonFormulary ? theme.colors.warningText : theme.colors.primaryDark}>
            {isNonFormulary ? 'Non-formulary, out of pocket' : 'Selected PhilHealth code'}
          </ThemedText>
          <ThemedText variant="code" color={theme.colors.primary} style={styles.previewCodeBadge}>
            {selectedCode || 'Not selected'}
          </ThemedText>
        </View>
        <ThemedText variant="bodyBold">
          {selectedDesc || 'No PhilHealth equivalent selected yet. Choose an option below.'}
        </ThemedText>
        {selectedCode ? (
          <ThemedText variant="code" color={theme.colors.textSecondary} style={styles.xmlSnippet}>
            {itemType === 'Medicine'
              ? `<MEDICINE pDrugCode="${selectedCode}" pGenericName="${initialGenericName || itemName}" />`
              : `<DIAGNOSTIC pDiagnosticCode="${selectedCode}" />`}
          </ThemedText>
        ) : null}
      </View>

      {/* Options List */}
      <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
        Matching catalog entries ({filteredList.length})
      </ThemedText>
      <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} nestedScrollEnabled>
        {filteredList.length === 0 ? (
          <EmptyState
            icon="search"
            title="No catalog entries match"
            description="Try a different search, or mark the item as non-formulary below."
          />
        ) : (
          filteredList.map((item) => {
            const isSelected = selectedCode === item.code && !isNonFormulary;
            return (
              <Pressable
                key={item.code}
                style={[styles.optionCard, isSelected && styles.optionCardActive]}
                onPress={() => handleSelectOption(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.optionText}>
                  <ThemedText variant="bodyBold" color={isSelected ? theme.colors.primaryDark : theme.colors.text}>
                    {item.name}
                  </ThemedText>
                  <ThemedText variant="code" color={theme.colors.textMuted}>
                    {item.code}
                  </ThemedText>
                </View>
                <Badge label={item.category} variant="neutral" />
              </Pressable>
            );
          })
        )}

        {/* Non-Formulary Fallback Option */}
        <Pressable
          style={[styles.nonFormularyCard, isNonFormulary && styles.nonFormularyCardActive]}
          onPress={handleSelectNonFormulary}
          accessibilityRole="button"
          accessibilityState={{ selected: isNonFormulary }}
        >
          <View style={styles.optionText}>
            <ThemedText variant="smallBold" color={theme.colors.warningText}>
              Mark as non-formulary (private / out of pocket)
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.warningText}>
              The item stays active for private clinic sales but is flagged as out of pocket for Yakap packages.
            </ThemedText>
          </View>
          {isNonFormulary && <Icon name="check" size={theme.sizes.iconMd} color={theme.colors.warningText} />}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  previewBox: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  previewBoxNonFormulary: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  previewCodeBadge: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    overflow: 'hidden',
  },
  xmlSnippet: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceHighlight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  optionsScroll: {
    maxHeight: 280,
  },
  optionsContent: {
    gap: theme.spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  },
  optionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  nonFormularyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderStyle: 'dashed',
    borderColor: theme.colors.warning,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBg,
  },
  nonFormularyCardActive: {
    borderStyle: 'solid',
    borderColor: theme.colors.warningText,
  },
});
