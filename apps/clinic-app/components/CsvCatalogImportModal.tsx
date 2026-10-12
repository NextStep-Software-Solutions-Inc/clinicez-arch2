import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, Badge, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import { clinicService, BulkImportServiceItem, BulkImportResult } from '../services/clinicService';
import { philHealthCatalogService } from '../services/philHealthCatalogService';
import PhilHealthCatalogMappingModal, { CatalogMappingResult } from './PhilHealthCatalogMappingModal';

interface CsvCatalogImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportSuccess: (result: BulkImportResult) => void;
}

export interface ParsedImportRow extends BulkImportServiceItem {
  id: string; // temporary row key
  mappingStatus: 'Mapped' | 'NeedsMapping' | 'NonFormulary' | 'N/A';
}

const CSV_HEADERS = 'Code,Name,Category,StandardPrice,Description,PhilHealthCode';

export default function CsvCatalogImportModal({
  visible,
  onClose,
  onImportSuccess,
}: CsvCatalogImportModalProps) {
  const [csvRawText, setCsvRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isVerifying, setIsVerifying] = useState(false);

  // PhilHealth Catalog Mapping Modal Sub-Dialog State
  const [activeMappingRowId, setActiveMappingRowId] = useState<string | null>(null);

  const activeMappingRow = parsedRows.find((r) => r.id === activeMappingRowId);

  const handleInsertHeaders = () => {
    setCsvRawText((current) => (current.trim() ? current : `${CSV_HEADERS}\n`));
  };

  /**
   * Medicines and diagnostics must carry a PhilHealth Catalog code. A code typed into the CSV is verified against the
   * catalog; anything else is left for the staff member to map explicitly (no guessing from keywords).
   */
  const clinicalKind = (category: string): 'medicine' | 'diagnostic' | null => {
    const lower = category.toLowerCase();
    if (lower === 'medicine') return 'medicine';
    if (lower === 'diagnostic') return 'diagnostic';
    return null;
  };

  const verifyCatalogCodes = async (
    wanted: { kind: 'medicine' | 'diagnostic'; code: string }[],
  ): Promise<Map<string, string>> => {
    const verified = new Map<string, string>();
    const unique = [...new Map(wanted.map((w) => [`${w.kind}:${w.code}`, w])).values()];

    const [diagnostics] = unique.some((w) => w.kind === 'diagnostic')
      ? await philHealthCatalogService.getLibrary('lib_diagnostic')
      : [null];

    await Promise.all(
      unique.map(async ({ kind, code }) => {
        if (kind === 'diagnostic') {
          const hit = diagnostics?.find((d) => d.isActive && d.code === code);
          if (hit) verified.set(`${kind}:${code}`, hit.description);
          return;
        }
        const [hits] = await philHealthCatalogService.search('lib_medicine', code, 5);
        const hit = hits?.find((m) => m.code === code);
        if (hit) verified.set(`${kind}:${code}`, hit.description);
      }),
    );
    return verified;
  };
  const parseCsv = async () => {
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
    const toVerify: { rowIndex: number; kind: 'medicine' | 'diagnostic'; code: string }[] = [];

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

      const kind = clinicalKind(rawCat);
      const explicitCode = explicitPhilHealthCode?.trim();
      if (kind && explicitCode) toVerify.push({ rowIndex: rows.length, kind, code: explicitCode });

      rows.push({
        id: `row-${i}-${Date.now()}`,
        code: rawCode,
        name: rawName,
        category: rawCat,
        standardPrice: rawPrice,
        description: rawDesc,
        philHealthCode: undefined,
        philHealthDescription: undefined,
        isPhilHealthFormulary: false,
        mappingStatus: kind ? 'NeedsMapping' : 'N/A',
      });
    }

    if (rows.length === 0) {
      Alert.alert('No Rows Parsed', 'Could not parse any valid service records from the input.');
      return;
    }

    if (toVerify.length > 0) {
      setIsVerifying(true);
      const verified = await verifyCatalogCodes(toVerify);
      setIsVerifying(false);
      for (const item of toVerify) {
        const description = verified.get(`:`);
        if (!description) continue;
        rows[item.rowIndex] = {
          ...rows[item.rowIndex],
          philHealthCode: item.code,
          philHealthDescription: description,
          isPhilHealthFormulary: true,
          mappingStatus: 'Mapped',
        };
      }
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
          `Successfully processed ${data.totalProcessed} items!\n\n- Created: ${data.totalCreated}\n- Updated: ${data.totalUpdated}\n- Yakap Formularies: ${data.totalMappedToPhilHealth}\n- Non-Formulary: ${data.totalNonFormulary}`
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

  const footer =
    step === 'input' ? (
      <View style={styles.footerRow}>
        <Button title="Cancel" variant="ghost" onPress={onClose} />
        <Button title="Parse and check PhilHealth codes" onPress={parseCsv} loading={isVerifying} disabled={!csvRawText.trim() || isVerifying} />
      </View>
    ) : (
      <View style={styles.footerRow}>
        <Button title="Edit CSV" variant="ghost" onPress={() => setStep('input')} disabled={isSubmitting} />
        <Button
          title={`Import ${parsedRows.length} item(s)`}
          onPress={handleCommitImport}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      </View>
    );

  return (
    <>
      <Modal
        visible={visible}
        onClose={onClose}
        title="Import services and formulary catalog"
        subtitle="Add clinic services, medicines and diagnostics from a CSV file, matched to PhilHealth codes."
        maxWidth={880}
        maxHeight="95%"
        footer={footer}
      >
        {/* Step Navigation */}
        <View style={styles.stepTabs}>
          <Pressable
            style={[styles.stepTab, step === 'input' && styles.stepTabActive]}
            onPress={() => setStep('input')}
            accessibilityRole="tab"
            accessibilityState={{ selected: step === 'input' }}
          >
            <ThemedText variant="smallBold" color={step === 'input' ? theme.colors.primary : theme.colors.textMuted}>
              1. Paste CSV
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.stepTab, step === 'preview' && styles.stepTabActive]}
            onPress={() => parsedRows.length > 0 && setStep('preview')}
            disabled={parsedRows.length === 0}
            accessibilityRole="tab"
            accessibilityState={{ selected: step === 'preview', disabled: parsedRows.length === 0 }}
          >
            <ThemedText
              variant="smallBold"
              color={step === 'preview' ? theme.colors.primary : theme.colors.textMuted}
            >
              2. Review and map ({parsedRows.length})
            </ThemedText>
          </Pressable>
        </View>

        {/* Step 1: Input CSV */}
        {step === 'input' && (
          <>
            <View style={styles.toolBar}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                CSV content
              </ThemedText>
              <Button title="Insert column headers" variant="outline" size="sm" onPress={handleInsertHeaders} />
            </View>

            <Input
              multiline
              numberOfLines={12}
              placeholder={`${CSV_HEADERS}\n`}
              value={csvRawText}
              onChangeText={setCsvRawText}
              textAlignVertical="top"
              inputStyle={styles.csvInput}
            />

            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Supported columns: {CSV_HEADERS.split(',').join(', ')}. If PhilHealthCode is blank, the import searches the
              GAMOT and Yakap catalogs for a match.
            </ThemedText>
          </>
        )}

        {/* Step 2: Preview and mapping verification */}
        {step === 'preview' && (
          <>
            {/* Stats Summary Bar */}
            <View style={styles.statsBar}>
              <View style={styles.statItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Total items
                </ThemedText>
                <ThemedText variant="h3">{parsedRows.length}</ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Yakap mapped
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.successText}>
                  {mappedCount}
                </ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Needs mapping
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.warningText}>
                  {needsMappingCount}
                </ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Out of pocket / general
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.textSecondary}>
                  {nonFormularyCount}
                </ThemedText>
              </View>
            </View>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.colName}>
                Code and name
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.colCategory}>
                Category and fee
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.colMapping}>
                PhilHealth mapping
              </ThemedText>
              <ThemedText
                variant="captionBold"
                color={theme.colors.textSecondary}
                style={[styles.colAction, styles.alignRight]}
              >
                Action
              </ThemedText>
            </View>

            {/* Table Rows */}
            <ScrollView style={styles.tableScroll} nestedScrollEnabled>
              {parsedRows.map((row) => {
                const isClinical =
                  row.category.toLowerCase() === 'medicine' || row.category.toLowerCase() === 'diagnostic';
                return (
                  <View key={row.id} style={styles.tableRow}>
                    <View style={styles.colName}>
                      <ThemedText variant="smallBold">{row.name}</ThemedText>
                      <ThemedText variant="code" color={theme.colors.textMuted}>
                        {row.code}
                      </ThemedText>
                    </View>

                    <View style={styles.colCategory}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {row.category}
                      </ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.successText}>
                        ₱{row.standardPrice.toFixed(2)}
                      </ThemedText>
                    </View>

                    <View style={styles.colMapping}>
                      {row.mappingStatus === 'Mapped' && (
                        <View style={styles.mappedBox}>
                          <ThemedText variant="code" color={theme.colors.successText}>
                            {row.philHealthCode}
                          </ThemedText>
                          <ThemedText variant="caption" numberOfLines={1} color={theme.colors.successText}>
                            {row.philHealthDescription}
                          </ThemedText>
                        </View>
                      )}
                      {row.mappingStatus === 'NeedsMapping' && <Badge label="Needs mapping" variant="warning" />}
                      {(row.mappingStatus === 'NonFormulary' || row.mappingStatus === 'N/A') && (
                        <Badge label={isClinical ? 'Non-formulary, out of pocket' : 'Standard service'} variant="neutral" />
                      )}
                    </View>

                    <View style={[styles.colAction, styles.alignRight]}>
                      {isClinical ? (
                        <Button
                          title={row.mappingStatus === 'Mapped' ? 'Edit' : 'Map'}
                          variant="outline"
                          size="sm"
                          onPress={() => handleOpenRowMapping(row.id)}
                        />
                      ) : (
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          None needed
                        </ThemedText>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepTabs: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepTab: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  stepTabActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  toolBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  csvInput: {
    fontFamily: theme.fonts.mono['400'],
    fontSize: theme.fontSizes.xs,
    minHeight: 240,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: theme.sizes.borderWidth,
    height: theme.spacing['2xl'],
    backgroundColor: theme.colors.border,
  },
  tableHeader: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
  },
  tableScroll: {
    maxHeight: 360,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  colName: {
    flex: 2,
  },
  colCategory: {
    flex: 1.2,
  },
  colMapping: {
    flex: 2.2,
  },
  colAction: {
    flex: 1,
  },
  alignRight: {
    alignItems: 'flex-end',
    textAlign: 'right',
  },
  mappedBox: {
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
