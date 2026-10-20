import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import {
  Modal,
  ThemedText,
  Button,
  Badge,
  Icon,
  Input,
  SegmentedControl,
} from '../ui';
import { theme } from '../../constants/theme';
import type { ClinicServiceItem } from '../../services/clinicService';

export interface OrderCatalogItemPayload {
  serviceItemId: string;
  code: string;
  name: string;
  category: string;
  standardPrice: number;
  philHealthCode?: string;
  philHealthDescription?: string;
  isPhilHealthFormulary?: boolean;
  fulfillmentMode: 'in_house' | 'outside';
  instructions?: string;
  toothNumber?: number;
  toothSurface?: string;
}

export interface ExistingOrderItemContext {
  name: string;
  code?: string;
  fulfillmentMode?: 'in_house' | 'outside';
  instructions?: string;
  toothNumber?: number;
  toothSurface?: string;
}

export interface OrderCatalogSearchModalProps {
  visible: boolean;
  onClose: () => void;
  catalog?: ClinicServiceItem[];
  initialCategory?: 'Diagnostic' | 'Procedure' | 'Dental' | 'All';
  isYakapEligible?: boolean;
  onSelectOrder: (order: OrderCatalogItemPayload) => void;
  alreadyOrderedNames?: string[];
  alreadyOrderedCodes?: string[];
  existingOrders?: ExistingOrderItemContext[];
  initialToothNumber?: number;
  initialToothSurface?: string;
  testID?: string;
}

export type CategoryTab = 'All' | 'Diagnostic' | 'Procedure' | 'Dental';
type FulfillmentMode = 'in_house' | 'outside';

export const CATEGORY_TABS: Array<{ value: CategoryTab; label: string }> = [
  { value: 'All', label: 'All Items' },
  { value: 'Diagnostic', label: 'Diagnostic' },
  { value: 'Procedure', label: 'Procedure' },
  { value: 'Dental', label: 'Dental' },
];

const FULFILLMENT_OPTIONS: Array<{ value: FulfillmentMode; label: string }> = [
  { value: 'in_house', label: 'In-House Clinic' },
  { value: 'outside', label: 'Outside Laboratory' },
];

export const DIAGNOSTIC_FASTING_CHIPS = [
  '10-12 hr fasting',
  '8 hr fasting',
  'Random / Non-fasting',
  'Morning mid-stream urine',
  'STAT',
];

export const PROCEDURE_INSTRUCTION_CHIPS = [
  'STAT',
  'Routine',
  'Pre/post vitals required',
  'Wound care / sterile technique',
];

export const DENTAL_CLINICAL_INSTRUCTION_CHIPS = [
  'Local anesthesia (Infiltration)',
  'Mandibular nerve block',
  'Rubber dam isolation',
  'Post-extraction care instructions',
  'Suture removal 7 days',
];

const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

function getHeuristicFulfillmentMode(item: ClinicServiceItem): FulfillmentMode {
  const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');
  if (!isDiagnostic) {
    return 'in_house';
  }
  const matchTarget = `${item.name || ''} ${item.code || ''} ${item.description || ''}`;
  if (IN_HOUSE_RAPID_TEST_REGEX.test(matchTarget)) {
    return 'in_house';
  }
  return 'outside';
}

