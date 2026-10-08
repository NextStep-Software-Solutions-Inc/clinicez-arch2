import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Alert, notify } from '@utils/feedback';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ThemedText,
  Badge,
  Button,
  Input,
  Card,
  CardHeader,
  StatCard,
  Icon,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonList,
  SkeletonStat,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import {
  clinicService,
  DiscountType,
  PaymentMethod,
  ClinicServiceItem,
  PatientQueueItem,
} from '../../services/clinicService';
import { printReceiptDialog } from '../../utils/printHelper';

interface LineItemForm {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  qty: number;
}

/** The patient being billed: either a queue entry or a patient opened from another screen. */
interface BillingPatient {
  key: string;
  patientId: string;
  patientName: string;
  queueItemId?: string;
  queueNumber?: string;
  doctorId?: string;
  doctorName?: string;
  isAlreadyBilled?: boolean;
  existingInvoiceNumber?: string;
}

interface Remittance {
  grossToday: number;
  cashInDrawer: number;
  gcashCollected: number;
  discountsGiven: number;
}

interface ReceiptSummary {
  orNumber: string;
  netAmount: number;
  change: number;
  cashierName: string;
  patientName: string;
  paidAt: string;
}

interface LoadErrors {
  services?: string;
  queue?: string;
  eod?: string;
}

const DISCOUNT_OPTIONS: Array<{ key: DiscountType; label: string }> = [
  { key: 'None', label: 'Regular' },
  { key: 'SeniorCitizen', label: 'Senior (20%)' },
  { key: 'Pwd', label: 'PWD (20%)' },
  { key: 'PhilHealthKonsulta', label: 'PhilHealth (100%)' },
];

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'GCash', 'Maya', 'CreditCard', 'PhilHealthKonsulta'];

function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'CreditCard') return 'Card';
  if (method === 'PhilHealthKonsulta') return 'PhilHealth';
  return method;
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toBillingPatient(item: PatientQueueItem, billedMap?: Map<string, string>): BillingPatient {
  const invNum = billedMap?.get(item.id);
  return {
    key: item.id,
    patientId: item.patientId,
    patientName: item.patientName,
    queueItemId: item.id,
    queueNumber: item.queueNumber,
    doctorId: item.doctorId,
    doctorName: item.doctorName,
    isAlreadyBilled: Boolean(invNum),
    existingInvoiceNumber: invNum,
  };
}

