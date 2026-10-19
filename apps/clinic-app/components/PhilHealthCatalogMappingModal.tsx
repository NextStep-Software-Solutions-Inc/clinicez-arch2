import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, Badge, Icon, EmptyState, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import { usePhilHealthCatalog, usePhilHealthCatalogSearch } from '@utils/usePhilHealthCatalog';
import type { PhilHealthCatalogItem } from '@services/philHealthCatalogService';

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
  /** Extra facet from the catalog (when it has one); shown as a badge. */
  category?: string;
}

const MEDICINE_LIBRARY = 'lib_medicine';
const DIAGNOSTIC_LIBRARY = 'lib_diagnostic';

/** The catalog uses "-" for "no category". */
const toQuickItem = (item: PhilHealthCatalogItem): FormularyQuickItem => {
  const category = item.attributes?.category;
  return { code: item.code, name: item.description, category: category && category !== '-' ? category : undefined };
};

export default function PhilHealthCatalogMappingModal({
  visible,
  onClose,
  itemName,
  itemType,
  initialGenericName,
  initialDosage,
  onSaveMapping,
}: PhilHealthCatalogMappingModalProps) {
  const isMedicine = itemType === 'Medicine';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedDesc, setSelectedDesc] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [isNonFormulary, setIsNonFormulary] = useState(false);

  // Medicines (thousands of rows) are searched on the server; diagnostics are a short cached library.
  const diagnostics = usePhilHealthCatalog(DIAGNOSTIC_LIBRARY, visible && !isMedicine);
  const medicines = usePhilHealthCatalogSearch(MEDICINE_LIBRARY, visible && isMedicine ? searchQuery : '', { take: 40 });

  useEffect(() => {
    if (visible) {
      // Start from the item's own name; the staff member picks the catalog entry explicitly (no auto-guess).
      setSearchQuery(initialGenericName || itemName || '');
      setSelectedCode('');
      setSelectedDesc('');
      setSelectedCat('');
      setIsNonFormulary(false);
    }
  }, [visible, itemName, initialGenericName]);

  const handleSelectOption = (item: FormularyQuickItem) => {
    setSelectedCode(item.code);
    setSelectedDesc(item.name);
    setSelectedCat(item.category ?? '');
    setIsNonFormulary(false);
  };

  const handleSelectNonFormulary = () => {
    // Not in the PhilHealth catalog, so it carries no PhilHealth code at all.
    setSelectedCode('');
    setSelectedDesc(`${itemName} (Non-Formulary / Out of Pocket)`);
    setSelectedCat('');
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
      category: selectedCat || undefined,
      isNonFormulary,
    });
    onClose();
  };

  const filteredList: FormularyQuickItem[] = useMemo(() => {
    if (isMedicine) return medicines.results.map(toQuickItem);
    const q = searchQuery.toLowerCase().trim();
    return diagnostics.items
      .filter((item) => !q || item.description.toLowerCase().includes(q) || item.code.toLowerCase().includes(q))
      .map(toQuickItem);
  }, [isMedicine, medicines.results, diagnostics.items, searchQuery]);

  const listLoading = isMedicine ? medicines.searching : diagnostics.loading;
  const listError = isMedicine ? medicines.error : diagnostics.error;
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Map to PhilHealth catalog"
      subtitle={`${itemName} · ${itemType === 'Medicine' ? 'GAMOT formulary' : 'Yakap diagnostics'}`}
      maxWidth={680}
      maxHeight="95%"
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
        placeholder={isMedicine ? 'Search by molecule, dosage or code' : 'Search diagnostic test'}
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
        {listLoading ? 'Searching the PhilHealth catalog...' : `Matching catalog entries (${filteredList.length})`}
      </ThemedText>
      <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} nestedScrollEnabled>
        {listError && filteredList.length === 0 ? (
          <EmptyState
            icon="search"
            title="The PhilHealth catalog is unavailable"
            description={`${listError.message} You can still mark the item as non-formulary below and map it later.`}
          />
        ) : filteredList.length === 0 && !listLoading ? (
          <EmptyState
            icon="search"
            title={searchQuery.trim() ? 'No catalog entries match' : 'Search the PhilHealth catalog'}
            description={
              searchQuery.trim()
                ? 'Try a different search, or mark the item as non-formulary below.'
                : 'Type a molecule, test name or code to find the PhilHealth entry.'
            }
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
                {item.category ? <Badge label={item.category} variant="neutral" /> : null}
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