export function OrderCatalogSearchModal({
  visible,
  onClose,
  catalog = [],
  initialCategory = 'All',
  isYakapEligible = false,
  onSelectOrder,
  alreadyOrderedNames = [],
  alreadyOrderedCodes = [],
  existingOrders = [],
  initialToothNumber,
  initialToothSurface,
  testID = 'order-catalog-search-modal',
}: OrderCatalogSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>(initialCategory);
  const [selectedItem, setSelectedItem] = useState<ClinicServiceItem | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>('in_house');
  const [instructions, setInstructions] = useState('');

  // Reset form when modal becomes visible or initialCategory changes
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSelectedCategory(initialCategory);
      setSelectedItem(null);
      setFulfillmentMode('in_house');
      if (initialToothNumber) {
        setInstructions(`Tooth #${initialToothNumber}${initialToothSurface ? ` (${initialToothSurface})` : ''}`);
      } else {
        setInstructions('');
      }
    }
  }, [visible, initialCategory, initialToothNumber, initialToothSurface]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (item.isActive === false) return false;

      const catLower = (item.category || '').toLowerCase();
      if (selectedCategory === 'Diagnostic') {
        if (!catLower.includes('diagnostic')) return false;
      } else if (selectedCategory === 'Procedure') {
        if (!catLower.includes('procedure') && !catLower.includes('nursing') && !catLower.includes('dental')) return false;
      } else if (selectedCategory === 'Dental') {
        if (!catLower.includes('dental')) return false;
      }

      if (q) {
        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const codeMatch = (item.code || '').toLowerCase().includes(q);
        const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
        const descMatch = (item.description || '').toLowerCase().includes(q);
        const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !philHealthCodeMatch && !descMatch && !philHealthDescMatch) {
          return false;
        }
      }

      return true;
    });
  }, [catalog, searchQuery, selectedCategory]);

  const handleSelectItem = (item: ClinicServiceItem) => {
    const isOrdered =
      alreadyOrderedNames.some((n) => n.toLowerCase() === item.name.toLowerCase()) ||
      alreadyOrderedCodes.some((c) => c.toLowerCase() === item.code.toLowerCase());

    const existing = existingOrders?.find(
      (o) =>
        o.name.toLowerCase() === item.name.toLowerCase() ||
        (o.code && item.code && o.code.toLowerCase() === item.code.toLowerCase())
    );

    setSelectedItem(item);
    if (isOrdered && existing) {
      setFulfillmentMode(existing.fulfillmentMode || getHeuristicFulfillmentMode(item));
      setInstructions(existing.instructions || '');
    } else {
      setFulfillmentMode(getHeuristicFulfillmentMode(item));
      if (initialToothNumber) {
        setInstructions(`Tooth #${initialToothNumber}${initialToothSurface ? ` (${initialToothSurface})` : ''}`);
      } else {
        setInstructions('');
      }
    }
  };

  const handleToggleChip = (chip: string) => {
    setInstructions((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return chip;
      }
      const parts = trimmed.split(';').map((p) => p.trim());
      if (parts.includes(chip)) {
        const remaining = parts.filter((p) => p !== chip);
        return remaining.join('; ');
      }
      return `${trimmed}; ${chip}`;
    });
  };

  const isDiagnostic = (selectedItem?.category || '').toLowerCase().includes('diagnostic');
  const isDental =
    selectedCategory === 'Dental' ||
    Boolean(initialToothNumber) ||
    Boolean(selectedItem && (selectedItem.category || '').toLowerCase().includes('dental'));
  const isSelectedAlreadyOrdered = selectedItem
    ? alreadyOrderedNames.some((n) => n.toLowerCase() === selectedItem.name.toLowerCase()) ||
      alreadyOrderedCodes.some((c) => c.toLowerCase() === selectedItem.code.toLowerCase())
    : false;

  const isYakapCovered = Boolean(
    isYakapEligible &&
    selectedItem?.philHealthCode &&
    (fulfillmentMode === 'in_house' || !isDiagnostic)
  );

  const handleSubmit = () => {
    if (!selectedItem) return;

    const payload: OrderCatalogItemPayload = {
      serviceItemId: selectedItem.id,
      code: selectedItem.code,
      name: selectedItem.name,
      category: selectedItem.category,
      standardPrice: selectedItem.standardPrice,
      philHealthCode: selectedItem.philHealthCode,
      philHealthDescription: selectedItem.philHealthDescription,
      isPhilHealthFormulary: selectedItem.isPhilHealthFormulary,
      fulfillmentMode: isDiagnostic ? fulfillmentMode : 'in_house',
      instructions: instructions.trim() ? instructions.trim() : undefined,
      toothNumber: initialToothNumber,
      toothSurface: initialToothSurface,
    };

    onSelectOrder(payload);
    onClose();
  };

  const renderModalFooter = (
    <View style={styles.modalFooter}>
      <Button
        title="Cancel"
        variant="secondary"
        onPress={onClose}
        testID={`${testID}-cancel-btn`}
      />
      <Button
        title={isSelectedAlreadyOrdered ? 'Update Order' : 'Add to Order'}
        variant="primary"
        icon={isSelectedAlreadyOrdered ? 'check' : 'plus'}
        disabled={!selectedItem}
        onPress={handleSubmit}
        testID={`${testID}-submit-btn`}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Add Test or Procedure"
      subtitle={
        initialToothNumber
          ? `Order procedure for Tooth #${initialToothNumber}${initialToothSurface ? ` (${initialToothSurface})` : ''}`
          : 'Search fee schedule catalog for diagnostic tests and in-clinic procedures'
      }
      maxWidth={680}
      footer={renderModalFooter}
      testID={testID}
    >
      <View style={styles.container}>
        {initialToothNumber ? (
          <View style={styles.targetToothBanner}>
            <Badge
              label={`Target: Tooth #${initialToothNumber}${initialToothSurface ? ` (${initialToothSurface})` : ''}`}
              variant="info"
              size="md"
            />
          </View>
        ) : null}
        {/* Search input */}
        <Input
          placeholder="Search by name, code, PhilHealth code, or description..."
          leftIcon="search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID={`${testID}-search-input`}
        />

        {/* Category Tabs */}
        <View style={styles.filterRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Filter Category:
          </ThemedText>
          <SegmentedControl<CategoryTab>
            options={CATEGORY_TABS}
            value={selectedCategory}
            onChange={setSelectedCategory}
          />
        </View>

        {/* Catalog Items List */}
        <View style={styles.listHeaderRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Matching Catalog Items ({filteredCatalog.length})
          </ThemedText>
          {selectedItem && (
            <Pressable onPress={() => setSelectedItem(null)} hitSlop={theme.spacing.xs}>
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Clear Selection
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView
          style={styles.listScrollArea}
          contentContainerStyle={styles.listScrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {filteredCatalog.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="search" size={theme.sizes.iconLg} color={theme.colors.textLight} />
              <ThemedText variant="bodyBold" color={theme.colors.textMuted}>
                No matching catalog items found
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textLight}>
                Try adjusting your search query or switching the category tab.
              </ThemedText>
            </View>
          ) : (
            filteredCatalog.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const isItemDiag = (item.category || '').toLowerCase().includes('diagnostic');
              const isItemOrdered =
                alreadyOrderedNames.some((n) => n.toLowerCase() === item.name.toLowerCase()) ||
                alreadyOrderedCodes.some((c) => c.toLowerCase() === item.code.toLowerCase());

              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.itemRow,
                    isSelected && styles.itemRowSelected,
                    isItemOrdered && styles.itemRowOrdered,
                  ]}
                  onPress={() => handleSelectItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.code}, standard price ${item.standardPrice} pesos${isItemOrdered ? ', already in order, click to edit' : ''}`}
                >
                  <View style={styles.itemRadioSlot}>
                    <Icon
                      name={
                        isSelected
                          ? 'checkCircle'
                          : isItemOrdered
                          ? 'edit'
                          : isItemDiag
                          ? 'lab'
                          : 'medical'
                      }
                      size={theme.sizes.iconSm}
                      color={
                        isSelected
                          ? theme.colors.primary
                          : isItemOrdered
                          ? theme.colors.warningText
                          : theme.colors.textMuted
                      }
                    />
                  </View>

                  <View style={styles.itemInfoCol}>
                    <View style={styles.itemTitleRow}>
                      <ThemedText
                        variant="bodyBold"
                        color={theme.colors.text}
                      >
                        {item.name}
                      </ThemedText>
                      <Badge label={item.code} variant="neutral" size="sm" />
                      <Badge
                        label={item.category}
                        variant={isItemDiag ? 'routine' : 'purple'}
                        size="sm"
                      />
                      {(item.isPhilHealthFormulary || item.philHealthCode) && (
                        <Badge label="PhilHealth" variant="success" size="sm" />
                      )}
                      {isItemOrdered && (
                        <Badge label="Already Ordered - In Order (Edit)" variant="warning" size="sm" />
                      )}
                    </View>
                    {item.description ? (
                      <ThemedText
                        variant="caption"
                        color={theme.colors.textMuted}
                        numberOfLines={1}
                      >
                        {item.description}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.itemPriceCol}>
                    <ThemedText variant="smallBold" color={theme.colors.primary}>
                      ₱{(item.standardPrice ?? 0).toLocaleString()}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Selected Item Configuration Area */}
        {selectedItem ? (
          <View style={styles.configArea}>
            <View style={styles.configHeader}>
              <View style={styles.configHeaderLeft}>
                <Icon
                  name={isSelectedAlreadyOrdered ? 'edit' : 'plus'}
                  size={theme.sizes.iconSm}
                  color={isSelectedAlreadyOrdered ? theme.colors.warningText : theme.colors.primary}
                />
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {isSelectedAlreadyOrdered ? 'Edit Order:' : 'Configure Order:'} {selectedItem.name}
                </ThemedText>
              </View>
              <View style={styles.rowCenterSm}>
                {isSelectedAlreadyOrdered && (
                  <Badge label="Edit Mode" variant="warning" size="sm" />
                )}
                <Badge label={selectedItem.code} variant="neutral" size="sm" />
              </View>
            </View>

            {/* Diagnostic Fulfillment Mode */}
            {isDiagnostic ? (
              <View style={styles.configFieldSection}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Fulfillment Mode
                </ThemedText>
                <SegmentedControl<FulfillmentMode>
                  options={FULFILLMENT_OPTIONS}
                  value={fulfillmentMode}
                  onChange={setFulfillmentMode}
                />
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {fulfillmentMode === 'in_house'
                    ? 'In-House Clinic: Point-of-care test performed in clinic; billed on Cashier invoice.'
                    : 'Outside Laboratory: Send-out requisition slip; excluded from clinic invoice.'}
                </ThemedText>
              </View>
            ) : null}

            {/* Clinical & Fasting Instructions */}
            <View style={styles.configFieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                {isDental
                  ? 'Dental Clinical Instructions & Notes'
                  : isDiagnostic
                  ? 'Fasting & Clinical Instructions'
                  : 'Procedure Instructions & Notes'}
              </ThemedText>
              <View style={styles.chipsWrap}>
                {(isDental
                  ? DENTAL_CLINICAL_INSTRUCTION_CHIPS
                  : isDiagnostic
                  ? DIAGNOSTIC_FASTING_CHIPS
                  : PROCEDURE_INSTRUCTION_CHIPS
                ).map(
                  (chip) => {
                    const isActive = instructions.includes(chip);
                    return (
                      <Pressable
                        key={chip}
                        style={[styles.instructionChip, isActive && styles.instructionChipActive]}
                        onPress={() => handleToggleChip(chip)}
                        accessibilityRole="button"
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                        >
                          {chip}
                        </ThemedText>
                      </Pressable>
                    );
                  }
                )}
              </View>
              <Input
                placeholder="Optional custom clinical notes or instructions..."
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={2}
                testID={`${testID}-instructions-input`}
              />
            </View>

            {/* Price Preview Card */}
            <View style={styles.pricePreviewCard}>
              <View style={styles.pricePreviewRow}>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  Price Preview:
                </ThemedText>
                <View style={styles.pricePreviewValueRow}>
                  {isDiagnostic && fulfillmentMode === 'outside' ? (
                    <>
                      <Badge label="Outside Requisition" variant="info" size="sm" />
                      <ThemedText variant="smallBold" color={theme.colors.textMuted}>
                        ₱0 Clinic Fee
                      </ThemedText>
                    </>
                  ) : isYakapCovered ? (
                    <>
                      <Badge label="PhilHealth Yakap - ₱0 Co-pay" variant="success" size="sm" />
                      <ThemedText variant="title" color={theme.colors.successText}>
                        ₱0
                      </ThemedText>
                    </>
                  ) : (
                    <ThemedText variant="title" color={theme.colors.primary}>
                      ₱{(selectedItem.standardPrice ?? 0).toLocaleString()}
                    </ThemedText>
                  )}
                </View>
              </View>
              {isYakapCovered ? (
                <ThemedText variant="caption" color={theme.colors.successText}>
                  PhilHealth Yakap formulary benefit covers 100% patient co-pay (Standard fee: ₱
                  {(selectedItem.standardPrice ?? 0).toLocaleString()}).
                </ThemedText>
              ) : isDiagnostic && fulfillmentMode === 'outside' ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Patient will receive requisition slip for partner laboratory fulfillment. No clinic fee is billed.
                </ThemedText>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Standard clinic fee will be added to the patient consultation invoice upon encounter signing.
                </ThemedText>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.unselectedPlaceholder}>
            <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Select an item from the list above to configure fulfillment mode, instructions, and review pricing.
            </ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

export default OrderCatalogSearchModal;

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.xs,
  },
  listScrollArea: {
    maxHeight: 260,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  listScrollContent: {
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  itemRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  itemRowOrdered: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.warningBorder,
  },
  rowCenterSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  itemRadioSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.sizes.iconMd,
  },
  itemInfoCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  itemPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  configArea: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  configHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  configFieldSection: {
    gap: theme.spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  instructionChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  instructionChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  pricePreviewCard: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  pricePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  pricePreviewValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  unselectedPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  targetToothBanner: {
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
