import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useBreakpoint } from '../../utils/useBreakpoint';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicServiceItem } from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  All: 'All Items',
  Medicine: 'Medicines',
  Diagnostic: 'Diagnostics',
  Procedure: 'Procedures',
  Dental: 'Dental Services',
  Consultation: 'Consultations',
  NursingService: 'Nursing Services',
};

interface ServicesCatalogTabProps {
  services: ClinicServiceItem[];
  setServices: React.Dispatch<React.SetStateAction<ClinicServiceItem[]>>;
  servicesLoadError: string | null;
  showSkeletons: boolean;
  onRefreshServices: () => Promise<void>;
  formatPeso: (v: number | undefined | null) => string;
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
}

export default function ServicesCatalogTab({
  services,
  setServices,
  servicesLoadError,
  showSkeletons,
  onRefreshServices,
  formatPeso,
  showAddModal,
  setShowAddModal,
}: ServicesCatalogTabProps) {
  const { isCompact } = useBreakpoint();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Add Item Modal State
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Consultation');
  const [itemPrice, setItemPrice] = useState('500');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPhilHealthCode, setItemPhilHealthCode] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<ClinicServiceItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Consultation');
  const [editPrice, setEditPrice] = useState('500');
  const [editDescription, setEditDescription] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPhilHealthCode, setEditPhilHealthCode] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [seedingDental, setSeedingDental] = useState(false);

  const visibleServices =
    selectedCategory === 'All'
      ? services
      : services.filter((s) => s.category.toLowerCase() === selectedCategory.toLowerCase());

  const handleOpenAdd = () => {
    setItemCode(`SVC-${Math.floor(1000 + Math.random() * 9000)}`);
    setItemName('');
    setItemCategory('Consultation');
    setItemPrice('500');
    setItemDescription('');
    setItemPhilHealthCode('');
    setServiceError(null);
    setShowAddModal(true);
  };

  const handleCreateService = async () => {
    if (!itemCode.trim() || !itemName.trim()) {
      setServiceError('Item code and name are required.');
      return;
    }

    const priceNum = parseFloat(itemPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setServiceError('Enter a valid price in PHP.');
      return;
    }

    setSavingItem(true);
    setServiceError(null);

    const [created, err] = await clinicService.createService({
      code: itemCode.trim().toUpperCase(),
      name: itemName.trim(),
      category: itemCategory,
      standardPrice: priceNum,
      description: itemDescription.trim() || undefined,
      philHealthCode: itemPhilHealthCode.trim() || undefined,
    });

    setSavingItem(false);

    if (err || !created) {
      setServiceError(err?.message || 'Could not save the service item.');
      return;
    }

    setServices((prev) => [...prev, created]);
    setShowAddModal(false);
    notify.success(`Service "${created.name}" added to catalog.`);
  };

  const handleOpenEdit = (item: ClinicServiceItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditPrice(String(item.standardPrice));
    setEditDescription(item.description || '');
    setEditIsActive(item.isActive);
    setEditPhilHealthCode(item.philHealthCode || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleUpdateService = async () => {
    if (!editingItem) return;
    if (!editName.trim()) {
      setEditError('Item name is required.');
      return;
    }
    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setEditError('Enter a valid price in PHP.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const [updated, err] = await clinicService.updateService(editingItem.id, {
      name: editName.trim(),
      category: editCategory,
      standardPrice: priceNum,
      description: editDescription.trim() || undefined,
      isActive: editIsActive,
      philHealthCode: editPhilHealthCode.trim() || undefined,
    });

    setSavingEdit(false);

    if (err || !updated) {
      setEditError(err?.message || 'Could not update the service item.');
      return;
    }

    setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setShowEditModal(false);
    notify.success(`Service "${updated.name}" updated successfully.`);
  };

  const handleToggleActive = async (item: ClinicServiceItem) => {
    const nextActive = !item.isActive;
    const [updated, err] = await clinicService.updateService(item.id, {
      name: item.name,
      category: item.category,
      standardPrice: item.standardPrice,
      description: item.description,
      isActive: nextActive,
      philHealthCode: item.philHealthCode,
    });
    if (err || !updated) {
      notify.error(err?.message || 'Could not update service status.');
      return;
    }
    setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    notify.success(`Service "${item.name}" ${nextActive ? 'activated' : 'deactivated'}.`);
  };

  const handleSeedDentalServices = async () => {
    if (seedingDental) return;
    setSeedingDental(true);
    const [seeded, err] = await clinicService.seedDentalServices();
    setSeedingDental(false);

    if (err || !seeded) {
      notify.error(err?.message || 'Could not seed dental services.');
      return;
    }

    if (onRefreshServices) {
      await onRefreshServices();
    }
    // Also merge seeded items into state to guarantee immediate UI responsiveness
    setServices((prev) => {
      const existingCodes = new Set(prev.map((s) => s.code.toUpperCase()));
      const toAdd = seeded.filter((s) => !existingCodes.has(s.code.toUpperCase()));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
    notify.success('Dental services added to catalog successfully.');
  };

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Fee Schedule & Services Catalog"
          subtitle="Fees, outpatient consultations, diagnostic procedures, and clinical price lists"
          rightAction={
            <View style={styles.headerActions}>
              <Button title="Add service item" icon="plus" onPress={handleOpenAdd} />
            </View>
          }
        />
        <CardContent>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {(['All', 'Consultation', 'Procedure', 'Diagnostic', 'Dental', 'Medicine', 'NursingService'] as const).map(
              (cat) => {
                const count =
                  cat === 'All'
                    ? services.length
                    : services.filter((s) => s.category.toLowerCase() === cat.toLowerCase()).length;
                return (
                  <Chip
                    key={cat}
                    label={`${SERVICE_CATEGORY_LABEL[cat] || cat} (${count})`}
                    active={selectedCategory === cat}
                    onPress={() => setSelectedCategory(cat)}
                  />
                );
              }
            )}
          </ScrollView>

          {showSkeletons ? (
            <SkeletonList rows={4} />
          ) : servicesLoadError ? (
            <ErrorState compact title="Could not load the catalog" message={servicesLoadError} onRetry={onRefreshServices} />
          ) : visibleServices.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title={selectedCategory === 'Dental' ? 'No dental services in catalog' : 'No catalog items found'}
              description={
                selectedCategory === 'Dental'
                  ? 'Add Philippine primary care dental presets (oral prophylaxis, restorative fillings, exodontia, sealants, etc.) to your clinic fee schedule.'
                  : selectedCategory === 'All'
                  ? 'Add consultation fees and medical procedures to your clinic price list.'
                  : `No items in ${selectedCategory} category yet.`
              }
              actionTitle={selectedCategory === 'Dental' ? 'Seed Dental Services' : 'Add first service'}
              onAction={selectedCategory === 'Dental' ? handleSeedDentalServices : handleOpenAdd}
            />
          ) : (
            <View style={styles.serviceList}>
              {visibleServices.map((item) => (
                <View key={item.id} style={styles.serviceItem}>
                  <View style={styles.serviceInfoCol}>
                    <View style={styles.serviceTitleRow}>
                      <ThemedText variant="bodyBold">{item.name}</ThemedText>
                      <Badge label={item.code} variant="outline" size="sm" />
                      <Badge label={item.category} variant="neutral" size="sm" />
                      {!item.isActive && <Badge label="Inactive" variant="emergency" size="sm" />}
                      {item.philHealthCode?.trim() ? (
                        <Badge label={`PhilHealth: ${item.philHealthCode.trim()}`} variant="success" size="sm" />
                      ) : item.isPhilHealthFormulary ? (
                        <Badge label="PhilHealth" variant="success" size="sm" />
                      ) : null}
                    </View>

                    {item.description ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {item.description}
                      </ThemedText>
                    ) : null}

                    {isCompact && (
                      <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.mobilePrice}>
                        {formatPeso(item.standardPrice)}
                      </ThemedText>
                    )}
                  </View>

                  <View style={[styles.serviceRightCol, isCompact && styles.serviceRightColMobile]}>
                    {!isCompact && (
                      <ThemedText variant="bodyBold" color={theme.colors.primary}>
                        {formatPeso(item.standardPrice)}
                      </ThemedText>
                    )}
                    <View style={[styles.itemActions, isCompact && styles.itemActionsMobile]}>
                      <Button
                        title="Edit"
                        variant="secondary"
                        size="sm"
                        icon="edit"
                        style={isCompact ? styles.flexBtn : undefined}
                        onPress={() => handleOpenEdit(item)}
                      />
                      <Button
                        title={item.isActive ? 'Deactivate' : 'Activate'}
                        variant={item.isActive ? 'outline' : 'primary'}
                        size="sm"
                        style={isCompact ? styles.flexBtn : undefined}
                        onPress={() => handleToggleActive(item)}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Add Service Modal */}
      <Modal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add catalog service item"
        subtitle="Define a consultation, clinical procedure, or diagnostic item."
        maxWidth={500}
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddModal(false)} disabled={savingItem} />
            <Button title="Save item" onPress={handleCreateService} loading={savingItem} />
          </View>
        }
      >
        {serviceError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {serviceError}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexNarrow}
            label="Item code"
            required
            value={itemCode}
            onChangeText={setItemCode}
            placeholder="e.g. SVC-001"
            autoCapitalize="characters"
          />
          <Input
            containerStyle={styles.flexNarrow}
            label="Standard fee (₱)"
            required
            value={itemPrice}
            onChangeText={setItemPrice}
            placeholder="500.00"
            keyboardType="numeric"
          />
        </View>

        <Input
          label="Item description / name"
          required
          value={itemName}
          onChangeText={setItemName}
          placeholder="e.g. Pediatric Consultation, Nebulization, CBC"
        />

        <FieldGroup label="Category">
          <View style={styles.chipRow}>
            {['Consultation', 'Procedure', 'Diagnostic', 'Dental', 'Medicine', 'NursingService'].map((cat) => (
              <Chip
                key={cat}
                label={cat}
                active={itemCategory === cat}
                onPress={() => setItemCategory(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        <Input
          label="PhilHealth statutory code (optional)"
          value={itemPhilHealthCode}
          onChangeText={setItemPhilHealthCode}
          placeholder="e.g. 93000, 82947"
        />

        <Input
          label="Notes or instructions (optional)"
          value={itemDescription}
          onChangeText={setItemDescription}
          placeholder="Optional notes or procedure prep instructions"
          multiline
        />
      </Modal>

      {/* Edit Service Modal */}
      <Modal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit catalog service item"
        subtitle={`Updating ${editingItem?.code || 'service'}`}
        maxWidth={500}
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowEditModal(false)} disabled={savingEdit} />
            <Button title="Save changes" onPress={handleUpdateService} loading={savingEdit} />
          </View>
        }
      >
        {editError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {editError}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexNarrow}
            label="Item code"
            disabled
            value={editingItem?.code || ''}
            placeholder="Code"
          />
          <Input
            containerStyle={styles.flexNarrow}
            label="Standard fee (₱)"
            required
            value={editPrice}
            onChangeText={setEditPrice}
            placeholder="500.00"
            keyboardType="numeric"
          />
        </View>

        <Input
          label="Item description / name"
          required
          value={editName}
          onChangeText={setEditName}
          placeholder="e.g. Pediatric Consultation, Nebulization"
        />

        <FieldGroup label="Category">
          <View style={styles.chipRow}>
            {['Consultation', 'Procedure', 'Diagnostic', 'Dental', 'Medicine', 'NursingService'].map((cat) => (
              <Chip
                key={cat}
                label={cat}
                active={editCategory === cat}
                onPress={() => setEditCategory(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        <Input
          label="PhilHealth statutory code (optional)"
          value={editPhilHealthCode}
          onChangeText={setEditPhilHealthCode}
          placeholder="e.g. 93000, 82947"
        />

        <Input
          label="Notes or instructions (optional)"
          value={editDescription}
          onChangeText={setEditDescription}
          placeholder="Optional notes or procedure prep instructions"
          multiline
        />

        <FieldGroup label="Status">
          <View style={styles.chipRow}>
            <Chip
              label="Active (Available in appointments & billing)"
              active={editIsActive}
              onPress={() => setEditIsActive(true)}
            />
            <Chip
              label="Inactive (Archived from new bookings)"
              active={!editIsActive}
              onPress={() => setEditIsActive(false)}
            />
          </View>
        </FieldGroup>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  serviceRightCol: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  chipScroll: {
    flexGrow: 0,
    marginBottom: theme.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  serviceList: {
    gap: theme.spacing.sm,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  serviceInfoCol: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  flex1: {
    flex: 1,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 140,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.md,
  },
  serviceRightColMobile: {
    width: '100%',
    alignItems: 'stretch',
  },
  itemActionsMobile: {
    width: '100%',
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  mobilePrice: {
    marginTop: theme.spacing.xs,
  },
  flexBtn: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
});
