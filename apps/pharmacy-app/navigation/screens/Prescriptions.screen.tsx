import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import StatusChip from '@ui/StatusChip';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { pharmacyService, PrescriptionOrderDto } from '../../services/pharmacyService';
import { describeDispenseBlock, describePaymentChip, describeStatusChip } from '../../utils/prescriptionPresentation';

const SAMPLE_FALLBACK: PrescriptionOrderDto[] = [
  {
    id: 'rx-mock-1',
    tenantId: 'default',
    pharmacyId: 'pharmacy-main',
    externalPrescriptionId: 'ext-1',
    prescriptionNumber: 'RX-20261001-0412',
    orderingFacilityId: 'clinic-1',
    orderingFacilityName: 'St. Jude Family Clinic',
    orderingDoctorName: 'Dr. Cruz, MD',
    doctorPrcLicense: '0149281',
    doctorPtr: 'PTR-2026-9912',
    patientId: 'pat-1',
    patientName: 'Maria Santos',
    patientAge: 42,
    patientGender: 'Female',
    patientAllergies: 'No Known Drug Allergies (NKDA)',
    clinicalDiagnosis: 'Essential Hypertension Stage 1',
    status: 'Pending',
    issuedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    totalAmount: 255.00,
    paymentPolicy: 'None',
    paymentStatus: 'NotRequired',
    quotedAmount: null,
    paidAt: null,
    statusReason: null,
    pharmacyName: 'St. Jude Community Pharmacy',
    dispenseBlockedReason: 'acceptance_required',
    patientLinked: true,
    items: [
      {
        id: 'i1',
        genericName: 'Amlodipine Besylate',
        brandName: 'Norvasc',
        dosage: '5mg',
        form: 'Tablet',
        sig: 'Take 1 tablet once daily in the morning',
        quantityPrescribed: 30,
        quantityDispensed: 0,
        unitPrice: 8.50,
        subtotal: 255.00,
        status: 'Pending',
        isDangerousDrug: false,
        availableBatches: []
      }
    ],
    dispenseRecords: []
  },
  {
    id: 'rx-mock-2',
    tenantId: 'default',
    pharmacyId: 'pharmacy-main',
    externalPrescriptionId: 'ext-2',
    prescriptionNumber: 'RX-20261001-0413',
    orderingFacilityId: 'clinic-1',
    orderingFacilityName: 'St. Jude Family Clinic',
    orderingDoctorName: 'Dr. Cruz, MD',
    doctorPrcLicense: '0149281',
    patientId: 'pat-2',
    patientName: 'Juan Dela Cruz',
    patientAge: 55,
    patientGender: 'Male',
    clinicalDiagnosis: 'Cardiovascular Risk / Hyperlipidemia',
    status: 'Accepted',
    issuedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    totalAmount: 360.00,
    paymentPolicy: 'Prepaid',
    paymentStatus: 'AwaitingPayment',
    quotedAmount: 360.00,
    paidAt: null,
    statusReason: null,
    pharmacyName: 'St. Jude Community Pharmacy',
    dispenseBlockedReason: 'payment_required',
    patientLinked: true,
    items: [
      {
        id: 'i2',
        genericName: 'Losartan Potassium',
        brandName: 'Cozaar',
        dosage: '50mg',
        form: 'Tablet',
        sig: 'Take 1 tablet once daily at bedtime',
        quantityPrescribed: 30,
        quantityDispensed: 0,
        unitPrice: 12.00,
        subtotal: 360.00,
        status: 'Pending',
        isDangerousDrug: false,
        availableBatches: []
      }
    ],
    dispenseRecords: []
  },
  {
    id: 'rx-mock-3',
    tenantId: 'default',
    pharmacyId: 'pharmacy-main',
    externalPrescriptionId: 'ext-3',
    prescriptionNumber: 'RX-20261001-0410',
    orderingFacilityId: 'clinic-1',
    orderingFacilityName: 'St. Jude Family Clinic',
    orderingDoctorName: 'Dr. Reyes, MD',
    doctorPrcLicense: '0129841',
    patientId: 'pat-3',
    patientName: 'Elena Ramos',
    patientAge: 29,
    patientGender: 'Female',
    clinicalDiagnosis: 'Acute Bacterial Sinusitis',
    status: 'Dispensed',
    issuedAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    dispensedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    dispensingPharmacistName: 'Karen Reyes, RPh',
    dispensingPharmacistPrc: 'PRC-0089123',
    totalAmount: 392.00,
    paymentPolicy: 'Prepaid',
    paymentStatus: 'Paid',
    quotedAmount: 392.00,
    paidAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    statusReason: null,
    pharmacyName: 'St. Jude Community Pharmacy',
    dispenseBlockedReason: null,
    patientLinked: true,
    items: [
      {
        id: 'i3',
        genericName: 'Co-Amoxiclav',
        brandName: 'Augmentin',
        dosage: '625mg',
        form: 'Tablet',
        sig: 'Take 1 tablet every 12 hours for 7 days',
        quantityPrescribed: 14,
        quantityDispensed: 14,
        allocatedBatchNumber: 'B-AMX-2026-01 (Qty: 14)',
        unitPrice: 28.00,
        subtotal: 392.00,
        status: 'Dispensed',
        isDangerousDrug: false,
        availableBatches: []
      }
    ],
    dispenseRecords: []
  }
];

