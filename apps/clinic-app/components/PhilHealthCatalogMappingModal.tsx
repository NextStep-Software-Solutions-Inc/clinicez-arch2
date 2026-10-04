import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Modal, Pressable, TextInput, Alert } from 'react-native';
import ThemedText from './ui/ThemedText';

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

interface FormularyQuickItem {
  code: string;
  name: string;
  category: string;
}

const CORE_GAMOT_FORMULARY: FormularyQuickItem[] = [
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

const STATUTORY_YAKAP_DIAGNOSTICS: FormularyQuickItem[] = [
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
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.headerBar}>
            <View>
              <View style={styles.titleRow}>
                <ThemedText style={styles.titleText}>Map to PhilHealth Statutory Catalog</ThemedText>
                <ThemedText style={styles.badgeText}>Yakap / Konsulta Compliant</ThemedText>
              </View>
              <ThemedText style={styles.subText}>
                Tenant Option: <ThemedText style={{ fontWeight: '800', color: '#111827' }}>{itemName}</ThemedText> •{' '}
                {itemType === 'Medicine' ? 'GAMOT Formulary (lib_medicine)' : '13 Yakap Diagnostics (lib_diagnostic)'}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <ThemedText style={styles.closeBtnText}>✕</ThemedText>
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={styles.searchSection}>
            <ThemedText style={styles.sectionLabel}>Search Official PhilHealth Catalog</ThemedText>
            <TextInput
              style={styles.searchInput}
              placeholder={itemType === 'Medicine' ? 'Search molecule, dosage, or UPSC...' : 'Search diagnostic test...'}
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Selected Preview Box */}
          <View style={[styles.previewBox, isNonFormulary && styles.previewBoxNonFormulary]}>
            <View style={styles.previewHeader}>
              <ThemedText style={styles.previewTitle}>
                {isNonFormulary ? '⚠️ NON-FORMULARY OUT-OF-POCKET' : '✓ BOUND PHILHEALTH STATUTORY CODE'}
              </ThemedText>
              <ThemedText style={styles.previewCodeBadge}>{selectedCode || 'UNBOUND'}</ThemedText>
            </View>
            <ThemedText style={styles.previewDesc}>
              {selectedDesc || 'No PhilHealth statutory equivalent selected yet. Choose an option below.'}
            </ThemedText>
            {selectedCode && (
              <ThemedText style={styles.xmlSnippet}>
                {itemType === 'Medicine'
                  ? `<MEDICINE pDrugCode="${selectedCode}" pGenericName="${initialGenericName || itemName}" />`
                  : `<DIAGNOSTIC pDiagnosticCode="${selectedCode}" />`}
              </ThemedText>
            )}
          </View>

          {/* Options List */}
          <ThemedText style={[styles.sectionLabel, { marginTop: 12 }]}>
            Available PhilHealth Catalog Matches ({filteredList.length})
          </ThemedText>
          <ScrollView style={styles.optionsScroll}>
            {filteredList.map((item) => {
              const isSelected = selectedCode === item.code && !isNonFormulary;
              return (
                <Pressable
                  key={item.code}
                  style={[styles.optionCard, isSelected && styles.optionCardActive]}
                  onPress={() => handleSelectOption(item)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.optionName, isSelected && styles.optionNameActive]}>
                      {item.name}
                    </ThemedText>
                    <ThemedText style={styles.optionCode}>{item.code}</ThemedText>
                  </View>
                  <View style={styles.catBadge}>
                    <ThemedText style={styles.catBadgeText}>{item.category}</ThemedText>
                  </View>
                </Pressable>
              );
            })}

            {/* Non-Formulary Fallback Option */}
            <Pressable
              style={[styles.nonFormularyCard, isNonFormulary && styles.nonFormularyCardActive]}
              onPress={handleSelectNonFormulary}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.nonFormularyTitle}>
                  Mark as Non-Formulary / Category P (Private / Out of Pocket)
                </ThemedText>
                <ThemedText style={styles.nonFormularySubtitle}>
                  Item will remain active for clinic private sales, but flagged as out-of-pocket for Yakap packages.
                </ThemedText>
              </View>
              {isNonFormulary && <ThemedText style={styles.checkIcon}>✓</ThemedText>}
            </Pressable>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footerRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, (!selectedCode && !isNonFormulary) && styles.saveBtnDisabled]}
              onPress={handleConfirm}
              disabled={!selectedCode && !isNonFormulary}
            >
              <ThemedText style={styles.saveBtnText}>✓ Save & Bind Statutory Code</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 16,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  searchSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  searchInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  previewBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  previewBoxNonFormulary: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  previewCodeBadge: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#0284C7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  previewDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  xmlSnippet: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#475569',
    marginTop: 6,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  optionsScroll: {
    maxHeight: 280,
  },
  optionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  optionCardActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  optionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  optionNameActive: {
    color: '#0369A1',
  },
  optionCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6B7280',
    marginTop: 2,
  },
  catBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  nonFormularyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D97706',
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    marginTop: 8,
    marginBottom: 8,
  },
  nonFormularyCardActive: {
    borderColor: '#B45309',
    backgroundColor: '#FEF3C7',
  },
  nonFormularyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  nonFormularySubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  checkIcon: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B45309',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284C7',
  },
  saveBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
