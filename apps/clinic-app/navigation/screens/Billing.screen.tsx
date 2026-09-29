import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card, StatCard } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import {
  clinicService,
  InvoiceRecord,
  DiscountType,
  PaymentMethod,
  ClinicServiceItem,
  PatientQueueItem,
} from '../../services/clinicService';

interface LineItemForm {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  qty: number;
}

const DEFAULT_SERVICES: ClinicServiceItem[] = [
  { id: 'svc-1', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'CONS-GEN', name: 'General Consultation', category: 'Consultation', standardPrice: 500, isActive: true },
  { id: 'svc-2', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'CONS-PEDIA', name: 'Pediatric Consultation', category: 'Consultation', standardPrice: 600, isActive: true },
  { id: 'svc-3', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'PROC-NEB', name: 'Nebulization Therapy', category: 'Procedure', standardPrice: 250, isActive: true },
  { id: 'svc-4', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'PROC-WOUND', name: 'Wound Dressing & Debridement', category: 'Procedure', standardPrice: 350, isActive: true },
  { id: 'svc-5', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'PROC-ECG', name: '12-Lead Electrocardiogram (ECG)', category: 'Diagnostic', standardPrice: 450, isActive: true },
  { id: 'svc-6', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'PROC-SUTURE', name: 'Minor Suture / Laceration Repair', category: 'Procedure', standardPrice: 850, isActive: true },
  { id: 'svc-7', tenantId: 'tenant-1', clinicId: 'clinic-1', code: 'LAB-RBS', name: 'Random Blood Sugar (RBS) Rapid Test', category: 'Diagnostic', standardPrice: 150, isActive: true },
];

const SAMPLE_QUEUE_FOR_BILLING: PatientQueueItem[] = [
  {
    id: 'q-001',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-001',
    sequenceNumber: 1,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-101',
    patientName: 'Maria Santos (42F)',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Routine',
    status: 'InConsultation',
    checkInTime: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    chiefComplaint: 'Hypertension Follow-up',
    hasVitals: true,
  },
  {
    id: 'q-002',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-002',
    sequenceNumber: 2,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-102',
    patientName: 'Juan Dela Cruz (Senior)',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Urgent',
    status: 'Triaged',
    checkInTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    chiefComplaint: 'Acute Chest Discomfort',
    hasVitals: true,
  },
];

