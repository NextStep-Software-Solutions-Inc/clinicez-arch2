import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator, Modal, Alert } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { pharmacyService, PharmacyInventoryItemDto } from '../../services/pharmacyService';

const SAMPLE_INVENTORY: PharmacyInventoryItemDto[] = [
  {
    id: 'med-1',
    sku: 'MED-001',
    genericName: 'Amlodipine Besylate',
    brandName: 'Norvasc',
    dosageForm: 'Tablet',
    strength: '5mg',
    currentStock: 450,
    reorderLevel: 100,
    unitCost: 4.50,
    unitPrice: 8.50,
    isDangerousDrug: false,
    isLowStock: false,
    batches: [
      { id: 'b1', batchNumber: 'B-AML-2026-03', expiryDate: '2026-11-30', quantityReceived: 200, quantityRemaining: 150, receivedDate: '2026-07-01', status: 'Active' },
      { id: 'b2', batchNumber: 'B-AML-2026-08', expiryDate: '2027-08-15', quantityReceived: 300, quantityRemaining: 300, receivedDate: '2026-08-20', status: 'Active' }
    ]
  },
  {
    id: 'med-2',
    sku: 'MED-002',
    genericName: 'Losartan Potassium',
    brandName: 'Cozaar',
    dosageForm: 'Tablet',
    strength: '50mg',
    currentStock: 320,
    reorderLevel: 100,
    unitCost: 6.20,
    unitPrice: 12.00,
    isDangerousDrug: false,
    isLowStock: false,
    batches: [
      { id: 'b3', batchNumber: 'B-LOS-2026-04', expiryDate: '2026-12-31', quantityReceived: 150, quantityRemaining: 120, receivedDate: '2026-07-10', status: 'Active' },
      { id: 'b4', batchNumber: 'B-LOS-2026-09', expiryDate: '2027-09-30', quantityReceived: 200, quantityRemaining: 200, receivedDate: '2026-09-01', status: 'Active' }
    ]
  },
  {
    id: 'med-3',
    sku: 'MED-003',
    genericName: 'Co-Amoxiclav',
    brandName: 'Augmentin',
    dosageForm: 'Tablet',
    strength: '625mg',
    currentStock: 45,
    reorderLevel: 50,
    unitCost: 18.00,
    unitPrice: 28.00,
    isDangerousDrug: false,
    isLowStock: true,
    batches: [
      { id: 'b5', batchNumber: 'B-AMX-2026-01', expiryDate: '2027-02-28', quantityReceived: 100, quantityRemaining: 45, receivedDate: '2026-06-15', status: 'Active' }
    ]
  },
  {
    id: 'med-4',
    sku: 'MED-004',
    genericName: 'Metformin HCl',
    brandName: 'Glucophage',
    dosageForm: 'Tablet',
    strength: '500mg',
    currentStock: 680,
    reorderLevel: 150,
    unitCost: 3.00,
    unitPrice: 6.25,
    isDangerousDrug: false,
    isLowStock: false,
    batches: [
      { id: 'b6', batchNumber: 'B-MET-2026-02', expiryDate: '2026-10-31', quantityReceived: 400, quantityRemaining: 280, receivedDate: '2026-07-01', status: 'Active' }
    ]
  },
  {
    id: 'med-5',
    sku: 'MED-005',
    genericName: 'Paracetamol',
    brandName: 'Biogesic',
    dosageForm: 'Tablet',
    strength: '500mg',
    currentStock: 1200,
    reorderLevel: 300,
    unitCost: 1.50,
    unitPrice: 3.50,
    isDangerousDrug: false,
    isLowStock: false,
    batches: [
      { id: 'b7', batchNumber: 'B-PCM-2026-05', expiryDate: '2027-05-31', quantityReceived: 1200, quantityRemaining: 1200, receivedDate: '2026-08-01', status: 'Active' }
    ]
  }
];

