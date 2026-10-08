import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Add Item Modal State
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Consultation');
  const [itemPrice, setItemPrice] = useState('500');
  const [itemDescription, setItemDescription] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Fee Schedule & Services Catalog"
          subtitle="Fees, outpatient consultations, diagnostic procedures, and clinical price lists"
          rightAction={
            <Button title="Add service item" icon="plus" onPress={handleOpenAdd} />
          }
        />
        <CardContent>
          <View style={styles.chipRow}>
            {(['All', 'Consultation', 'Procedure', 'Diagnostic', 'Medicine', 'NursingService'] as const).map(
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
          </View>

          {showSkeletons ? (
            <SkeletonList rows={4} />
          ) : servicesLoadError ? (
            <ErrorState compact title="Could not load the catalog" message={servicesLoadError} onRetry={onRefreshServices} />
          ) : visibleServices.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No catalog items found"
              description={
                selectedCategory === 'All'
                  ? 'Add consultation fees and medical procedures to your clinic price list.'
                  : `No items in ${selectedCategory} category yet.`
              }
              actionTitle="Add first service"
              onAction={handleOpenAdd}
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
                    </View>

                    {item.description ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {item.description}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.priceCol}>
                    <ThemedText variant="bodyBold" color={theme.colors.primary}>
                      {formatPeso(item.standardPrice)}
                    </ThemedText>
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
            {['Consultation', 'Procedure', 'Diagnostic', 'Medicine', 'NursingService'].map((cat) => (
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
          label="Notes or instructions (optional)"
          value={itemDescription}
          onChangeText={setItemDescription}
          placeholder="Optional notes or procedure prep instructions"
          multiline
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
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
});