export default function BillingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [services, setServices] = useState<ClinicServiceItem[]>(DEFAULT_SERVICES);
  const [patients, setPatients] = useState<PatientQueueItem[]>(SAMPLE_QUEUE_FOR_BILLING);
  const [selectedPatient, setSelectedPatient] = useState<PatientQueueItem>(SAMPLE_QUEUE_FOR_BILLING[0]);

  // Billing Line Items
  const [lineItems, setLineItems] = useState<LineItemForm[]>([
    { id: '1', code: 'CONS-GEN', name: 'General Consultation', category: 'Consultation', price: 500, qty: 1 }
  ]);

  // Discount
  const [discountType, setDiscountType] = useState<DiscountType>('None');
  const [discountId, setDiscountId] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashTendered, setCashTendered] = useState('500');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Status
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orNumber: string; netAmount: number; change: number } | null>(null);
  const [notification, setNotification] = useState<{ text: string; isError?: boolean } | null>(null);

  // Remittance metrics summary
  const [remittance, setRemittance] = useState({
    grossToday: 2450,
    cashInDrawer: 1600,
    gcashCollected: 850,
    discountsGiven: 490,
  });

  const loadInitialData = useCallback(async () => {
    const [[servicesData, svcErr], [queueData, qErr], [eodData, eodErr]] = await Promise.all([
      clinicService.getServices(),
      clinicService.getQueue(),
      clinicService.getDailyEodReport(),
    ]);

    if (!svcErr && servicesData && servicesData.length > 0) {
      setServices(servicesData);
    }
    if (!qErr && queueData && queueData.length > 0) {
      setPatients(queueData);
    }
    if (!eodErr && eodData) {
      setRemittance({
        grossToday: eodData.totalGrossAmount,
        cashInDrawer: eodData.cashInDrawer,
        gcashCollected: eodData.collectionsByMethod.find(c => c.method === 'GCash')?.totalAmount ?? 0,
        discountsGiven: eodData.totalDiscountsGiven,
      });
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const params = route.params as { patientId?: string; patientName?: string } | undefined;
    if (params?.patientId) {
      const p = patients.find((x) => x.patientId === params.patientId);
      if (p) {
        setSelectedPatient(p);
      } else if (params.patientName) {
        setSelectedPatient({
          id: `q-${Date.now()}`,
          tenantId: 'tenant-default',
          clinicId: 'clinic-default',
          queueNumber: 'WALK-IN',
          sequenceNumber: 99,
          queueDate: new Date().toISOString().split('T')[0],
          patientId: params.patientId,
          patientName: params.patientName,
          priority: 'Routine',
          status: 'Completed',
          checkInTime: new Date().toISOString(),
          hasVitals: true,
        });
      }
    }
  }, [route.params, patients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  }, [loadInitialData]);

  // Financial Computations
  const grossAmount = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  let discountPercentage = 0;
  if (discountType === 'SeniorCitizen' || discountType === 'Pwd') {
    discountPercentage = 20;
  } else if (discountType === 'PhilHealthKonsulta') {
    discountPercentage = 100;
  }
  const discountAmount = Math.round(grossAmount * (discountPercentage / 100));
  const netAmount = Math.max(0, grossAmount - discountAmount);

  const tenderedVal = parseFloat(cashTendered) || 0;
  const changeDue = paymentMethod === 'Cash' ? Math.max(0, tenderedVal - netAmount) : 0;

  const handleAddService = (svc: ClinicServiceItem) => {
    setLineItems(prev => [
      ...prev,
      {
        id: `li-${Date.now()}-${Math.random()}`,
        code: svc.code,
        name: svc.name,
        category: svc.category,
        price: svc.standardPrice,
        qty: 1,
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setLineItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSettlePayment = async () => {
    setNotification(null);
    setLastReceipt(null);

    if (lineItems.length === 0) {
      Alert.alert('Empty Invoice', 'Please add at least one billable service or item.');
      return;
    }

    if ((discountType === 'SeniorCitizen' || discountType === 'Pwd') && !discountId.trim()) {
      setNotification({
        text: '⚠️ Regulatory Mandate: Senior OSCA ID / PWD ID is required for 20% statutory discount.',
        isError: true,
      });
      return;
    }

    if (paymentMethod === 'Cash' && tenderedVal < netAmount) {
      setNotification({
        text: `⚠️ Insufficient cash tendered. Net amount is ₱${netAmount.toFixed(2)}.`,
        isError: true,
      });
      return;
    }

    setIsProcessing(true);

    const invoicePayload = {
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      queueItemId: selectedPatient.id,
      attendingDoctorId: selectedPatient.doctorId,
      attendingDoctorName: selectedPatient.doctorName,
      discountType,
      discountIdNumber: discountId,
      notes: `Settled via ${paymentMethod}`,
      lineItems: lineItems.map(l => ({
        serviceItemId: undefined,
        itemCode: l.code,
        description: l.name,
        category: l.category,
        unitPrice: l.price,
        quantity: l.qty,
      })),
    };

    const [invoice, invErr] = await clinicService.createInvoice(invoicePayload);

    let orNumber = `OR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`;

    if (invoice?.id && netAmount > 0) {
      const [paidInvoice, payErr] = await clinicService.recordPayment(invoice.id, {
        amount: netAmount,
        method: paymentMethod,
        referenceNumber: referenceNumber || undefined,
        notes: `Received from ${selectedPatient.patientName}`,
      });
      if (!payErr && paidInvoice?.payments.length) {
        orNumber = paidInvoice.payments[paidInvoice.payments.length - 1].paymentNumber;
      }
    }

    setIsProcessing(false);

    setLastReceipt({
      orNumber,
      netAmount,
      change: changeDue,
    });

    setRemittance(prev => ({
      grossToday: prev.grossToday + grossAmount,
      cashInDrawer: paymentMethod === 'Cash' ? prev.cashInDrawer + netAmount : prev.cashInDrawer,
      gcashCollected: paymentMethod === 'GCash' ? prev.gcashCollected + netAmount : prev.gcashCollected,
      discountsGiven: prev.discountsGiven + discountAmount,
    }));

    setNotification({
      text: `✓ Payment settled! Official Receipt #${orNumber} issued. Change: ₱${changeDue.toFixed(2)}`,
      isError: false,
    });
  };

  return (
    <ResponsiveLayout
      headerTitle="Clinic Cashier & POS"
      headerSubtitle="Billing, Statutory Discounts (RA 9994/10754) & Official Receipts"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Cashier & POS</ThemedText>
        <ThemedText style={styles.title}>Billing & Settlements</ThemedText>
      </View>

      {/* Cash Register / Remittance Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>₱{remittance.grossToday.toLocaleString()}</ThemedText>
          <ThemedText style={styles.statLabel}>Today's Invoiced</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#16A34A' }]}>₱{remittance.cashInDrawer.toLocaleString()}</ThemedText>
          <ThemedText style={styles.statLabel}>Cash in Drawer</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#0284C7' }]}>₱{remittance.gcashCollected.toLocaleString()}</ThemedText>
          <ThemedText style={styles.statLabel}>E-Wallet / Card</ThemedText>
        </View>
      </View>

      {/* Patient Selector */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionHeading}>Patient to Bill</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientRow}>
          {patients.map(p => {
            const isSelected = selectedPatient.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSelectedPatient(p);
                  setLastReceipt(null);
                  setNotification(null);
                }}
                style={[styles.patientPill, isSelected && styles.patientPillActive]}
              >
                <ThemedText style={[styles.pillBadge, isSelected && styles.pillBadgeActive]}>
                  {p.queueNumber}
                </ThemedText>
                <ThemedText style={[styles.pillName, isSelected && styles.pillNameActive]}>
                  {p.patientName}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Notification Banner */}
      {notification && (
        <View style={[styles.bannerCard, notification.isError && styles.bannerCardError]}>
          <ThemedText style={[styles.bannerText, notification.isError && styles.bannerTextError]}>
            {notification.text}
          </ThemedText>
        </View>
      )}

      {/* Official Receipt Banner (If Just Paid) */}
      {lastReceipt && (
        <View style={styles.receiptCard}>
          <ThemedText style={styles.receiptTitle}>OFFICIAL RECEIPT SEALED</ThemedText>
          <ThemedText style={styles.receiptOr}>OR #{lastReceipt.orNumber}</ThemedText>
          <ThemedText style={styles.receiptDetails}>
            Amount Paid: ₱{lastReceipt.netAmount.toFixed(2)} • Change Returned: ₱{lastReceipt.change.toFixed(2)}
          </ThemedText>
          <ThemedText style={styles.receiptBiller}>Billed by Cashier Station • St. Jude Family Clinic</ThemedText>
          <Pressable
            style={{
              backgroundColor: '#1E293B',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              marginTop: 8,
              alignItems: 'center',
            }}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <ThemedText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
              📊 Return to Dashboard & Remittance →
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Billable Line Items */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionHeading}>Invoice Items ({lineItems.length})</ThemedText>
        <View style={styles.card}>
          {lineItems.map(item => (
            <View key={item.id} style={styles.lineItemRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.itemTitle}>{item.name}</ThemedText>
                <ThemedText style={styles.itemCategory}>{item.category} • ₱{item.price.toFixed(2)} x {item.qty}</ThemedText>
              </View>
              <ThemedText style={styles.itemPrice}>₱{(item.price * item.qty).toFixed(2)}</ThemedText>
              <Pressable onPress={() => handleRemoveItem(item.id)} style={styles.removeBtn}>
                <ThemedText style={styles.removeBtnText}>✕</ThemedText>
              </Pressable>
            </View>
          ))}

          {/* Quick Add Fee Schedule Buttons */}
          <ThemedText style={styles.catalogHeading}>+ Add Service from Catalog</ThemedText>
          <View style={styles.catalogGrid}>
            {services.map(svc => (
              <Pressable key={svc.id} style={styles.svcBtn} onPress={() => handleAddService(svc)}>
                <ThemedText style={styles.svcBtnText}>{svc.name}</ThemedText>
                <ThemedText style={styles.svcBtnPrice}>₱{svc.standardPrice}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Statutory Discounts (Philippine RA 9994 / RA 10754) */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionHeading}>Statutory & Policy Discounts</ThemedText>
        <View style={styles.discountRow}>
          {[
            { key: 'None', label: 'Regular' },
            { key: 'SeniorCitizen', label: 'Senior (20%)' },
            { key: 'Pwd', label: 'PWD (20%)' },
            { key: 'PhilHealthKonsulta', label: 'PhilHealth (100%)' },
          ].map(d => {
            const isActive = discountType === d.key;
            return (
              <Pressable
                key={d.key}
                onPress={() => setDiscountType(d.key as DiscountType)}
                style={[styles.discPill, isActive && styles.discPillActive]}
              >
                <ThemedText style={[styles.discPillText, isActive && styles.discPillTextActive]}>
                  {d.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {(discountType === 'SeniorCitizen' || discountType === 'Pwd') && (
          <View style={styles.discountIdWrapper}>
            <ThemedText style={styles.inputLabel}>
              {discountType === 'SeniorCitizen' ? 'Senior Citizen OSCA ID #' : 'PWD ID Number #'}
            </ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. OSCA-MNL-2026-0914"
              placeholderTextColor="#9CA3AF"
              value={discountId}
              onChangeText={setDiscountId}
            />
          </View>
        )}
      </View>

      {/* Payment Settlement Method */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionHeading}>Payment Settlement</ThemedText>
        <View style={styles.paymentMethodRow}>
          {(['Cash', 'GCash', 'Maya', 'CreditCard', 'PhilHealthKonsulta'] as PaymentMethod[]).map(m => {
            const isActive = paymentMethod === m;
            return (
              <Pressable
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={[styles.payMethodBtn, isActive && styles.payMethodBtnActive]}
              >
                <ThemedText style={[styles.payMethodText, isActive && styles.payMethodTextActive]}>
                  {m === 'CreditCard' ? 'Card' : m === 'PhilHealthKonsulta' ? 'PhilHealth' : m}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {paymentMethod === 'Cash' ? (
          <View style={styles.cashCalculator}>
            <View style={styles.cashRow}>
              <ThemedText style={styles.cashLabel}>Cash Tendered:</ThemedText>
              <TextInput
                style={styles.cashInput}
                keyboardType="numeric"
                value={cashTendered}
                onChangeText={setCashTendered}
              />
            </View>
            <View style={styles.cashRow}>
              <ThemedText style={styles.cashLabel}>Change Due:</ThemedText>
              <ThemedText style={styles.changeAmount}>₱{changeDue.toFixed(2)}</ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.discountIdWrapper}>
            <ThemedText style={styles.inputLabel}>Transaction / Reference #</ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. MP-8492019482 or Card Approval #"
              placeholderTextColor="#9CA3AF"
              value={referenceNumber}
              onChangeText={setReferenceNumber}
            />
          </View>
        )}
      </View>

      {/* Grand Totals Summary Card */}
      <View style={styles.totalsCard}>
        <View style={styles.totalRow}>
          <ThemedText style={styles.totalLabel}>Gross Amount:</ThemedText>
          <ThemedText style={styles.totalValue}>₱{grossAmount.toFixed(2)}</ThemedText>
        </View>
        {discountAmount > 0 && (
          <View style={styles.totalRow}>
            <ThemedText style={[styles.totalLabel, { color: '#DC2626' }]}>
              Discount ({discountPercentage}%):
            </ThemedText>
            <ThemedText style={[styles.totalValue, { color: '#DC2626' }]}>
              -₱{discountAmount.toFixed(2)}
            </ThemedText>
          </View>
        )}
        <View style={[styles.totalRow, styles.netRow]}>
          <ThemedText style={styles.netLabel}>Net Total Due:</ThemedText>
          <ThemedText style={styles.netValue}>₱{netAmount.toFixed(2)}</ThemedText>
        </View>
      </View>

      {/* Settle Payment Button */}
      <Pressable
        style={[styles.settleBtn, isProcessing && styles.settleBtnDisabled]}
        onPress={handleSettlePayment}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.settleBtnText}>
            Collect ₱{netAmount.toFixed(2)} & Issue Receipt
          </ThemedText>
        )}
      </Pressable>
    </ScrollView>
  </ResponsiveLayout>
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
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  patientRow: {
    gap: 8,
  },
  patientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  patientPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  pillBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  pillBadgeActive: {
    color: '#FFFFFF',
  },
  pillName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  pillNameActive: {
    color: '#FFFFFF',
  },
  bannerCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  bannerCardError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  bannerText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
  bannerTextError: {
    color: '#991B1B',
  },
  receiptCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  receiptTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '800',
    color: '#15803D',
  },
  receiptOr: {
    fontSize: 18,
    fontWeight: '800',
    color: '#166534',
  },
  receiptDetails: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  receiptBiller: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 10,
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemCategory: {
    fontSize: 11,
    color: '#6B7280',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
  },
  removeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  catalogHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginTop: 4,
  },
  catalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  svcBtn: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  svcBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369A1',
  },
  svcBtnPrice: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  discountRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  discPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  discPillActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  discPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  discPillTextActive: {
    color: '#FFFFFF',
  },
  discountIdWrapper: {
    marginTop: 6,
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  payMethodBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  payMethodBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  payMethodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  payMethodTextActive: {
    color: '#FFFFFF',
  },
  cashCalculator: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  cashInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    width: 100,
    textAlign: 'right',
  },
  changeAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
  },
  totalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  netLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  netValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0284C7',
  },
  settleBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  settleBtnDisabled: {
    opacity: 0.6,
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