export default function InventoryScreen() {
  const [inventory, setInventory] = useState<PharmacyInventoryItemDto[]>(SAMPLE_INVENTORY);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // New batch modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMed, setSelectedMed] = useState<PharmacyInventoryItemDto | null>(null);
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newBatchQty, setNewBatchQty] = useState('100');
  const [newBatchExpiry, setNewBatchExpiry] = useState('2027-12-31');

  const fetchInventory = useCallback(async () => {
    const [data] = await pharmacyService.getInventory(search, lowStockOnly);
    if (data && data.length > 0) {
      setInventory(data);
    } else if (!search && !lowStockOnly) {
      setInventory(SAMPLE_INVENTORY);
    } else {
      setInventory(data || []);
    }
  }, [search, lowStockOnly]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInventory();
    setRefreshing(false);
  };

  const handleSeed = async () => {
    setSeeding(true);
    await pharmacyService.seedInventory();
    await fetchInventory();
    setSeeding(false);
  };

  const handleAddBatch = async () => {
    if (!selectedMed || !newBatchNumber.trim()) {
      Alert.alert('Validation Error', 'Batch Number is required.');
      return;
    }

    const qty = parseInt(newBatchQty, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Validation Error', 'Valid quantity is required.');
      return;
    }

    const [updated, err] = await pharmacyService.addBatch({
      inventoryItemId: selectedMed.id,
      batchNumber: newBatchNumber.trim(),
      expiryDate: new Date(newBatchExpiry).toISOString(),
      quantityReceived: qty
    });

    if (err) {
      Alert.alert('Error', err.message || 'Failed to add batch.');
      return;
    }

    setModalVisible(false);
    await fetchInventory();
    Alert.alert('Success', `Batch ${newBatchNumber} added to ${selectedMed.genericName}.`);
  };

  const openAddBatch = (med: PharmacyInventoryItemDto) => {
    setSelectedMed(med);
    setNewBatchNumber(`B-${med.sku}-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`);
    setNewBatchQty('100');
    setModalVisible(true);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Drug Inventory & Formulary</ThemedText>
        <ThemedText style={styles.title}>Stock & Batch Management</ThemedText>
      </View>

      {/* Search and Filters */}
      <View style={styles.filterRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by drug name or SKU..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9CA3AF"
        />
        <View style={styles.btnRow}>
          <Pressable
            style={[styles.filterBtn, lowStockOnly && styles.filterBtnActive]}
            onPress={() => setLowStockOnly(!lowStockOnly)}
          >
            <ThemedText style={[styles.filterBtnText, lowStockOnly && styles.filterBtnTextActive]}>
              {lowStockOnly ? '✓ Low Stock' : 'Filter Low Stock'}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.seedBtn} onPress={handleSeed} disabled={seeding}>
            {seeding ? (
              <ActivityIndicator color="#0D9488" size="small" />
            ) : (
              <ThemedText style={styles.seedBtnText}>Sync / Seed</ThemedText>
            )}
          </Pressable>
        </View>
      </View>

      {/* Inventory List */}
      <View style={styles.list}>
        {inventory.map((item) => {
          const isLowStock = item.currentStock <= item.reorderLevel;

          return (
            <View key={item.id || item.sku} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.skuContainer}>
                  <ThemedText style={styles.skuText}>{item.sku}</ThemedText>
                  {item.brandName ? (
                    <ThemedText style={styles.brandText}>({item.brandName})</ThemedText>
                  ) : null}
                </View>
                <ThemedText
                  style={[
                    styles.statusBadge,
                    isLowStock ? styles.lowStockBadge : styles.inStockBadge,
                  ]}
                >
                  {isLowStock ? 'Low Stock' : 'In Stock'}
                </ThemedText>
              </View>

              <ThemedText style={styles.medName}>
                {item.genericName} {item.strength}
              </ThemedText>
              <ThemedText style={styles.dosageForm}>{item.dosageForm}</ThemedText>

              <View style={styles.stockRow}>
                <ThemedText style={styles.stockText}>
                  Total Stock: <ThemedText style={{ fontWeight: '800', color: isLowStock ? '#DC2626' : '#0F766E' }}>{item.currentStock}</ThemedText> units
                </ThemedText>
                <ThemedText style={styles.priceText}>₱{item.unitPrice.toFixed(2)} / unit</ThemedText>
              </View>

              {/* Batches Breakdown (FEFO Tracking) */}
              <View style={styles.batchesContainer}>
                <View style={styles.rowBetween}>
                  <ThemedText style={styles.batchesTitle}>Active Batches (FEFO Order):</ThemedText>
                  <Pressable onPress={() => openAddBatch(item)}>
                    <ThemedText style={styles.addBatchText}>+ Add Batch</ThemedText>
                  </Pressable>
                </View>

                {item.batches && item.batches.length > 0 ? (
                  item.batches
                    .filter((b) => b.quantityRemaining > 0)
                    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                    .map((batch, bIdx) => (
                      <View key={batch.id || bIdx} style={styles.batchPill}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <ThemedText style={styles.batchNo}>{batch.batchNumber}</ThemedText>
                            {bIdx === 0 ? (
                              <ThemedText style={styles.fefoTag}>FEFO NEXT</ThemedText>
                            ) : null}
                          </View>
                          <ThemedText style={styles.batchExpiry}>
                            Exp: {new Date(batch.expiryDate).toLocaleDateString()}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.batchStock}>
                          {batch.quantityRemaining} units
                        </ThemedText>
                      </View>
                    ))
                ) : (
                  <ThemedText style={styles.noBatchesText}>No active batches recorded.</ThemedText>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Add Batch Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Add Batch Restock</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              {selectedMed?.genericName} {selectedMed?.strength}
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Batch / Lot Number</ThemedText>
              <TextInput
                style={styles.modalInput}
                value={newBatchNumber}
                onChangeText={setNewBatchNumber}
                placeholder="e.g. B-AML-2026-99"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Received Quantity</ThemedText>
              <TextInput
                style={styles.modalInput}
                value={newBatchQty}
                onChangeText={setNewBatchQty}
                keyboardType="numeric"
                placeholder="100"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Expiration Date (YYYY-MM-DD)</ThemedText>
              <TextInput
                style={styles.modalInput}
                value={newBatchExpiry}
                onChangeText={setNewBatchExpiry}
                placeholder="2027-12-31"
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleAddBatch}>
                <ThemedText style={styles.confirmBtnText}>Save Batch</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#0D9488',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  filterRow: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterBtnActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterBtnTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  seedBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },
  seedBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skuText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
    fontFamily: 'monospace',
  },
  brandText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inStockBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
  },
  lowStockBadge: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  medName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  dosageForm: {
    fontSize: 12,
    color: '#6B7280',
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stockText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  priceText: {
    fontSize: 14,
    color: '#0D9488',
    fontWeight: '800',
  },
  batchesContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    gap: 6,
    marginTop: 6,
  },
  batchesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
  },
  addBatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
  },
  batchPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  batchNo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  fefoTag: {
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  batchExpiry: {
    fontSize: 11,
    color: '#6B7280',
  },
  batchStock: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  noBatchesText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#0D9488',
    fontWeight: '600',
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