export default function BillingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isWide = width >= theme.breakpoints.desktop;

  const { facilityName, accreditationNumber, taxIdentificationNumber, letterhead } = useClinic();
  const { current: currentStaff, currentName } = useStaff();

  const [services, setServices] = useState<ClinicServiceItem[]>([]);
  const [patients, setPatients] = useState<BillingPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<BillingPatient | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [remittance, setRemittance] = useState<Remittance | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({});

  // Billing Line Items
  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);

  // Discount
  const [discountType, setDiscountType] = useState<DiscountType>('None');
  const [discountId, setDiscountId] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashTendered, setCashTendered] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Status
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptSummary | null>(null);

  const loadInitialData = useCallback(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const [[servicesData, svcErr], [queueData, qErr], [eodData, eodErr], [invoicesData]] = await Promise.all([
      clinicService.getServices(),
      clinicService.getQueue(),
      clinicService.getDailyEodReport(),
      clinicService.getInvoices(todayStr),
    ]);

    const errors: LoadErrors = {};

    if (svcErr) {
      errors.services = svcErr.message || 'Unable to load the service catalog.';
    } else {
      setServices(servicesData ?? []);
    }

    const billedMap = new Map<string, string>();
    if (invoicesData) {
      for (const inv of invoicesData) {
        if (inv.status !== 'Voided' && inv.queueItemId) {
          billedMap.set(inv.queueItemId, inv.invoiceNumber);
        }
      }
    }

    if (qErr) {
      errors.queue = qErr.message || 'Unable to load today\'s queue.';
    } else {
      setPatients((queueData ?? []).map((item) => toBillingPatient(item, billedMap)));
    }

    if (eodErr || !eodData) {
      errors.eod = eodErr?.message || 'Unable to load today\'s totals.';
      setRemittance(null);
    } else {
      setRemittance({
        grossToday: eodData.totalGrossAmount,
        cashInDrawer: eodData.cashInDrawer,
        gcashCollected: eodData.collectionsByMethod.find(c => c.method === 'GCash')?.totalAmount ?? 0,
        discountsGiven: eodData.totalDiscountsGiven,
      });
    }

    setLoadErrors(errors);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (loading) return;
    const params = route.params as { patientId?: string; patientName?: string } | undefined;
    if (params?.patientId) {
      const p = patients.find((x) => x.patientId === params.patientId);
      if (p) {
        setSelectedPatient(p);
      } else if (params.patientName) {
        setSelectedPatient({
          key: `patient-${params.patientId}`,
          patientId: params.patientId,
          patientName: params.patientName,
        });
      }
    }
  }, [route.params, patients, loading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  }, [loadInitialData]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    loadInitialData();
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

  const patientChoices =
    selectedPatient && !patients.some((p) => p.key === selectedPatient.key)
      ? [selectedPatient, ...patients]
      : patients;

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

  const handlePrintReceipt = () => {
    if (!lastReceipt) return;
    const receiptDetails = [
      `OFFICIAL RECEIPT: OR #${lastReceipt.orNumber}`,
      `DATE: ${lastReceipt.paidAt}`,
      facilityName ? `FACILITY: ${facilityName}` : '',
      taxIdentificationNumber ? `TIN: ${taxIdentificationNumber}` : '',
      accreditationNumber ? `ACCREDITATION NO.: ${accreditationNumber}` : '',
      `PATIENT: ${lastReceipt.patientName}`,
      `CASHIER: ${lastReceipt.cashierName}`,
      `----------------------------------------`,
      `NET AMOUNT PAID: ${formatPeso(lastReceipt.netAmount)}`,
      `CHANGE RETURNED: ${formatPeso(lastReceipt.change)}`,
      `STATUS: Settled & Validated`,
    ]
      .filter(Boolean)
      .join('\n');
    printReceiptDialog(`Official Receipt #${lastReceipt.orNumber}`, receiptDetails, letterhead);
  };

  const handleSettlePayment = async () => {
    setLastReceipt(null);

    if (!selectedPatient) {
      Alert.alert('Select a patient', 'Choose the patient to bill before collecting payment.');
      return;
    }

    if (!currentStaff) {
      Alert.alert(
        'Choose who you are working as',
        "Select your name under 'Working as' in the sidebar so the receipt shows who collected this payment.",
      );
      return;
    }

    if (lineItems.length === 0) {
      Alert.alert('Empty invoice', 'Please add at least one billable service or item.');
      return;
    }

    if ((discountType === 'SeniorCitizen' || discountType === 'Pwd') && !discountId.trim()) {
      notify.error('Enter the Senior OSCA ID or PWD ID number to apply the 20% statutory discount.');
      return;
    }

    if (paymentMethod === 'Cash' && tenderedVal < netAmount) {
      notify.error(`Insufficient cash tendered. Net amount is ${formatPeso(netAmount)}.`);
      return;
    }

    if (selectedPatient.isAlreadyBilled && !allowDuplicate) {
      Alert.alert(
        'Duplicate invoice blocked',
        `Invoice #${selectedPatient.existingInvoiceNumber} has already been issued for this queue visit. To bill additional services, check 'Authorize additional / duplicate invoice' below.`,
      );
      return;
    }

    setIsProcessing(true);

    const invoicePayload = {
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      queueItemId: selectedPatient.queueItemId,
      attendingDoctorId: selectedPatient.doctorId,
      attendingDoctorName: selectedPatient.doctorName,
      discountType,
      discountIdNumber: discountId,
      notes: `Settled via ${paymentMethod}`,
      allowDuplicate,
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

    if (invErr || !invoice) {
      setIsProcessing(false);
      Alert.alert('Invoice not created', invErr?.message || 'The invoice could not be created. Please try again.');
      return;
    }

    let orNumber = invoice.invoiceNumber;

    if (netAmount > 0) {
      const [paidInvoice, payErr] = await clinicService.recordPayment(invoice.id, {
        amount: netAmount,
        method: paymentMethod,
        referenceNumber: referenceNumber || undefined,
        notes: `Received from ${selectedPatient.patientName} by ${currentName}`,
      });

      if (payErr || !paidInvoice) {
        setIsProcessing(false);
        Alert.alert(
          'Payment not recorded',
          `Invoice ${invoice.invoiceNumber} was created but the payment could not be recorded: ${
            payErr?.message || 'unknown error'
          }. Check the invoice before trying again to avoid billing twice.`,
        );
        return;
      }

      const latestPayment = paidInvoice.payments[paidInvoice.payments.length - 1];
      if (latestPayment) {
        orNumber = latestPayment.paymentNumber;
      }
    }

    setIsProcessing(false);

    setLastReceipt({
      orNumber,
      netAmount,
      change: changeDue,
      cashierName: currentName,
      patientName: selectedPatient.patientName,
      paidAt: new Date().toLocaleString('en-PH'),
    });

    setRemittance(prev =>
      prev
        ? {
            grossToday: prev.grossToday + grossAmount,
            cashInDrawer: paymentMethod === 'Cash' ? prev.cashInDrawer + netAmount : prev.cashInDrawer,
            gcashCollected: paymentMethod === 'GCash' ? prev.gcashCollected + netAmount : prev.gcashCollected,
            discountsGiven: prev.discountsGiven + discountAmount,
          }
        : prev,
    );

    notify.success(`Payment recorded. Official receipt #${orNumber} issued.`);

    // Reset billing form to prevent accidental duplicate submission
    setSelectedPatient(null);
    setLineItems([]);
    setCashTendered('');
    setReferenceNumber('');
    setDiscountId('');
    setDiscountType('None');
    setAllowDuplicate(false);
    await loadInitialData();
  };

  const renderTotals = () => (
    <View style={styles.statsRow}>
      {loading ? (
        <>
          <SkeletonStat style={styles.statItem} />
          <SkeletonStat style={styles.statItem} />
          <SkeletonStat style={styles.statItem} />
        </>
      ) : loadErrors.eod || !remittance ? (
        <ErrorState
          compact
          title="Today's totals unavailable"
          message={loadErrors.eod}
          onRetry={retryLoad}
          style={styles.statsError}
        />
      ) : (
        <>
          <StatCard
            label="Invoiced today"
            value={formatPeso(remittance.grossToday)}
            icon="receipt"
            style={styles.statItem}
          />
          <StatCard
            label="Cash in drawer"
            value={formatPeso(remittance.cashInDrawer)}
            icon="cash"
            valueColor={theme.colors.successText}
            style={styles.statItem}
          />
          <StatCard
            label="GCash collected"
            value={formatPeso(remittance.gcashCollected)}
            icon="smartphone"
            valueColor={theme.colors.primary}
            style={styles.statItem}
          />
        </>
      )}
    </View>
  );

  const renderPatientSelector = () => (
    <Card>
      <CardHeader title="Patient to bill" icon="patient" />
      {loading ? (
        <SkeletonList rows={2} rowHeight={theme.sizes.controlMd} />
      ) : loadErrors.queue ? (
        <ErrorState compact title="Queue unavailable" message={loadErrors.queue} onRetry={retryLoad} />
      ) : patientChoices.length === 0 ? (
        <EmptyState
          icon="patients"
          title="No patients in today's queue"
          description="Patients appear here once they are checked in."
        />
      ) : (
        <View style={styles.chipRow}>
          {patientChoices.map(p => {
            const isSelected = selectedPatient?.key === p.key;
            return (
              <Button
                key={p.key}
                size="sm"
                variant={isSelected ? 'primary' : p.isAlreadyBilled ? 'outline' : 'secondary'}
                title={
                  (p.queueNumber ? `${p.queueNumber} · ${p.patientName}` : p.patientName) +
                  (p.isAlreadyBilled ? ' (Billed)' : '')
                }
                onPress={() => {
                  setSelectedPatient(p);
                  setLastReceipt(null);
                  setAllowDuplicate(false);
                }}
              />
            );
          })}
        </View>
      )}
    </Card>
  );

  const renderReceipt = () =>
    lastReceipt ? (
      <Card style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
          <View style={styles.flexFill}>
            <ThemedText variant="h3" color={theme.colors.successText}>
              Payment received
            </ThemedText>
            <ThemedText variant="bodyBold" color={theme.colors.successText}>
              OR #{lastReceipt.orNumber}
            </ThemedText>
          </View>
        </View>
        <ThemedText variant="body">
          Amount paid {formatPeso(lastReceipt.netAmount)}
          {lastReceipt.change > 0 ? ` · Change returned ${formatPeso(lastReceipt.change)}` : ''}
        </ThemedText>
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Collected by {lastReceipt.cashierName}
          {facilityName ? ` · ${facilityName}` : ''}
        </ThemedText>
        <View style={styles.chipRow}>
          <Button size="sm" icon="print" title="Print receipt" onPress={handlePrintReceipt} />
          <Button
            size="sm"
            variant="secondary"
            title="Back to dashboard"
            onPress={() => navigation.navigate('Dashboard')}
          />
        </View>
      </Card>
    ) : null;

  const renderInvoiceItems = () => (
    <Card>
      <CardHeader
        title="Invoice items"
        icon="receipt"
        rightAction={<Badge label={`${lineItems.length}`} variant="neutral" />}
      />
      {lineItems.length === 0 ? (
        <ThemedText variant="body" color={theme.colors.textMuted}>
          No items yet. Add a service from the catalog below.
        </ThemedText>
      ) : (
        lineItems.map(item => (
          <View key={item.id} style={styles.lineItemRow}>
            <View style={styles.flexFill}>
              <ThemedText variant="bodyBold">{item.name}</ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {item.category} · {formatPeso(item.price)} × {item.qty}
              </ThemedText>
            </View>
            <ThemedText variant="bodyBold" color={theme.colors.primary}>
              {formatPeso(item.price * item.qty)}
            </ThemedText>
            <Pressable
              onPress={() => handleRemoveItem(item.id)}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
            >
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.catalogSection}>
        <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
          Add a service
        </ThemedText>
        {loading ? (
          <View style={styles.chipRow}>
            <Skeleton width={theme.sizes.sidebarWidth / 2} height={theme.sizes.controlSm} radius={theme.radii.sm} />
            <Skeleton width={theme.sizes.sidebarWidth / 2} height={theme.sizes.controlSm} radius={theme.radii.sm} />
            <Skeleton width={theme.sizes.sidebarWidth / 2} height={theme.sizes.controlSm} radius={theme.radii.sm} />
          </View>
        ) : loadErrors.services ? (
          <ErrorState compact title="Service catalog unavailable" message={loadErrors.services} onRetry={retryLoad} />
        ) : services.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="No services in the catalog"
            description="Add services to the fee schedule in Settings to bill them here."
          />
        ) : (
          <View style={styles.chipRow}>
            {services.map(svc => (
              <Button
                key={svc.id}
                size="sm"
                variant="outline"
                icon="plus"
                title={`${svc.name} · ${formatPeso(svc.standardPrice)}`}
                onPress={() => handleAddService(svc)}
              />
            ))}
          </View>
        )}
      </View>
    </Card>
  );

  const renderDiscounts = () => (
    <Card>
      <CardHeader title="Discounts" icon="tag" />
      <View style={styles.chipRow}>
        {DISCOUNT_OPTIONS.map(d => (
          <Button
            key={d.key}
            size="sm"
            variant={discountType === d.key ? 'primary' : 'secondary'}
            title={d.label}
            onPress={() => setDiscountType(d.key)}
          />
        ))}
      </View>

      {(discountType === 'SeniorCitizen' || discountType === 'Pwd') && (
        <Input
          label={discountType === 'SeniorCitizen' ? 'Senior Citizen OSCA ID number' : 'PWD ID number'}
          placeholder="ID number"
          value={discountId}
          onChangeText={setDiscountId}
          required
        />
      )}
    </Card>
  );

  const renderPayment = () => (
    <Card>
      <CardHeader title="Payment" icon="billing" />
      <View style={styles.chipRow}>
        {PAYMENT_METHODS.map(m => (
          <Button
            key={m}
            size="sm"
            variant={paymentMethod === m ? 'primary' : 'secondary'}
            title={paymentMethodLabel(m)}
            onPress={() => setPaymentMethod(m)}
          />
        ))}
      </View>

      {paymentMethod === 'Cash' ? (
        <>
          <Input
            label="Cash tendered"
            keyboardType="numeric"
            placeholder={netAmount.toFixed(2)}
            value={cashTendered}
            onChangeText={setCashTendered}
          />
          <View style={styles.summaryRow}>
            <ThemedText variant="body" color={theme.colors.textSecondary}>
              Change due
            </ThemedText>
            <ThemedText variant="bodyBold" color={theme.colors.successText}>
              {formatPeso(changeDue)}
            </ThemedText>
          </View>
        </>
      ) : (
        <Input
          label="Transaction or reference number"
          placeholder="Reference or approval number"
          value={referenceNumber}
          onChangeText={setReferenceNumber}
        />
      )}
    </Card>
  );

  const renderTotalsAndSettle = () => (
    <Card>
      <View style={styles.summaryRow}>
        <ThemedText variant="body" color={theme.colors.textSecondary}>
          Gross amount
        </ThemedText>
        <ThemedText variant="bodyBold">{formatPeso(grossAmount)}</ThemedText>
      </View>
      {discountAmount > 0 && (
        <View style={styles.summaryRow}>
          <ThemedText variant="body" color={theme.colors.emergencyText}>
            Discount ({discountPercentage}%)
          </ThemedText>
          <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
            -{formatPeso(discountAmount)}
          </ThemedText>
        </View>
      )}
      <View style={[styles.summaryRow, styles.netRow]}>
        <ThemedText variant="h3">Net total due</ThemedText>
        <ThemedText variant="title" color={theme.colors.primary}>
          {formatPeso(netAmount)}
        </ThemedText>
      </View>

      {selectedPatient?.isAlreadyBilled && (
        <View style={styles.duplicateWarningBox}>
          <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.flexFill}>
            <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
              Patient Already Billed
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              Invoice #{selectedPatient.existingInvoiceNumber} was already issued for this encounter today.
            </ThemedText>
            <Pressable
              onPress={() => setAllowDuplicate((prev) => !prev)}
              style={styles.overrideCheck}
            >
              <ThemedText variant="captionBold" color={allowDuplicate ? theme.colors.emergencyText : theme.colors.primary}>
                {allowDuplicate ? '✓ Duplicate billing permitted' : 'Authorize additional / duplicate invoice'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      <Button
        variant="success"
        size="lg"
        icon="check"
        title={`Collect ${formatPeso(netAmount)} and issue receipt`}
        loading={isProcessing}
        disabled={!selectedPatient || lineItems.length === 0 || (Boolean(selectedPatient.isAlreadyBilled) && !allowDuplicate)}
        onPress={handleSettlePayment}
      />
    </Card>
  );

  return (
    <ResponsiveLayout headerTitle="Billing">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {renderTotals()}
        {renderReceipt()}

        <View style={[styles.columns, isWide && styles.columnsWide]}>
          <View style={[styles.column, isWide && styles.mainColumn]}>
            {renderPatientSelector()}
            {renderInvoiceItems()}
            {renderDiscounts()}
          </View>
          <View style={[styles.column, isWide && styles.sideColumn]}>
            {renderPayment()}
            {renderTotalsAndSettle()}
          </View>
        </View>
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statItem: {
    flex: 1,
  },
  statsError: {
    flex: 1,
  },
  columns: {
    gap: theme.spacing.lg,
  },
  columnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    gap: theme.spacing.lg,
  },
  mainColumn: {
    flex: 3,
  },
  sideColumn: {
    flex: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  receiptCard: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  removeBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  catalogSection: {
    gap: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  netRow: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  duplicateWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  overrideCheck: {
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
});
