import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Modal,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { openDocument, openDocumentBlob } from '../../services/documentOpener';
import {
  clinicService,
  DiscountType,
  PaymentMethod,
  ClinicServiceItem,
  PatientQueueItem,
  InvoiceRecord,
  ClinicSettingsRecord,
  ClinicPatient,
  getManilaTodayStr,
} from '../../services/clinicService';
import {
  printReceiptDialog,
  printThermalReceipt,
  printProfessionalReceipt,
  type PrintLetterhead,
  type ReceiptData,
  type InvoicePdfData,
  type ReceiptItem,
} from '../../utils/printHelper';
import {
  type BillingLineItem,
  consolidateLineItems,
} from '../../utils/billingUtils';

export type LineItemForm = BillingLineItem;
export { consolidateLineItems };

type BillingTab = 'active' | 'unsettled' | 'paid';

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
  isPromissory?: boolean;
  promissoryDueDate?: string;
  promissoryReason?: string;
}

interface Remittance {
  grossToday: number;
  cashInDrawer: number;
  gcashCollected: number;
  discountsGiven: number;
  totalUnpaidBalances?: number;
}

interface ReceiptSummary extends ReceiptData {
  invoiceId?: string;
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
  invoices?: string;
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
  const isPromissory = Boolean(
    openInv?.notes?.includes('[PROMISSORY NOTE]') ||
    openInv?.notes?.toLowerCase().includes('promissory note')
  );
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
    isPromissory,
  };
}

