import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import ThemedText from './ui/ThemedText';
import { clinicService, BulkImportServiceItem, BulkImportResult } from '../services/clinicService';
import PhilHealthCatalogMappingModal, {
  CatalogMappingResult,
  CORE_GAMOT_FORMULARY,
  STATUTORY_YAKAP_DIAGNOSTICS,
} from './PhilHealthCatalogMappingModal';

interface CsvCatalogImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportSuccess: (result: BulkImportResult) => void;
}

export interface ParsedImportRow extends BulkImportServiceItem {
  id: string; // temporary row key
  mappingStatus: 'Mapped' | 'NeedsMapping' | 'NonFormulary' | 'N/A';
}

const SAMPLE_CSV = `Code,Name,Category,StandardPrice,Description,PhilHealthCode
MED-AMOX-500,Amoxicillin 500mg Capsule,Medicine,15.00,Broad-spectrum penicillin antibiotic,AMOXC0000000500CAP00000000100
MED-LOSAR-50,Losartan Potassium 50mg Tablet,Medicine,18.00,Angiotensin receptor blocker,LOSAR0000000050TAB00000000100
MED-METFO-500,Metformin HCl 500mg Tablet,Medicine,10.00,Oral antidiabetic biguanide,
MED-CUSTOM-SYRUP,Herbal Cough Tonic 120ml,Medicine,120.00,Over the counter private brand syrup,
DIAG-CBC,Complete Blood Count with Platelet,Diagnostic,250.00,Automated 5-part differential CBC,1
DIAG-FBS,Fasting Blood Sugar Test,Diagnostic,180.00,Enzymatic glucose assay,
DIAG-CHEST-PA,Chest X-Ray PA View,Diagnostic,450.00,Digital radiograph,11
PROC-NEB,Nebulization Therapy Session,Procedure,250.00,Single dose salbutamol nebulization,
CONS-GEN,General Medical Consultation,Consultation,500.00,Outpatient comprehensive consult,`;