export default function PrescriptionsScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState<PrescriptionOrderDto[]>(SAMPLE_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Dispensed'>('All');
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    const statusFilter = activeTab === 'All' ? undefined : activeTab;
    const [data] = await pharmacyService.getPrescriptions(statusFilter, search);
    if (data && data.length > 0) {
      setOrders(data);
    } else if (!search && activeTab === 'All') {
      // Keep fallback if API queue is empty
      setOrders(SAMPLE_FALLBACK);
    } else {
      setOrders(data || []);
    }
  }, [activeTab, search]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const pendingCount = orders.filter((o) => o.status === 'Pending').length;
  const dispensedCount = orders.filter((o) => o.status === 'Dispensed').length;

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'Pending') return o.status === 'Pending';
    if (activeTab === 'Dispensed') return o.status === 'Dispensed';
    return true;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Pharmacy Suite & Interoperability</ThemedText>
        <ThemedText style={styles.title}>E-Prescription Queue</ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{pendingCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Pending Queue</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#059669' }]}>{dispensedCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Dispensed</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#2563EB' }]}>{orders.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Total Orders</ThemedText>
        </View>
      </View>

      {/* Search & Tabs */}
      <View style={styles.controlsRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Rx number, patient, or doctor..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9CA3AF"
        />
        <View style={styles.tabBar}>
          {(['All', 'Pending', 'Dispensed'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>
          {activeTab === 'All' ? 'Incoming & Processed Orders' : `${activeTab} Prescriptions`} ({filteredOrders.length})
        </ThemedText>

        {loading ? (
          <ActivityIndicator size="large" color="#0D9488" style={{ marginVertical: 20 }} />
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>No prescriptions found for this filter.</ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredOrders.map((order) => {
              const itemsSummary = order.items.map((i) => `${i.genericName} ${i.dosage} (Qty: ${i.quantityPrescribed})`).join(' • ');
              const isOpenOrder = !['Dispensed', 'Rejected', 'Cancelled'].includes(order.status);
              const isPending = order.status === 'Pending';
              const paymentChip = describePaymentChip(order.paymentStatus);
              const blockHint = isPending ? null : describeDispenseBlock(order.dispenseBlockedReason);

              return (
                <View key={order.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <View style={styles.rxBadgeContainer}>
                      <ThemedText style={styles.rxBadge}>{order.prescriptionNumber}</ThemedText>
                      <ThemedText style={styles.facilityText}>{order.orderingFacilityName || 'Clinic EZ Partner'}</ThemedText>
                    </View>
                    <View style={styles.chipRow}>
                      <StatusChip {...describeStatusChip(order.status)} />
                      {paymentChip ? <StatusChip {...paymentChip} /> : null}
                    </View>
                  </View>

                  <View style={styles.patientRow}>
                    <ThemedText style={styles.patientName}>
                      {order.patientName} {order.patientAge ? `(${order.patientAge}${order.patientGender?.[0] ?? ''})` : ''}
                    </ThemedText>
                    <ThemedText style={styles.totalPrice}>₱{order.totalAmount.toFixed(2)}</ThemedText>
                  </View>

                  {order.clinicalDiagnosis ? (
                    <ThemedText style={styles.diagText}>Dx: {order.clinicalDiagnosis}</ThemedText>
                  ) : null}

                  <View style={styles.itemsBox}>
                    <ThemedText style={styles.itemsText}>{itemsSummary}</ThemedText>
                  </View>

                  {order.statusReason ? (
                    <ThemedText style={styles.reasonText}>Reason: {order.statusReason}</ThemedText>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <ThemedText style={styles.doctorText}>
                      Rx by {order.orderingDoctorName} • PRC: {order.doctorPrcLicense || 'Verified'}
                    </ThemedText>

                    {isOpenOrder ? (
                      <View style={styles.actionColumn}>
                        <Pressable
                          style={[styles.dispenseActionBtn, blockHint !== null && styles.dispenseActionBtnBlocked]}
                          onPress={() => navigation.navigate('Dispense', { orderId: order.id })}
                        >
                          <ThemedText style={styles.dispenseActionText}>
                            {isPending ? 'Review order' : blockHint ? 'View order' : 'Dispense (FEFO)'}
                          </ThemedText>
                        </Pressable>
                        {blockHint ? <ThemedText style={styles.blockHintText}>{blockHint}</ThemedText> : null}
                      </View>
                    ) : order.status === 'Dispensed' ? (
                      <View style={styles.dispensedInfoRow}>
                        <ThemedText style={styles.dispensedByText}>
                          ✓ Dispensed by {order.dispensingPharmacistName || 'Pharmacist'}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0D9488',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '600',
  },
  controlsRow: {
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabTextActive: {
    color: '#0D9488',
    fontWeight: '700',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rxBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rxBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  facilityText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonText: {
    fontSize: 12,
    color: '#991B1B',
    fontStyle: 'italic',
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  totalPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D9488',
  },
  diagText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  itemsBox: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  itemsText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  doctorText: {
    fontSize: 11,
    color: '#6B7280',
    flex: 1,
  },
  actionColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dispenseActionBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dispenseActionBtnBlocked: {
    backgroundColor: '#9CA3AF',
  },
  blockHintText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
  },
  dispenseActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dispensedInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dispensedByText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
});