export default function BillingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isWide = width >= theme.breakpoints.desktop;

  const { facilityName, accreditationNumber, taxIdentificationNumber, letterhead } = useClinic();
  const { current: currentStaff, currentName } = useStaff();

  const [activeTab, setActiveTab] = useState<BillingTab>('active');
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
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [currentPatientProfile, setCurrentPatientProfile] = useState<ClinicPatient | null>(null);
  const handledParamPatientRef = useRef<string | null>(null);

  // Defer / Promissory Note Modal State
  const [deferModalVisible, setDeferModalVisible] = useState(false);
  const [deferReason, setDeferReason] = useState('Patient requested deferred settlement / promissory note signed');
  const [deferDueDate, setDeferDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [deferGuarantor, setDeferGuarantor] = useState('');
  const [isDeferring, setIsDeferring] = useState(false);

  // Custom Item Modal State
  const [customItemModalVisible, setCustomItemModalVisible] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState('Supply');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');
  const [customItemDoctorName, setCustomItemDoctorName] = useState('');

  const loadInitialData = useCallback(async () => {
    const todayStr = getManilaTodayStr();
    const [
      [servicesData, svcErr],
      [queueData, qErr],
      [eodData, eodErr],
      [invoicesTodayData, invErr],
      [openDraftsData, draftErr],
      [settingsData],
    ] = await Promise.all([
      clinicService.getServices(),
      clinicService.getQueue({ date: todayStr, view: 'All' }),
      clinicService.getDailyEodReport(todayStr),
      clinicService.getInvoices(todayStr),
      clinicService.getInvoices(undefined, undefined, 'Draft'),
      clinicService.getSettings(),
    ]);

    const errors: LoadErrors = {};

    if (svcErr) {
      errors.services = svcErr.message || 'Unable to load the service catalog.';
    } else {
      setServices(servicesData ?? []);
    }

    if (invErr && draftErr) {
      errors.invoices = invErr.message || 'Unable to load invoices.';
    }

    const invoiceMap = new Map<string, InvoiceRecord>();
    for (const inv of (invoicesTodayData ?? [])) invoiceMap.set(inv.id, inv);
    for (const inv of (openDraftsData ?? [])) invoiceMap.set(inv.id, inv);
    const allInvoices = Array.from(invoiceMap.values());
    setInvoices(allInvoices);
    if (settingsData) setClinicSettings(settingsData);

    const billedMap = new Map<string, string>();
    const openSoaMap = new Map<string, InvoiceRecord>();

    for (const inv of allInvoices) {
      if (inv.status === 'Voided') continue;
      if (inv.status === 'Draft' || inv.status === 'PartiallyPaid') {
        if (inv.queueItemId) openSoaMap.set(inv.queueItemId, inv);
        if (inv.patientId) openSoaMap.set(inv.patientId, inv);
      } else if (inv.status === 'Paid') {
        if (inv.queueItemId) billedMap.set(inv.queueItemId, inv.invoiceNumber);
        if (inv.patientId) billedMap.set(inv.patientId, inv.invoiceNumber);
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
      const totalUnpaidBalances = allInvoices
        .filter((i) => i.status !== 'Paid' && i.status !== 'Voided')
        .reduce((sum, i) => sum + (i.balanceDue ?? Math.max(0, i.netAmount - (i.amountPaid ?? 0))), 0);

      setRemittance({
        grossToday: eodData.totalGrossAmount,
        cashInDrawer: eodData.cashInDrawer,
        gcashCollected: eodData.collectionsByMethod.find(c => c.method === 'GCash')?.totalAmount ?? 0,
        discountsGiven: eodData.totalDiscountsGiven,
        totalUnpaidBalances,
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
        doctorId: l.doctorId,
        doctorName: l.doctorName,
      }));
      setLineItems(consolidateLineItems(initialItems));
      setDiscountType(p.activeInvoice.discountType || 'None');
      setDiscountId(p.activeInvoice.discountIdNumber || '');
    } else {
      setActiveInvoice(null);
      setLineItems([]);
      setDiscountType('None');
      setDiscountId('');
    }

    // Auto-detect and prefill Senior Citizen or PWD ID from patient profile
    try {
      const [patientData] = await clinicService.getPatientById(p.patientId);
      if (patientData) {
        setCurrentPatientProfile(patientData);
        if (!p.activeInvoice) {
          if (patientData.seniorCitizenId) {
            setDiscountType('SeniorCitizen');
            setDiscountId(patientData.seniorCitizenId);
          } else if (patientData.pwdId) {
            setDiscountType('Pwd');
            setDiscountId(patientData.pwdId);
          }
        }
      }
    } catch {
      // Non-fatal if demographic lookup fails
    }

    // Do NOT auto-rehydrate procedures if the patient has already been billed and settled today
    if (p.isAlreadyBilled && !p.hasOpenSoa) {
      return;
    }

    // Collect all items already billed and paid today for this patient to prevent double-billing
    const paidInvoicesTodayForPatient = invoices.filter(
      (inv) => inv.patientId === p.patientId && inv.status === 'Paid'
    );
    const alreadyPaidItemCodes = new Set<string>();
    const alreadyPaidItemNames = new Set<string>();
    for (const paidInv of paidInvoicesTodayForPatient) {
      for (const item of paidInv.lineItems || []) {
        if (item.itemCode) alreadyPaidItemCodes.add(item.itemCode.toLowerCase());
        if (item.description) alreadyPaidItemNames.add(item.description.toLowerCase());
      }
    }

    // Auto-rehydrate any unbilled in-clinic procedures or consultations for today
    try {
      const [[procsData], [consultsData]] = await Promise.all([
        clinicService.getProcedures(p.patientId),
        clinicService.getConsultations(p.patientId),
      ]);

      const updatedItems = [...initialItems];
      let addedCount = 0;

      // Ensure consultation service fee is present if not already billed
      const hasConsultationItem = updatedItems.some(
        (i) => i.category?.toLowerCase() === 'consultation' || i.name.toLowerCase().includes('consultation')
      );
      const isConsultationPaid = Array.from(alreadyPaidItemNames).some(name => name.includes('consultation'));

      if (!hasConsultationItem && !isConsultationPaid && (p.doctorId || (consultsData && consultsData.length > 0))) {
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
          doctorId: p.doctorId,
          doctorName: p.doctorName,
        });
        addedCount++;
      }

      // Check for ordered in-clinic procedures not yet in line items and not already paid
      if (procsData && procsData.length > 0) {
        for (const proc of procsData) {
          if (proc.status === 'Cancelled') continue;
          const alreadyBilled = updatedItems.some(
            (i) => i.name.toLowerCase() === proc.procedureName.toLowerCase() ||
                   (proc.procedureCode && i.code === proc.procedureCode)
          );
          const isProcPaid =
            alreadyPaidItemNames.has(proc.procedureName.toLowerCase()) ||
            (proc.procedureCode && alreadyPaidItemCodes.has(proc.procedureCode.toLowerCase()));

          if (!alreadyBilled && !isProcPaid) {
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
              doctorId: proc.orderedByDoctorId || p.doctorId,
              doctorName: proc.orderedByDoctorName || p.doctorName,
            });
            addedCount++;
          }
        }
      }

      if (addedCount > 0) {
        setLineItems(consolidateLineItems(updatedItems));
        notify.info(`Auto-populated ${addedCount} consultation & procedure service(s) for ${p.patientName}.`);
      }
    } catch {
      // Non-fatal if procedure lookup fails
    }
  }, [services, clinicSettings, invoices]);

  useEffect(() => {
    if (loading) return;
    const params = route.params as { patientId?: string; patientName?: string } | undefined;
    if (params?.patientId && handledParamPatientRef.current !== params.patientId) {
      handledParamPatientRef.current = params.patientId;
      const p = patients.find((x) => x.patientId === params.patientId);
      if (p) {
        handleSelectPatient(p);
      } else if (params.patientName) {
        const matchingDraft = invoices.find(
          (inv) => inv.patientId === params.patientId && (inv.status === 'Draft' || inv.status === 'PartiallyPaid')
        );
        const matchingPaid = invoices.find(
          (inv) => inv.patientId === params.patientId && inv.status === 'Paid'
        );
        const newP: BillingPatient = {
          key: `patient-${params.patientId}`,
          patientId: params.patientId,
          patientName: params.patientName,
          hasOpenSoa: Boolean(matchingDraft),
          activeInvoice: matchingDraft,
          isAlreadyBilled: !matchingDraft && Boolean(matchingPaid),
          existingInvoiceNumber: matchingDraft ? matchingDraft.invoiceNumber : matchingPaid?.invoiceNumber,
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
    const targetDoctorId = selectedPatient?.doctorId;
    const targetDoctorName = selectedPatient?.doctorName || currentName;
    const targetCode = (svc.code || '').trim().toLowerCase();
    const targetName = svc.name.trim().toLowerCase();
    const targetPrice = svc.standardPrice;

    setLineItems((prev) => {
      const existingIndex = prev.findIndex((item) => {
        const itemCode = (item.code || '').trim().toLowerCase();
        const itemName = item.name.trim().toLowerCase();
        const itemDoctorId = (item.doctorId || '').trim();
        const itemDoctorName = (item.doctorName || '').trim().toLowerCase();

        const codeMatches = targetCode && itemCode ? itemCode === targetCode : itemName === targetName;
        const priceMatches = Math.abs(item.price - targetPrice) < 0.001;
        const doctorMatches = itemDoctorId && targetDoctorId
          ? itemDoctorId === targetDoctorId
          : itemDoctorId === (targetDoctorId || '') ||
            (!itemDoctorId && !targetDoctorId && itemDoctorName === (targetDoctorName || '').trim().toLowerCase());

        return codeMatches && priceMatches && doctorMatches;
      });

      if (existingIndex >= 0) {
        return prev.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + 1 } : item
        );
      }

      return [
        ...prev,
        {
          id: `li-${Date.now()}-${Math.random()}`,
          code: svc.code,
          name: svc.name,
          category: svc.category,
          price: svc.standardPrice,
          qty: 1,
          doctorId: targetDoctorId,
          doctorName: targetDoctorName,
        }
      ];
    });
  };

  const handleUpdateQty = (itemId: string, newQty: number) => {
    const validQty = Math.max(1, newQty);
    setLineItems(prev =>
      prev.map(item => (item.id === itemId ? { ...item, qty: validQty } : item))
    );
  };

  const handleAddCustomItem = () => {
    const name = customItemName.trim();
    const price = parseFloat(customItemPrice) || 0;
    const qty = parseInt(customItemQty, 10) || 1;
    const targetDoctorId = selectedPatient?.doctorId;
    const targetDoctorName = customItemDoctorName.trim() || selectedPatient?.doctorName || currentName;
    if (!name) {
      notify.error('Item description is required.');
      return;
    }

    setLineItems((prev) => {
      const targetName = name.toLowerCase();
      const existingIndex = prev.findIndex((item) => {
        const itemName = item.name.trim().toLowerCase();
        const itemDoctorId = (item.doctorId || '').trim();
        const itemDoctorName = (item.doctorName || '').trim().toLowerCase();

        const nameMatches = itemName === targetName;
        const priceMatches = Math.abs(item.price - price) < 0.001;
        const doctorMatches = itemDoctorId && targetDoctorId
          ? itemDoctorId === targetDoctorId
          : itemDoctorId === (targetDoctorId || '') ||
            (!itemDoctorId && !targetDoctorId && itemDoctorName === (targetDoctorName || '').trim().toLowerCase());

        return nameMatches && priceMatches && doctorMatches;
      });

      if (existingIndex >= 0) {
        return prev.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + Math.max(1, qty) } : item
        );
      }

      return [
        ...prev,
        {
          id: `custom-${Date.now()}-${Math.random()}`,
          code: `CUST-${Date.now().toString().slice(-4)}`,
          name,
          category: customItemCategory || 'Supply',
          price,
          qty: Math.max(1, qty),
          doctorId: targetDoctorId,
          doctorName: targetDoctorName,
        },
      ];
    });
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');
    setCustomItemModalVisible(false);
    notify.success(`Added ${name} with clinician attribution.`);
  };

  const handleSelectUnsettledInvoice = (inv: InvoiceRecord) => {
    const p: BillingPatient = {
      key: `unsettled-${inv.id}`,
      patientId: inv.patientId,
      patientName: inv.patientName,
      queueItemId: inv.queueItemId,
      hasOpenSoa: true,
      activeInvoice: inv,
      isAlreadyBilled: false,
      existingInvoiceNumber: inv.invoiceNumber,
      isPromissory: true,
    };
    handleSelectPatient(p);
    setActiveTab('active');
  };

  const handleDeferPayment = async () => {
    if (!selectedPatient) return;
    if (lineItems.length === 0) {
      Alert.alert('Empty invoice', 'Add at least one billable item before generating a promissory note.');
      return;
    }
    if (!deferDueDate.trim()) {
      notify.error('Promissory due date is mandatory.');
      return;
    }
    if (!deferReason.trim()) {
      notify.error('Audit reason for promissory note is mandatory.');
      return;
    }

    setIsDeferring(true);
    const guarantorText = deferGuarantor.trim() ? ` (Guarantor: ${deferGuarantor.trim()})` : '';
    const promissoryNote = `[PROMISSORY NOTE] Patient deferred payment due on ${deferDueDate.trim()}. Reason: ${deferReason.trim()} (Auth: ${currentName || 'Authorized Cashier'})${guarantorText}`.trim();

    try {
      const lineItemsPayload = lineItems.map((l) => ({
        serviceItemId: undefined,
        itemCode: l.code,
        description: l.name,
        category: l.category,
        unitPrice: l.price,
        quantity: l.qty,
        doctorId: l.doctorId,
        doctorName: l.doctorName,
      }));

      if (activeInvoice) {
        const [updated, err] = await clinicService.updateInvoice(activeInvoice.id, {
          discountType,
          discountIdNumber: discountId,
          notes: promissoryNote,
          lineItems: lineItemsPayload,
        });
        if (err || !updated) {
          throw new Error(err?.message || 'Unable to update invoice with promissory note.');
        }
      } else {
        const [created, err] = await clinicService.createInvoice({
          patientId: selectedPatient.patientId,
          patientName: selectedPatient.patientName,
          queueItemId: selectedPatient.queueItemId,
          attendingDoctorId: selectedPatient.doctorId,
          discountType,
          discountIdNumber: discountId,
          notes: promissoryNote,
          allowDuplicate: true,
          lineItems: lineItemsPayload,
        });
        if (err || !created) {
          throw new Error(err?.message || 'Unable to create invoice for promissory note.');
        }
      }

      if (selectedPatient.queueItemId) {
        await clinicService.completeQueueItem(selectedPatient.queueItemId);
      }

      notify.success(`Promissory note logged for ${selectedPatient.patientName}. Moved to Unsettled.`);
      setDeferModalVisible(false);
      setSelectedPatient(null);
      setActiveInvoice(null);
      setLineItems([]);
      await loadInitialData();
      setActiveTab('unsettled');
    } catch (err: any) {
      Alert.alert('Promissory note failed', err?.message || 'Unable to log promissory note.');
    } finally {
      setIsDeferring(false);
    }
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

  const handleDiscountTypeChange = (type: DiscountType) => {
    setDiscountType(type);
    if (type === 'SeniorCitizen') {
      setDiscountId(currentPatientProfile?.seniorCitizenId || '');
    } else if (type === 'Pwd') {
      setDiscountId(currentPatientProfile?.pwdId || '');
    } else if (type === 'PhilHealthKonsulta') {
      setDiscountId(currentPatientProfile?.philHealthNumber || '');
    } else {
      setDiscountId('');
    }
  };

  const handlePrintThermalReceipt = () => {
    if (!lastReceipt) return;
    printThermalReceipt(lastReceipt, printLetterhead);
  };

  const handlePrintOfficialReceiptPdf = (receipt?: ReceiptSummary | InvoiceRecord) => {
    const target = receipt || lastReceipt;
    if (!target) return;
    const invId = 'invoiceId' in target ? target.invoiceId : ('id' in target ? target.id : undefined);
    if (invId) {
      openDocument(clinicService.getInvoicePdfUrl(invId));
      return;
    }
    handlePrintProfessionalReceipt(target);
  };

  const handlePrintProfessionalReceipt = (receipt?: ReceiptSummary | InvoiceRecord) => {
    if (receipt) {
      const invId = 'invoiceId' in receipt ? receipt.invoiceId : ('id' in receipt ? receipt.id : undefined);
      if (invId) {
        openDocument(clinicService.getInvoicePdfUrl(invId));
        return;
      }
      if ('items' in receipt && Array.isArray((receipt as any).items)) {
        printProfessionalReceipt(receipt as ReceiptSummary, printLetterhead);
      } else {
        const inv = receipt as InvoiceRecord;
        const payment = inv.payments?.[0];
        const receiptData: ReceiptData = {
          orNumber: payment?.paymentNumber || inv.invoiceNumber.replace(/^INV-/, 'OR-'),
          invoiceNumber: inv.invoiceNumber,
          patientName: inv.patientName,
          patientId: inv.patientId,
          cashierName: payment?.receivedByStaffName || inv.billedByStaffName || currentName,
          paidAt: payment?.paymentDate
            ? new Date(payment.paymentDate).toLocaleString('en-PH')
            : new Date(inv.invoiceDate).toLocaleString('en-PH'),
          paymentMethod: payment?.method || 'Cash',
          referenceNumber: payment?.referenceNumber,
          grossAmount: inv.grossAmount,
          discountType: inv.discountType,
          discountIdNumber: inv.discountIdNumber,
          discountAmount: inv.discountAmount,
          netAmount: inv.netAmount,
          cashTendered: payment?.method === 'Cash' ? payment.amount : undefined,
          change: 0,
          items: (inv.lineItems || []).map((li) => ({
            code: li.itemCode,
            description: li.description,
            category: li.category,
            unitPrice: li.unitPrice,
            quantity: li.quantity,
            totalPrice: li.totalPrice,
            doctorId: li.doctorId,
            doctorName: li.doctorName,
          })),
        };
        printProfessionalReceipt(receiptData, printLetterhead);
      }
    } else if (lastReceipt) {
      printProfessionalReceipt(lastReceipt, printLetterhead);
    }
  };

  const handleReprintPaidThermal = (inv: InvoiceRecord) => {
    const payment = inv.payments?.[0];
    const receiptData: ReceiptData = {
      orNumber: payment?.paymentNumber || inv.invoiceNumber,
      invoiceNumber: inv.invoiceNumber,
      patientName: inv.patientName,
      patientId: inv.patientId,
      cashierName: payment?.receivedByStaffName || inv.billedByStaffName || currentName,
      paidAt: payment?.paymentDate
        ? new Date(payment.paymentDate).toLocaleString('en-PH')
        : new Date(inv.invoiceDate).toLocaleString('en-PH'),
      paymentMethod: payment?.method || 'Cash',
      referenceNumber: payment?.referenceNumber,
      grossAmount: inv.grossAmount,
      discountType: inv.discountType,
      discountIdNumber: inv.discountIdNumber,
      discountAmount: inv.discountAmount,
      netAmount: inv.netAmount,
      cashTendered: payment?.method === 'Cash' ? payment.amount : undefined,
      change: 0,
      items: (inv.lineItems || []).map((li) => ({
        code: li.itemCode,
        description: li.description,
        category: li.category,
        unitPrice: li.unitPrice,
        quantity: li.quantity,
        totalPrice: li.totalPrice,
        doctorId: li.doctorId,
        doctorName: li.doctorName,
      })),
    };
    printThermalReceipt(receiptData, printLetterhead);
  };

  const handlePrintReceipt = () => {
    handlePrintThermalReceipt();
  };

  const handlePrintInvoicePdf = async () => {
    if (activeInvoice?.id) {
      openDocument(clinicService.getInvoicePdfUrl(activeInvoice.id));
      return;
    }

    if (selectedPatient) {
      try {
        const [blob, err] = await clinicService.downloadInvoicePreviewPdf({
          patientId: selectedPatient.patientId,
          patientName: selectedPatient.patientName,
          queueNumber: selectedPatient.queueNumber,
          attendingDoctorName: selectedPatient.doctorName,
          discountType,
          discountIdNumber: discountId.trim() || undefined,
          lineItems: lineItems.map((li) => ({
            serviceItemId: undefined,
            itemCode: li.code,
            description: li.name,
            category: li.category,
            unitPrice: li.price,
            quantity: li.qty,
          })),
          notes: 'Statement of Account Preview',
        });
        if (blob && !err) {
          openDocumentBlob(blob);
        } else {
          notify.error('Unable to generate backend SOA PDF.');
        }
      } catch {
        notify.error('Failed to stream SOA PDF.');
      }
    }
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
          doctorId: l.doctorId,
          doctorName: l.doctorName,
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
          doctorId: l.doctorId,
          doctorName: l.doctorName,
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
      doctorId: li.doctorId,
      doctorName: li.doctorName,
    }));

    setLastReceipt({
      invoiceId: invoiceToPayId,
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
    setReceiptModalVisible(true);

    // Persist Senior Citizen / PWD ID to patient profile in background if updated
    if (currentPatientProfile && selectedPatient) {
      const seniorIdChanged =
        discountType === 'SeniorCitizen' &&
        discountId.trim() &&
        currentPatientProfile.seniorCitizenId !== discountId.trim();
      const pwdIdChanged =
        discountType === 'Pwd' &&
        discountId.trim() &&
        currentPatientProfile.pwdId !== discountId.trim();

      if (seniorIdChanged || pwdIdChanged) {
        clinicService
          .updatePatient(selectedPatient.patientId, {
            ...currentPatientProfile,
            seniorCitizenId:
              discountType === 'SeniorCitizen'
                ? discountId.trim()
                : currentPatientProfile.seniorCitizenId,
            pwdId:
              discountType === 'Pwd' ? discountId.trim() : currentPatientProfile.pwdId,
          })
          .catch(() => {});
      }
    }

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
    setCurrentPatientProfile(null);
    setLineItems([]);
    setCashTendered('');
    setReferenceNumber('');
    setDiscountId('');
    setDiscountType('None');
    setAllowDuplicate(false);

    // Clear route param so subsequent loadInitialData does NOT re-select this patient!
    handledParamPatientRef.current = null;
    const currentRouteParams = route.params as { patientId?: string; patientName?: string } | undefined;
    if (currentRouteParams?.patientId) {
      navigation.setParams({ patientId: undefined, patientName: undefined });
    }

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
          {typeof remittance.totalUnpaidBalances === 'number' && remittance.totalUnpaidBalances > 0 && (
            <StatCard
              label="Unpaid / Promissory"
              value={formatPeso(remittance.totalUnpaidBalances)}
              icon="alertCircle"
              valueColor={theme.colors.emergencyText}
              style={styles.statItem}
            />
          )}
        </>
      )}
    </View>
  );

  const activePatients = patientChoices.filter(
    (p) => (!p.isAlreadyBilled || p.hasOpenSoa) && !p.isPromissory
  );
  const patientsToBill = selectedPatient && !activePatients.some((p) => p.key === selectedPatient.key)
    ? [selectedPatient, ...activePatients]
    : activePatients;
  const paidInvoicesToday = invoices.filter((i) => i.status === 'Paid');
  const unsettledInvoices = invoices.filter(
    (i) =>
      i.status !== 'Paid' &&
      i.status !== 'Voided' &&
      (Boolean(i.notes?.includes('[PROMISSORY NOTE]')) ||
        Boolean(i.notes?.toLowerCase().includes('promissory')) ||
        Boolean((i as any).isDeferred) ||
        patientChoices.some((p) => p.isPromissory && (p.activeInvoice?.id === i.id || p.patientId === i.patientId))),
  );

  const renderPatientSelector = () => (
    <Card>
      <CardHeader title="Patient to bill" icon="patient" />
      {loading ? (
        <SkeletonList rows={2} rowHeight={theme.sizes.controlMd} />
      ) : loadErrors.queue ? (
        <ErrorState compact title="Queue unavailable" message={loadErrors.queue} onRetry={retryLoad} />
      ) : patientsToBill.length === 0 ? (
        <EmptyState
          icon="patients"
          title="No patients waiting to be billed"
          description="Checked-in patients and completed encounters awaiting payment appear here."
        />
      ) : (
        <View style={styles.chipRow}>
          {patientsToBill.map(p => {
            const isSelected = selectedPatient?.key === p.key;
            const statusTag = p.hasOpenSoa ? ' (SOA Ready)' : '';
            return (
              <Button
                key={p.key}
                size="sm"
                variant={isSelected ? 'primary' : p.hasOpenSoa ? 'secondary' : 'outline'}
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

  const renderBilledAndPaidToday = () => (
    <Card style={styles.billedCard}>
      <CardHeader
        title="Billed & Paid Today"
        icon="checkCircle"
        rightAction={<Badge label={`${paidInvoicesToday.length}`} variant="success" size="sm" />}
      />
      {paidInvoicesToday.length === 0 ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.emptyBilledText}>
          No invoices have been settled today yet. Paid receipts will appear here for fast reprinting.
        </ThemedText>
      ) : (
        <View style={styles.billedList}>
          {paidInvoicesToday.map((inv) => {
            const payment = inv.payments?.[0];
            const receiptOr = payment?.paymentNumber || inv.invoiceNumber;
            const payTime = payment?.paymentDate
              ? new Date(payment.paymentDate).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
              : new Date(inv.invoiceDate).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
            return (
              <View key={inv.id} style={styles.billedRow}>
                <View style={styles.flexFill}>
                  <View style={styles.billedTitleRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {inv.patientName}
                    </ThemedText>
                    <Badge label={`OR #${receiptOr}`} variant="success" size="sm" />
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {payTime} • {payment?.method || 'Cash'} • Net: {formatPeso(inv.netAmount)}
                    {inv.attendingDoctorName ? ` • Dr. ${inv.attendingDoctorName}` : ''}
                  </ThemedText>
                </View>
                <View style={styles.billedActionsRow}>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="print"
                    title="Print OR (Thermal Paper)"
                    onPress={() => handleReprintPaidThermal(inv)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    icon="fileText"
                    title="Print OR (PDF)"
                    onPress={() => handlePrintOfficialReceiptPdf(inv)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="receipt"
                    title="View SOA (PDF)"
                    onPress={() => openDocument(clinicService.getInvoicePdfUrl(inv.id))}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );

  const renderReceiptModal = () => (
    <Modal
      visible={receiptModalVisible}
      onClose={() => setReceiptModalVisible(false)}
      title="Payment Received"
    >
      {lastReceipt && (
        <View style={styles.receiptModalBody}>
          <View style={styles.receiptModalHeader}>
            <View style={styles.receiptModalIconWrap}>
              <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
            </View>
            <ThemedText variant="h3" color={theme.colors.text}>
              Payment Received
            </ThemedText>
            <ThemedText variant="title" color={theme.colors.primary}>
              OR #{lastReceipt.orNumber}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {facilityName ? `${facilityName} • ` : ''}{lastReceipt.paidAt}
            </ThemedText>
          </View>

          <View style={styles.receiptModalInfoCard}>
            <View style={styles.summaryRow}>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                Patient Name
              </ThemedText>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {lastReceipt.patientName}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                Payment Method
              </ThemedText>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {lastReceipt.paymentMethod} {lastReceipt.referenceNumber ? `(${lastReceipt.referenceNumber})` : ''}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                Cashier Officer
              </ThemedText>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {lastReceipt.cashierName}
              </ThemedText>
            </View>
            {lastReceipt.discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <ThemedText variant="body" color={theme.colors.emergencyText}>
                  Statutory Discount ({lastReceipt.discountType})
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                  -{formatPeso(lastReceipt.discountAmount)}
                </ThemedText>
              </View>
            )}
            <View style={[styles.summaryRow, styles.receiptNetRow]}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Amount Settled
              </ThemedText>
              <ThemedText variant="h3" color={theme.colors.successText}>
                {formatPeso(lastReceipt.netAmount)}
              </ThemedText>
            </View>
            {lastReceipt.change > 0 && (
              <View style={styles.summaryRow}>
                <ThemedText variant="body" color={theme.colors.textSecondary}>
                  Change Returned
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {formatPeso(lastReceipt.change)}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.receiptModalActions}>
            <Button
              size="md"
              icon="print"
              variant="primary"
              title="Print OR (Thermal Paper)"
              onPress={handlePrintThermalReceipt}
            />
            <Button
              size="md"
              icon="fileText"
              variant="secondary"
              title="Print OR (PDF)"
              onPress={() => handlePrintOfficialReceiptPdf(lastReceipt || undefined)}
            />
            <Button
              size="md"
              variant="outline"
              icon="receipt"
              title="View SOA (PDF)"
              onPress={() => {
                if (lastReceipt.invoiceId) {
                  openDocument(clinicService.getInvoicePdfUrl(lastReceipt.invoiceId));
                }
              }}
            />
          </View>

          <View style={styles.receiptModalDoneRow}>
            <Button
              size="md"
              variant="ghost"
              title="Close"
              onPress={() => setReceiptModalVisible(false)}
            />
          </View>
        </View>
      )}
    </Modal>
  );

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
                {item.category}{item.doctorName ? ` • ${item.doctorName.startsWith('Dr.') ? item.doctorName : `Dr. ${item.doctorName}`}` : ''} · {formatPeso(item.price)}
              </ThemedText>
            </View>
            <View style={styles.qtyStepperRow}>
              <Pressable
                onPress={() => handleUpdateQty(item.id, item.qty - 1)}
                style={styles.qtyBtn}
                accessibilityRole="button"
                accessibilityLabel={`Decrease quantity of ${item.name}`}
              >
                <Icon name="minus" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
              </Pressable>
              <ThemedText variant="bodyBold" style={styles.qtyText}>
                {item.qty}
              </ThemedText>
              <Pressable
                onPress={() => handleUpdateQty(item.id, item.qty + 1)}
                style={styles.qtyBtn}
                accessibilityRole="button"
                accessibilityLabel={`Increase quantity of ${item.name}`}
              >
                <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
              </Pressable>
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

      <View style={styles.customItemActionRow}>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          title="+ Custom Supply / Med"
          onPress={() => {
            setCustomItemDoctorName(selectedPatient?.doctorName || currentName);
            setCustomItemModalVisible(true);
          }}
        />
      </View>

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
            onPress={() => handleDiscountTypeChange(d.key)}
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

      <View style={styles.settleActionRow}>
        <Button
          variant="success"
          size="lg"
          icon="check"
          title={
            activeInvoice
              ? `Settle SOA · ${formatPeso(netAmount)}`
              : `Collect & Issue Receipt · ${formatPeso(netAmount)}`
          }
          loading={isProcessing}
          disabled={
            !selectedPatient ||
            lineItems.length === 0 ||
            (Boolean(selectedPatient.isAlreadyBilled) && !activeInvoice && !allowDuplicate)
          }
          onPress={handleSettlePayment}
          style={styles.settlePrimaryButton}
        />
        {selectedPatient && lineItems.length > 0 && (
          <Button
            variant="outline"
            size="md"
            icon="clock"
            title="Defer / Issue Promissory Note"
            disabled={isProcessing || isDeferring}
            onPress={() => {
              setDeferReason('');
              const defDate = new Date();
              defDate.setDate(defDate.getDate() + 7);
              setDeferDueDate(defDate.toISOString().split('T')[0]);
              setDeferModalVisible(true);
            }}
            style={styles.settleDeferButton}
          />
        )}
      </View>
    </Card>
  );

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <Pressable
        style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
        onPress={() => setActiveTab('active')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'active' }}
      >
        <Icon
          name="clock"
          size={theme.sizes.iconSm}
          color={activeTab === 'active' ? theme.colors.primary : theme.colors.textSecondary}
        />
        <ThemedText
          variant={activeTab === 'active' ? 'bodyBold' : 'body'}
          color={activeTab === 'active' ? theme.colors.primary : theme.colors.textSecondary}
        >
          Active Queue
        </ThemedText>
        <Badge
          label={`${activePatients.length}`}
          variant={activeTab === 'active' ? 'primary' : 'neutral'}
          size="sm"
        />
      </Pressable>

      <Pressable
        style={[styles.tabButton, activeTab === 'unsettled' && styles.tabButtonActive]}
        onPress={() => setActiveTab('unsettled')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'unsettled' }}
      >
        <Icon
          name="alertCircle"
          size={theme.sizes.iconSm}
          color={activeTab === 'unsettled' ? theme.colors.emergencyText : theme.colors.textSecondary}
        />
        <ThemedText
          variant={activeTab === 'unsettled' ? 'bodyBold' : 'body'}
          color={activeTab === 'unsettled' ? theme.colors.emergencyText : theme.colors.textSecondary}
        >
          Unsettled / Promissory
        </ThemedText>
        <Badge
          label={`${unsettledInvoices.length}`}
          variant={activeTab === 'unsettled' ? 'emergency' : 'neutral'}
          size="sm"
        />
      </Pressable>

      <Pressable
        style={[styles.tabButton, activeTab === 'paid' && styles.tabButtonActive]}
        onPress={() => setActiveTab('paid')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'paid' }}
      >
        <Icon
          name="checkCircle"
          size={theme.sizes.iconSm}
          color={activeTab === 'paid' ? theme.colors.successText : theme.colors.textSecondary}
        />
        <ThemedText
          variant={activeTab === 'paid' ? 'bodyBold' : 'body'}
          color={activeTab === 'paid' ? theme.colors.successText : theme.colors.textSecondary}
        >
          Billed & Paid Today
        </ThemedText>
        <Badge
          label={`${paidInvoicesToday.length}`}
          variant={activeTab === 'paid' ? 'success' : 'neutral'}
          size="sm"
        />
      </Pressable>
    </View>
  );

  const renderUnsettledPromissory = () => (
    <Card>
      <CardHeader
        title="Unsettled Accounts & Promissory Notes"
        icon="alertCircle"
        rightAction={<Badge label={`${unsettledInvoices.length}`} variant="emergency" size="sm" />}
      />
      {unsettledInvoices.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="No unsettled or promissory accounts"
          description="Patients with deferred payments or promissory notes will appear here for collection."
        />
      ) : (
        <View style={styles.unsettledList}>
          {unsettledInvoices.map((inv) => {
            const dueDateMatch = inv.notes?.match(/due on ([^.]+)\./i);
            const dueDate = dueDateMatch?.[1];
            const balance = inv.balanceDue ?? Math.max(0, inv.netAmount - (inv.amountPaid ?? 0));
            return (
              <View key={inv.id} style={styles.unsettledRow}>
                <View style={styles.flexFill}>
                  <View style={styles.unsettledTitleRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {inv.patientName}
                    </ThemedText>
                    <Badge label={`SOA #${inv.invoiceNumber}`} variant="warning" size="sm" />
                    {dueDate && (
                      <Badge label={`Due: ${dueDate}`} variant="emergency" size="sm" />
                    )}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Balance Due: {formatPeso(balance)} • Gross: {formatPeso(inv.grossAmount)}
                    {inv.attendingDoctorName ? ` • Dr. ${inv.attendingDoctorName}` : ''}
                  </ThemedText>
                  {inv.notes && (
                    <ThemedText variant="caption" color={theme.colors.emergencyText} numberOfLines={2}>
                      {inv.notes}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.unsettledActionsRow}>
                  <Button
                    size="sm"
                    variant="primary"
                    icon="cash"
                    title="Collect Payment"
                    onPress={() => handleSelectUnsettledInvoice(inv)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    icon="fileText"
                    title="View SOA (PDF)"
                    onPress={() => openDocument(clinicService.getInvoicePdfUrl(inv.id))}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );

  const renderDeferModal = () => (
    <Modal
      visible={deferModalVisible}
      onClose={() => setDeferModalVisible(false)}
      title="Defer Payment (Promissory Note)"
    >
      <View style={styles.modalBody}>
        <ThemedText variant="body" color={theme.colors.textSecondary}>
          Discharge patient without full payment today. The balance due of {formatPeso(netAmount)} will remain open as Accounts Receivable under the Unsettled / Promissory tab.
        </ThemedText>
        <Input
          label="Promissory Due Date"
          placeholder="YYYY-MM-DD"
          value={deferDueDate}
          onChangeText={setDeferDueDate}
          required
        />
        <Input
          label="Audit Reason"
          placeholder="e.g. Patient forgot wallet; agreed to settle next visit"
          value={deferReason}
          onChangeText={setDeferReason}
          required
        />
        <Input
          label="Guarantor / Contact (Optional)"
          placeholder="Name and contact number of guarantor"
          value={deferGuarantor}
          onChangeText={setDeferGuarantor}
        />
        <View style={styles.modalActionsRow}>
          <Button
            variant="ghost"
            size="md"
            title="Cancel"
            onPress={() => setDeferModalVisible(false)}
          />
          <Button
            variant="danger"
            size="md"
            icon="clock"
            title="Confirm Promissory & Discharge"
            loading={isDeferring}
            onPress={handleDeferPayment}
          />
        </View>
      </View>
    </Modal>
  );

  const renderCustomItemModal = () => (
    <Modal
      visible={customItemModalVisible}
      onClose={() => setCustomItemModalVisible(false)}
      title="Add Custom Supply or Medication"
    >
      <View style={styles.modalBody}>
        <Input
          label="Item Description"
          placeholder="e.g. Syringe 10ml, Sterile Gauze, Salbutamol"
          value={customItemName}
          onChangeText={setCustomItemName}
          required
        />
        <Input
          label="Unit Price (₱)"
          keyboardType="numeric"
          placeholder="0.00"
          value={customItemPrice}
          onChangeText={setCustomItemPrice}
          required
        />
        <Input
          label="Quantity"
          keyboardType="numeric"
          placeholder="1"
          value={customItemQty}
          onChangeText={setCustomItemQty}
          required
        />
        <Input
          label="Ordering / Attending Clinician"
          placeholder="Dr. Name"
          value={customItemDoctorName}
          onChangeText={setCustomItemDoctorName}
        />
        <View style={styles.modalActionsRow}>
          <Button
            variant="ghost"
            size="md"
            title="Cancel"
            onPress={() => setCustomItemModalVisible(false)}
          />
          <Button
            variant="primary"
            size="md"
            icon="plus"
            title="Add Item"
            onPress={handleAddCustomItem}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <ResponsiveLayout headerTitle="Billing">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {renderTotals()}
        {renderTabBar()}

        {activeTab === 'active' && (
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
        )}

        {activeTab === 'unsettled' && (
          <View style={[styles.columns, isWide && styles.columnsWide]}>
            <View style={[styles.column, isWide && styles.mainColumn]}>
              {renderUnsettledPromissory()}
            </View>
            {selectedPatient && (
              <View style={[styles.column, isWide && styles.sideColumn]}>
                {renderPayment()}
                {renderTotalsAndSettle()}
              </View>
            )}
          </View>
        )}

        {activeTab === 'paid' && (
          <View style={styles.columns}>
            {renderBilledAndPaidToday()}
          </View>
        )}
      </ScrollView>
      {renderReceiptModal()}
      {renderDeferModal()}
      {renderCustomItemModal()}
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
  billedCard: {
    marginTop: theme.spacing.sm,
  },
  emptyBilledText: {
    paddingVertical: theme.spacing.sm,
  },
  billedList: {
    gap: theme.spacing.sm,
  },
  billedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  billedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 2,
  },
  billedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  receiptModalBody: {
    gap: theme.spacing.md,
  },
  receiptModalHeader: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.spacing.sm,
  },
  receiptModalIconWrap: {
    marginBottom: theme.spacing.xs,
  },
  receiptModalInfoCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  receiptNetRow: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  receiptModalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  receiptModalDoneRow: {
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  qtyBtn: {
    padding: theme.spacing.xs,
  },
  qtyText: {
    minWidth: 20,
    textAlign: 'center',
  },
  customItemActionRow: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  unsettledList: {
    gap: theme.spacing.sm,
  },
  unsettledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  unsettledTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  unsettledActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  modalBody: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  settleActionRow: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  settlePrimaryButton: {
    width: '100%',
    minHeight: 46,
    justifyContent: 'center',
  },
  settleDeferButton: {
    width: '100%',
    justifyContent: 'center',
  },
});