export default function CsvCatalogImportModal({
  visible,
  onClose,
  onImportSuccess,
}: CsvCatalogImportModalProps) {
  const [csvRawText, setCsvRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  // PhilHealth Catalog Mapping Modal Sub-Dialog State
  const [activeMappingRowId, setActiveMappingRowId] = useState<string | null>(null);

  const activeMappingRow = parsedRows.find((r) => r.id === activeMappingRowId);

  const handleLoadSample = () => {
    setCsvRawText(SAMPLE_CSV.trim());
  };

  const autoMatchPhilHealth = (name: string, category: string, explicitCode?: string): {
    code?: string;
    desc?: string;
    isFormulary: boolean;
    status: 'Mapped' | 'NeedsMapping' | 'NonFormulary' | 'N/A';
  } => {
    const isMed = category.toLowerCase() === 'medicine';
    const isDiag = category.toLowerCase() === 'diagnostic';

    if (!isMed && !isDiag) {
      return { isFormulary: false, status: 'N/A' };
    }

    // If explicit PhilHealth code was given in CSV
    if (explicitCode && explicitCode.trim()) {
      const codeTrimmed = explicitCode.trim();
      const list = isMed ? CORE_GAMOT_FORMULARY : STATUTORY_YAKAP_DIAGNOSTICS;
      const matchedItem = list.find((x) => x.code === codeTrimmed);
      return {
        code: codeTrimmed,
        desc: matchedItem?.name || name,
        isFormulary: true,
        status: 'Mapped',
      };
    }

    // Auto-heuristic search
    const lowerName = name.toLowerCase();
    const list = isMed ? CORE_GAMOT_FORMULARY : STATUTORY_YAKAP_DIAGNOSTICS;
    const match = list.find((item) => {
      const itemLower = item.name.toLowerCase();
      // Look for significant keyword overlap
      const keywords = itemLower.split(/[\s,()/-]+/).filter((w) => w.length > 3);
      const matchesKeyword = keywords.some((kw) => lowerName.includes(kw));
      return itemLower.includes(lowerName) || lowerName.includes(itemLower) || matchesKeyword;
    });

    if (match) {
      return {
        code: match.code,
        desc: match.name,
        isFormulary: true,
        status: 'Mapped',
      };
    }

    return {
      isFormulary: false,
      status: 'NeedsMapping',
    };
  };

  const parseCsv = () => {
    if (!csvRawText.trim()) {
      Alert.alert('Empty Input', 'Please paste or enter CSV data before continuing.');
      return;
    }

    const lines = csvRawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      Alert.alert('Invalid CSV', 'Please provide a header row and at least one data row.');
      return;
    }

    // Normalize header
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const codeIdx = headers.findIndex((h) => h.includes('code') && !h.includes('philhealth') && !h.includes('gamot'));
    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('item'));
    const catIdx = headers.findIndex((h) => h.includes('cat'));
    const priceIdx = headers.findIndex((h) => h.includes('price') || h.includes('cost') || h.includes('fee'));
    const descIdx = headers.findIndex((h) => h.includes('desc'));
    const philHealthCodeIdx = headers.findIndex((h) => h.includes('philhealth') || h.includes('gamot') || h.includes('yakap'));

    if (nameIdx === -1) {
      Alert.alert('Missing Name Column', 'CSV header must include an "Item Name" or "Name" column.');
      return;
    }

    const rows: ParsedImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV split supporting simple commas
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols.some((c) => c.length > 0)) continue;

      const rawName = cols[nameIdx] || `Item ${i}`;
      const rawCode = (codeIdx !== -1 && cols[codeIdx]) ? cols[codeIdx] : `SVC-${i.toString().padStart(4, '0')}`;
      const rawCat = (catIdx !== -1 && cols[catIdx]) ? cols[catIdx] : 'General';
      const rawPrice = priceIdx !== -1 ? parseFloat(cols[priceIdx]) || 0 : 0;
      const rawDesc = descIdx !== -1 ? cols[descIdx] : '';
      const explicitPhilHealthCode = philHealthCodeIdx !== -1 ? cols[philHealthCodeIdx] : undefined;

      const mapping = autoMatchPhilHealth(rawName, rawCat, explicitPhilHealthCode);

      rows.push({
        id: `row-${i}-${Date.now()}`,
        code: rawCode,
        name: rawName,
        category: rawCat,
        standardPrice: rawPrice,
        description: rawDesc,
        philHealthCode: mapping.code,
        philHealthDescription: mapping.desc,
        isPhilHealthFormulary: mapping.isFormulary,
        mappingStatus: mapping.status,
      });
    }

    if (rows.length === 0) {
      Alert.alert('No Rows Parsed', 'Could not parse any valid service records from the input.');
      return;
    }

    setParsedRows(rows);
    setStep('preview');
  };

  const handleOpenRowMapping = (rowId: string) => {
    setActiveMappingRowId(rowId);
  };

  const handleSaveRowMapping = (mapping: CatalogMappingResult) => {
    if (!activeMappingRowId) return;

    setParsedRows((prev) =>
      prev.map((row) => {
        if (row.id !== activeMappingRowId) return row;
        return {
          ...row,
          philHealthCode: mapping.code,
          philHealthDescription: mapping.description,
          isPhilHealthFormulary: !mapping.isNonFormulary,
          mappingStatus: mapping.isNonFormulary ? 'NonFormulary' : 'Mapped',
        };
      })
    );
    setActiveMappingRowId(null);
  };

  const handleCommitImport = async () => {
    // Check if there are clinical items that still need mapping
    const unmappedClinical = parsedRows.filter((r) => r.mappingStatus === 'NeedsMapping');
    if (unmappedClinical.length > 0) {
      Alert.alert(
        'Unmapped Clinical Items',
        `There are ${unmappedClinical.length} clinical item(s) that have not been mapped to PhilHealth formulary or marked as Non-Formulary. Would you like to proceed anyway and treat them as Non-Formulary?`,
        [
          { text: 'Review & Map', style: 'cancel' },
          {
            text: 'Import as Non-Formulary',
            onPress: () => doSubmit(),
          },
        ]
      );
      return;
    }

    await doSubmit();
  };

  const doSubmit = async () => {
    try {
      setIsSubmitting(true);
      const payload: BulkImportServiceItem[] = parsedRows.map((r) => ({
        code: r.code,
        name: r.name,
        category: r.category,
        standardPrice: r.standardPrice,
        description: r.description,
        philHealthCode: r.philHealthCode,
        philHealthDescription: r.philHealthDescription,
        isPhilHealthFormulary: r.isPhilHealthFormulary,
      }));

      const [data, err] = await clinicService.bulkImportServices(payload);
      if (data) {
        Alert.alert(
          'Import Completed',
          `Successfully processed ${data.totalProcessed} items!\n\n• Created: ${data.totalCreated}\n• Updated: ${data.totalUpdated}\n• Yakap Formularies: ${data.totalMappedToPhilHealth}\n• Non-Formulary: ${data.totalNonFormulary}`
        );
        onImportSuccess(data);
        onClose();
      } else {
        Alert.alert('Import Failed', err?.message || 'Unable to import catalog items.');
      }
    } catch (err: any) {
      Alert.alert('Import Error', err.message || 'An error occurred during bulk import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mappedCount = parsedRows.filter((r) => r.mappingStatus === 'Mapped').length;
  const needsMappingCount = parsedRows.filter((r) => r.mappingStatus === 'NeedsMapping').length;
  const nonFormularyCount = parsedRows.filter(
    (r) => r.mappingStatus === 'NonFormulary' || r.mappingStatus === 'N/A'
  ).length;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.headerBar}>
              <View>
                <View style={styles.titleRow}>
                  <ThemedText style={styles.titleText}>Bulk Import Services & Formulary Catalog</ThemedText>
                  <ThemedText style={styles.badgeText}>CSV Import Engine</ThemedText>
                </View>
                <ThemedText style={styles.subText}>
                  Batch ingest clinical services, medicines, and diagnostics with automated statutory PhilHealth mapping.
                </ThemedText>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <ThemedText style={styles.closeBtnText}>✕</ThemedText>
              </Pressable>
            </View>

            {/* Step Navigation */}
            <View style={styles.stepTabs}>
              <Pressable
                style={[styles.stepTab, step === 'input' && styles.stepTabActive]}
                onPress={() => setStep('input')}
              >
                <ThemedText style={[styles.stepTabText, step === 'input' && styles.stepTabTextActive]}>
                  1. Paste / Upload CSV
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.stepTab, step === 'preview' && styles.stepTabActive]}
                onPress={() => parsedRows.length > 0 && setStep('preview')}
                disabled={parsedRows.length === 0}
              >
                <ThemedText style={[styles.stepTabText, step === 'preview' && styles.stepTabTextActive]}>
                  2. Review & PhilHealth Mapping ({parsedRows.length})
                </ThemedText>
              </Pressable>
            </View>

            {/* Step 1: Input CSV */}
            {step === 'input' && (
              <View style={{ flex: 1 }}>
                <View style={styles.toolBar}>
                  <ThemedText style={styles.sectionLabel}>Paste Comma-Separated Values</ThemedText>
                  <Pressable style={styles.sampleBtn} onPress={handleLoadSample}>
                    <ThemedText style={styles.sampleBtnText}>📋 Load Sample CSV Template</ThemedText>
                  </Pressable>
                </View>

                <TextInput
                  style={styles.csvInput}
                  multiline
                  placeholder="Code,Name,Category,StandardPrice,Description,PhilHealthCode&#10;MED-001,Amoxicillin 500mg,Medicine,15.00,Oral antibiotic,AMOXC0000000500CAP00000000100"
                  placeholderTextColor="#9CA3AF"
                  value={csvRawText}
                  onChangeText={setCsvRawText}
                />

                <ThemedText style={styles.hintText}>
                  💡 Column headers supported: <ThemedText style={{ fontWeight: '700' }}>Code, Name, Category, StandardPrice, Description, PhilHealthCode</ThemedText>. If PhilHealthCode is left blank, our engine will automatically search the statutory GAMOT and Yakap catalogs.
                </ThemedText>

                <View style={styles.footerRow}>
                  <Pressable style={styles.cancelBtn} onPress={onClose}>
                    <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={parseCsv}>
                    <ThemedText style={styles.primaryBtnText}>Parse & Match PhilHealth Catalog →</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step 2: Preview & Mapping Verification */}
            {step === 'preview' && (
              <View style={{ flex: 1 }}>
                {/* Stats Summary Bar */}
                <View style={styles.statsBar}>
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statLabel}>Total Items</ThemedText>
                    <ThemedText style={styles.statVal}>{parsedRows.length}</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statLabel}>✓ Yakap Mapped</ThemedText>
                    <ThemedText style={[styles.statVal, { color: '#059669' }]}>{mappedCount}</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statLabel}>⚠️ Needs Mapping</ThemedText>
                    <ThemedText style={[styles.statVal, { color: '#D97706' }]}>{needsMappingCount}</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statLabel}>Out-of-Pocket / General</ThemedText>
                    <ThemedText style={[styles.statVal, { color: '#4B5563' }]}>{nonFormularyCount}</ThemedText>
                  </View>
                </View>

                {/* Table Header */}
                <View style={styles.tableHeader}>
                  <ThemedText style={[styles.colHeader, { flex: 2 }]}>Code & Name</ThemedText>
                  <ThemedText style={[styles.colHeader, { flex: 1.2 }]}>Category / Fee</ThemedText>
                  <ThemedText style={[styles.colHeader, { flex: 2.2 }]}>PhilHealth Statutory Mapping</ThemedText>
                  <ThemedText style={[styles.colHeader, { flex: 1, textAlign: 'right' }]}>Action</ThemedText>
                </View>

                {/* Table Rows */}
                <ScrollView style={styles.tableScroll}>
                  {parsedRows.map((row) => {
                    const isClinical = row.category.toLowerCase() === 'medicine' || row.category.toLowerCase() === 'diagnostic';
                    return (
                      <View key={row.id} style={styles.tableRow}>
                        <View style={{ flex: 2 }}>
                          <ThemedText style={styles.rowTitle}>{row.name}</ThemedText>
                          <ThemedText style={styles.rowSubtitle}>{row.code}</ThemedText>
                        </View>

                        <View style={{ flex: 1.2 }}>
                          <ThemedText style={styles.rowCategory}>{row.category}</ThemedText>
                          <ThemedText style={styles.rowPrice}>₱{row.standardPrice.toFixed(2)}</ThemedText>
                        </View>

                        <View style={{ flex: 2.2 }}>
                          {row.mappingStatus === 'Mapped' && (
                            <View style={styles.mappedBadge}>
                              <ThemedText style={styles.mappedBadgeText}>✓ {row.philHealthCode}</ThemedText>
                              <ThemedText numberOfLines={1} style={styles.mappedDescText}>
                                {row.philHealthDescription}
                              </ThemedText>
                            </View>
                          )}
                          {row.mappingStatus === 'NeedsMapping' && (
                            <View style={styles.unmappedBadge}>
                              <ThemedText style={styles.unmappedBadgeText}>⚠️ Action Required: Unmapped</ThemedText>
                            </View>
                          )}
                          {(row.mappingStatus === 'NonFormulary' || row.mappingStatus === 'N/A') && (
                            <View style={styles.neutralBadge}>
                              <ThemedText style={styles.neutralBadgeText}>
                                {isClinical ? 'Non-Formulary Out-of-Pocket' : 'Standard Service'}
                              </ThemedText>
                            </View>
                          )}
                        </View>

                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          {isClinical ? (
                            <Pressable
                              style={styles.mapBtn}
                              onPress={() => handleOpenRowMapping(row.id)}
                            >
                              <ThemedText style={styles.mapBtnText}>
                                {row.mappingStatus === 'Mapped' ? 'Edit' : 'Map'}
                              </ThemedText>
                            </Pressable>
                          ) : (
                            <ThemedText style={styles.rowNaText}>—</ThemedText>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Footer Controls */}
                <View style={styles.footerRow}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => setStep('input')}
                    disabled={isSubmitting}
                  >
                    <ThemedText style={styles.cancelBtnText}>← Edit CSV</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, isSubmitting && styles.btnDisabled]}
                    onPress={handleCommitImport}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <ThemedText style={styles.primaryBtnText}>
                        ✓ Commit Bulk Import ({parsedRows.length} items)
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Row-Level Mapping Dialog Interception */}
      {activeMappingRow && (
        <PhilHealthCatalogMappingModal
          visible={!!activeMappingRowId}
          onClose={() => setActiveMappingRowId(null)}
          itemName={activeMappingRow.name}
          itemType={activeMappingRow.category.toLowerCase() === 'medicine' ? 'Medicine' : 'Diagnostic'}
          initialGenericName={activeMappingRow.name}
          onSaveMapping={handleSaveRowMapping}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 880,
    height: '88%',
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
  stepTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  stepTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  stepTabActive: {
    backgroundColor: '#E0F2FE',
  },
  stepTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  stepTabTextActive: {
    color: '#0284C7',
  },
  toolBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sampleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sampleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  csvInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#111827',
    textAlignVertical: 'top',
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 10,
    lineHeight: 18,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 6,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
  },
  tableScroll: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6B7280',
    marginTop: 1,
  },
  rowCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  rowPrice: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 1,
  },
  mappedBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mappedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    fontFamily: 'monospace',
  },
  mappedDescText: {
    fontSize: 10,
    color: '#047857',
    marginTop: 2,
  },
  unmappedBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unmappedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  neutralBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  neutralBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  mapBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mapBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  rowNaText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284C7',
  },
  btnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
