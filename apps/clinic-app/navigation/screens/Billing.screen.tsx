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
  InvoiceRecord,
  ClinicSettingsRecord,
} from '../../services/clinicService';
import {
  printReceiptDialog,
  printThermalReceipt,
  printProfessionalReceipt,
  printInvoicePdf,
  type PrintLetterhead,
  type ReceiptData,
  type InvoicePdfData,
  type ReceiptItem,
} from '../../utils/printHelper';

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
  hasOpenSoa?: boolean;
  activeInvoice?: InvoiceRecord;
}

interface Remittance {
  grossToday: number;
  cashInDrawer: number;
  gcashCollected: number;
  discountsGiven: number;
}

interface ReceiptSummary extends ReceiptData {
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

function formatPeso(value?: number | null): string {
  return `₱${(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toBillingPatient(
  item: PatientQueueItem,
  billedMap?: Map<string, string>,
  openSoaMap?: Map<string, InvoiceRecord>
): BillingPatient {
  const openInv = openSoaMap?.get(item.id) || openSoaMap?.get(item.patientId);
  const paidInvNum = billedMap?.get(item.id) || billedMap?.get(item.patientId);
  return {
    key: item.id,
    patientId: item.patientId,
    patientName: item.patientName,
    queueItemId: item.id,
    queueNumber: item.queueNumber,
    doctorId: item.doctorId,
    doctorName: item.doctorName,
    hasOpenSoa: Boolean(openInv),
    activeInvoice: openInv,
    isAlreadyBilled: !openInv && Boolean(paidInvNum),
    existingInvoiceNumber: openInv ? openInv.invoiceNumber : paidInvNum,
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
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettingsRecord | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<BillingPatient | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceRecord | null>(null);
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
    const [
      [servicesData, svcErr],
      [queueData, qErr],
      [eodData, eodErr],
      [invoicesData],
      [settingsData],
    ] = await Promise.all([
      clinicService.getServices(),
      clinicService.getQueue(),
      clinicService.getDailyEodReport(),
      clinicService.getInvoices(todayStr),
      clinicService.getSettings(),
    ]);

    const errors: LoadErrors = {};

    if (svcErr) {
      errors.services = svcErr.message || 'Unable to load the service catalog.';
    } else {
      setServices(servicesData ?? []);
    }

    const allInvoices = invoicesData ?? [];
    setInvoices(allInvoices);
    if (settingsData) setClinicSettings(settingsData);

    const billedMap = new Map<string, string>();
    const openSoaMap = new Map<string, InvoiceRecord>();

    for (const inv of allInvoices) {
      if (inv.status === 'Voided') continue;
      const key = inv.queueItemId || inv.patientId;
      if (inv.status === 'Draft' || inv.status === 'PartiallyPaid') {
        openSoaMap.set(key, inv);
      } else if (inv.status === 'Paid') {
        billedMap.set(key, inv.invoiceNumber);
      }
    }

    if (qErr) {
      errors.queue = qErr.message || 'Unable to load today\'s queue.';
    } else {
      setPatients((queueData ?? []).map((item) => toBillingPatient(item, billedMap, openSoaMap)));
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

  const handleSelectPatient = useCallback(async (p: BillingPatient) => {
    setSelectedPatient(p);
    setLastReceipt(null);
    setAllowDuplicate(false);

    let initialItems: LineItemForm[] = [];

    if (p.activeInvoice && p.activeInvoice.lineItems && p.activeInvoice.lineItems.length > 0) {
      setActiveInvoice(p.activeInvoice);
      initialItems = p.activeInvoice.lineItems.map(l => ({
        id: l.id || `li-${Date.now()}-${Math.random()}`,
        code: l.itemCode || '',
        name: l.description,
        category: l.category,
        price: l.unitPrice,
        qty: l.quantity,
      }));
      setLineItems(initialItems);
      setDiscountType(p.activeInvoice.discountType || 'None');
      setDiscountId(p.activeInvoice.discountIdNumber || '');
    } else {
      setActiveInvoice(null);
      setLineItems([]);
      setDiscountType('None');
      setDiscountId('');
    }

    // Auto-rehydrate any in-clinic procedures or consultations for today if missing
    try {
      const [[procsData], [consultsData]] = await Promise.all([
        clinicService.getProcedures(p.patientId),
        clinicService.getConsultations(p.patientId),
      ]);

      const updatedItems = [...initialItems];
      let addedCount = 0;

      // Ensure consultation service fee is present
      const hasConsultationItem = updatedItems.some(
        (i) => i.category?.toLowerCase() === 'consultation' || i.name.toLowerCase().includes('consultation')
      );
      if (!hasConsultationItem && (p.doctorId || (consultsData && consultsData.length > 0))) {
        const consultSvc = services.find(
          (s) => s.category?.toLowerCase() === 'consultation' || s.name.toLowerCase().includes('consultation')
        );
        const consultPrice = consultSvc?.standardPrice ?? clinicSettings?.defaultConsultationFee ?? 500;
        updatedItems.unshift({
          id: `consult-${Date.now()}`,
          code: consultSvc?.code || 'CONSULT',
          name: consultSvc?.name || 'General Medical Consultation',
          category: 'Consultation',
          price: consultPrice,
          qty: 1,
        });
        addedCount++;
      }

      // Check for ordered in-clinic procedures not yet in line items
      if (procsData && procsData.length > 0) {
        for (const proc of procsData) {
          if (proc.status === 'Cancelled') continue;
          const alreadyBilled = updatedItems.some(
            (i) => i.name.toLowerCase() === proc.procedureName.toLowerCase() ||
                   (proc.procedureCode && i.code === proc.procedureCode)
          );
          if (!alreadyBilled) {
            const matchedSvc = services.find(
              (s) => s.name.toLowerCase() === proc.procedureName.toLowerCase() ||
                     (proc.procedureCode && s.code === proc.procedureCode)
            );
            updatedItems.push({
              id: `proc-${proc.id || Date.now()}-${Math.random()}`,
              code: proc.procedureCode || matchedSvc?.code || '',
              name: proc.procedureName,
              category: proc.category || matchedSvc?.category || 'Procedure',
              price: matchedSvc?.standardPrice ?? 0,
              qty: 1,
            });
            addedCount++;
          }
        }
      }

      if (addedCount > 0) {
        setLineItems(updatedItems);
        notify.info(`Auto-populated ${addedCount} consultation & procedure service(s) for ${p.patientName}.`);
      }
    } catch {
      // Non-fatal if procedure lookup fails
    }
  }, [services, clinicSettings]);

  useEffect(() => {
    if (loading) return;
    const params = route.params as { patientId?: string; patientName?: string } | undefined;
    if (params?.patientId) {
      const p = patients.find((x) => x.patientId === params.patientId);
      if (p) {
        handleSelectPatient(p);
      } else if (params.patientName) {
        const matchingInv = invoices.find(
          inv => inv.patientId === params.patientId && (inv.status === 'Draft' || inv.status === 'PartiallyPaid')
        );
        const newP: BillingPatient = {
          key: `patient-${params.patientId}`,
          patientId: params.patientId,
          patientName: params.patientName,
          hasOpenSoa: Boolean(matchingInv),
          activeInvoice: matchingInv,
          existingInvoiceNumber: matchingInv?.invoiceNumber,
        };
        handleSelectPatient(newP);
      }
    }
  }, [route.params, patients, loading, invoices, handleSelectPatient]);

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

  const printLetterhead: PrintLetterhead = {
    header: letterhead?.header || facilityName || clinicSettings?.clinicName || 'Clinic EZ Healthcare',
    subHeader: letterhead?.subHeader,
    address: letterhead?.address,
    contact: letterhead?.contact,
    tin: taxIdentificationNumber || clinicSettings?.taxIdentificationNumber,
    accreditationNumber: accreditationNumber || clinicSettings?.accreditationNumber,
    dohLto: clinicSettings?.letterheadDohLto,
  };

  const handlePrintThermalReceipt = () => {
    if (!lastReceipt) return;
    printThermalReceipt(lastReceipt, printLetterhead);
  };

  const handlePrintProfessionalReceipt = () => {
    if (!lastReceipt) return;
    printProfessionalReceipt(lastReceipt, printLetterhead);
  };

  const handlePrintReceipt = () => {
    handlePrintThermalReceipt();
  };

  const handlePrintInvoicePdf = () => {
    if (!selectedPatient && !activeInvoice) return;
    const invNumber =
      activeInvoice?.invoiceNumber ||
      selectedPatient?.existingInvoiceNumber ||
      `SOA-${Date.now().toString().slice(-6)}`;
    const invDate = activeInvoice?.invoiceDate
      ? new Date(activeInvoice.invoiceDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
      : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

    const invoicePdfData: InvoicePdfData = {
      invoiceNumber: invNumber,
      invoiceDate: invDate,
      status: activeInvoice?.status || 'Approved',
      patientName: selectedPatient?.patientName || activeInvoice?.patientName || 'Patient',
      patientId: selectedPatient?.patientId || activeInvoice?.patientId,
      attendingDoctorName: selectedPatient?.doctorName || activeInvoice?.attendingDoctorName,
      queueNumber: selectedPatient?.queueNumber,
      grossAmount,
      discountType,
      discountIdNumber: discountId,
      discountPercentage,
      discountAmount,
      netAmount,
      notes: activeInvoice?.notes || 'Approved Clinical Invoice / Statement of Account',
      items: lineItems.map((li) => ({
        code: li.code,
        description: li.name,
        category: li.category,
        unitPrice: li.price,
        quantity: li.qty,
        totalPrice: li.price * li.qty,
      })),
    };

    printInvoicePdf(invoicePdfData, printLetterhead);
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

    setIsProcessing(true);

    let invoiceToPayId: string;
    let orNumber: string;

    if (activeInvoice) {
      invoiceToPayId = activeInvoice.id;
      orNumber = activeInvoice.invoiceNumber;

      const [updatedInvoice, updateErr] = await clinicService.updateInvoice(activeInvoice.id, {
        discountType,
        discountIdNumber: discountId,
        notes: `Settled via ${paymentMethod}`,
        lineItems: lineItems.map(l => ({
          itemCode: l.code,
          description: l.name,
          category: l.category,
          unitPrice: l.price,
          quantity: l.qty,
        })),
      });

      if (updateErr || !updatedInvoice) {
        setIsProcessing(false);
        Alert.alert('Invoice update failed', updateErr?.message || 'The Statement of Account could not be updated. Please try again.');
        return;
      }
    } else {
      if (selectedPatient.isAlreadyBilled && !allowDuplicate) {
        setIsProcessing(false);
        Alert.alert(
          'Duplicate invoice blocked',
          `Invoice #${selectedPatient.existingInvoiceNumber} has already been issued for this queue visit. To bill additional services, check 'Authorize additional / duplicate invoice' below.`,
        );
        return;
      }

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

      invoiceToPayId = invoice.id;
      orNumber = invoice.invoiceNumber;
    }

    if (netAmount > 0) {
      const [paidInvoice, payErr] = await clinicService.recordPayment(invoiceToPayId, {
        amount: netAmount,
        method: paymentMethod,
        referenceNumber: referenceNumber || undefined,
        notes: `Received from ${selectedPatient.patientName} by ${currentName}`,
      });

      if (payErr || !paidInvoice) {
        setIsProcessing(false);
        Alert.alert(
          'Payment not recorded',
          `Invoice ${orNumber} was prepared but the payment could not be recorded: ${
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

    const receiptItems: ReceiptItem[] = lineItems.map((li) => ({
      code: li.code,
      description: li.name,
      category: li.category,
      unitPrice: li.price,
      quantity: li.qty,
      totalPrice: li.price * li.qty,
    }));

    setLastReceipt({
      orNumber,
      invoiceNumber: activeInvoice?.invoiceNumber,
      patientName: selectedPatient.patientName,
      patientId: selectedPatient.patientId,
      cashierName: currentName,
      paidAt: new Date().toLocaleString('en-PH'),
      paymentMethod,
      referenceNumber: referenceNumber || undefined,
      grossAmount,
      discountType,
      discountIdNumber: discountId,
      discountAmount,
      netAmount,
      cashTendered: paymentMethod === 'Cash' ? tenderedVal : undefined,
      change: changeDue,
      items: receiptItems,
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
    setActiveInvoice(null);
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
            let statusTag = '';
            if (p.hasOpenSoa) {
              statusTag = ' (SOA Ready)';
            } else if (p.isAlreadyBilled) {
              statusTag = ' (Paid)';
            }
            return (
              <Button
                key={p.key}
                size="sm"
                variant={isSelected ? 'primary' : p.hasOpenSoa ? 'secondary' : p.isAlreadyBilled ? 'outline' : 'secondary'}
                title={
                  (p.queueNumber ? `${p.queueNumber} · ${p.patientName}` : p.patientName) + statusTag
                }
                onPress={() => handleSelectPatient(p)}
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
          <Button
            size="sm"
            icon="print"
            title="Thermal Paper (POS)"
            onPress={handlePrintThermalReceipt}
          />
          <Button
            size="sm"
            variant="secondary"
            icon="fileText"
            title="Professional PDF"
            onPress={handlePrintProfessionalReceipt}
          />
          <Button
            size="sm"
            variant="outline"
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

      {activeInvoice && (
        <View style={styles.soaHeaderBanner}>
          <Icon name="receipt" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
          <View style={styles.flexFill}>
            <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
              Statement of Account: #{activeInvoice.invoiceNumber}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.primaryDark}>
              {activeInvoice.attendingDoctorName ? `Attending: Dr. ${activeInvoice.attendingDoctorName} • ` : ''}
              Status: {activeInvoice.status}
            </ThemedText>
          </View>
          <View style={styles.chipRow}>
            <Button
              size="sm"
              variant="outline"
              icon="fileText"
              title="Print SOA (PDF)"
              onPress={handlePrintInvoicePdf}
            />
            <Badge
              label={activeInvoice.status === 'Draft' ? 'Draft SOA' : activeInvoice.status}
              variant={activeInvoice.status === 'Draft' ? 'warning' : 'info'}
              size="sm"
            />
          </View>
        </View>
      )}

      {!activeInvoice && lineItems.length > 0 && (
        <View style={styles.soaHeaderBanner}>
          <Icon name="receipt" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
          <View style={styles.flexFill}>
            <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
              Draft Statement of Account
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.primaryDark}>
              {selectedPatient?.doctorName ? `Attending: Dr. ${selectedPatient.doctorName} • ` : ''}
              Auto-populated from today's encounter &amp; procedures
            </ThemedText>
          </View>
          <Button
            size="sm"
            variant="outline"
            icon="fileText"
            title="Print SOA (PDF)"
            onPress={handlePrintInvoicePdf}
          />
        </View>
      )}

      {activeInvoice?.billingRequestedAt && (
        <View style={styles.cashierCounterBanner}>
          <Icon name="clinic" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.flexFill}>
            <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
              Dispatched to Central Cashier Station
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              This invoice was routed to the central cashier counter (Cashier App). Official receipts and cash collections should be processed at the cashier station.
            </ThemedText>
          </View>
        </View>
      )}

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

      {selectedPatient?.isAlreadyBilled && !activeInvoice && (
        <View style={styles.duplicateWarningBox}>
          <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.flexFill}>
            <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
              Patient Already Billed & Settled
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              Invoice #{selectedPatient.existingInvoiceNumber} was already issued and paid for this encounter today.
            </ThemedText>
            <Pressable
              onPress={() => setAllowDuplicate((prev) => !prev)}
              style={styles.overrideCheck}
            >
              <ThemedText variant="captionBold" color={allowDuplicate ? theme.colors.emergencyText : theme.colors.primary}>
                {allowDuplicate ? '[Authorized] Additional billing permitted' : 'Authorize additional / duplicate invoice'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      <Button
        variant="success"
        size="lg"
        icon="check"
        title={
          activeInvoice
            ? `Settle SOA (${formatPeso(netAmount)}) and issue receipt`
            : `Collect ${formatPeso(netAmount)} and issue receipt`
        }
        loading={isProcessing}
        disabled={
          !selectedPatient ||
          lineItems.length === 0 ||
          (Boolean(selectedPatient.isAlreadyBilled) && !activeInvoice && !allowDuplicate)
        }
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
  soaHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cashierCounterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
});
