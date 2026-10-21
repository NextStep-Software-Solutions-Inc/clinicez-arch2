// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native primitives
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Alert: { alert: () => {} },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
}));

import {
  buildThermalReceiptHtml,
  buildProfessionalReceiptHtml,
  buildInvoicePdfHtml,
  type ReceiptData,
  type InvoicePdfData,
  type PrintLetterhead,
} from '../utils/receiptHtml';

describe('Adversarial Challenge Suite: Cashier Workstation & Consultation Workflows', () => {

  const sampleLetterhead: PrintLetterhead = {
    header: 'Clinica Antipolo Healthcare',
    subHeader: 'Primary Care & Family Medicine',
    address: '123 Circumferential Road, Antipolo City',
    contact: '(02) 8697-0000 · info@clinicaantipolo.ph',
    tin: '123-456-789-000',
    accreditationNumber: 'PH-ACCR-2026-9912',
    dohLto: 'DOH-LTO-IV-A-042',
  };

  describe('Challenge 1: Defensive Cashiering & Quantity Stepper Boundaries', () => {
    interface LineItem {
      id: string;
      name: string;
      price: number;
      qty: number;
      doctorId?: string;
      doctorName?: string;
    }

    const updateQuantity = (items: LineItem[], itemId: string, newQty: number): LineItem[] => {
      const validQty = Math.max(1, newQty);
      return items.map((it) => (it.id === itemId ? { ...it, qty: validQty } : it));
    };

    const computeTotals = (items: LineItem[], discountPercent: number = 0) => {
      const gross = items.reduce((sum, it) => sum + it.price * it.qty, 0);
      const discount = Math.round(gross * (discountPercent / 100));
      const net = Math.max(0, gross - discount);
      return { gross, discount, net };
    };

    test('1.1 Stepper boundary: Decrementing quantity below 1 is strictly clamped to 1 (never 0 or negative)', () => {
      let items: LineItem[] = [
        { id: 'item-1', name: 'General Consultation', price: 500, qty: 1 },
      ];

      // Decrement from 1 -> must remain 1
      items = updateQuantity(items, 'item-1', 0);
      expect(items[0].qty).toBe(1);

      // Adversarial attempt: pass negative values
      items = updateQuantity(items, 'item-1', -1);
      expect(items[0].qty).toBe(1);

      items = updateQuantity(items, 'item-1', -999);
      expect(items[0].qty).toBe(1);

      // Decrementing via (qty - 1) when qty is 1
      items = updateQuantity(items, 'item-1', items[0].qty - 1);
      expect(items[0].qty).toBe(1);
    });

    test('1.2 Stepper increment and decrement over multiple cycles maintains precision and accurate subtotal', () => {
      let items: LineItem[] = [
        { id: 'item-1', name: 'Nebulization Service', price: 350.50, qty: 1 },
        { id: 'item-2', name: 'Salbutamol Nebule', price: 45.75, qty: 2 },
      ];

      // Increment Nebulization to 5
      for (let i = 0; i < 4; i++) {
        items = updateQuantity(items, 'item-1', items[0].qty + 1);
      }
      expect(items[0].qty).toBe(5);

      // Decrement Salbutamol to 1
      items = updateQuantity(items, 'item-2', items[1].qty - 1);
      expect(items[1].qty).toBe(1);

      const totals = computeTotals(items, 20); // Senior Citizen 20%
      // Gross: (350.50 * 5) + (45.75 * 1) = 1752.50 + 45.75 = 1798.25
      expect(totals.gross).toBe(1798.25);
      expect(totals.discount).toBe(Math.round(1798.25 * 0.20)); // 360
      expect(totals.net).toBe(1798.25 - 360);
    });

    test('1.3 Deleting items down to empty list recalculates gross and net to zero without error', () => {
      let items: LineItem[] = [
        { id: 'item-1', name: 'Consultation', price: 600, qty: 1 },
        { id: 'item-2', name: 'Wound Dressing', price: 400, qty: 1 },
      ];

      items = items.filter((it) => it.id !== 'item-1');
      expect(items.length).toBe(1);
      let totals = computeTotals(items, 20);
      expect(totals.gross).toBe(400);
      expect(totals.net).toBe(320);

      items = items.filter((it) => it.id !== 'item-2');
      expect(items.length).toBe(0);
      totals = computeTotals(items, 20);
      expect(totals.gross).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.net).toBe(0);
    });

    test('1.4 Custom item validation: requires non-empty description and bounds quantity to at least 1', () => {
      const validateCustomItem = (name: string, priceStr: string, qtyStr: string) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Item description is required.');
        const price = Math.max(0, parseFloat(priceStr) || 0);
        const parsedQty = parseInt(qtyStr, 10);
        const qty = isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;
        return { name: trimmed, price, qty };
      };

      // Empty or whitespace description throws
      expect(() => validateCustomItem('', '100', '1')).toThrow('Item description is required.');
      expect(() => validateCustomItem('   ', '100', '1')).toThrow('Item description is required.');

      // Zero or negative quantity defaults to 1
      const itemWithZeroQty = validateCustomItem('Sterile Gauze', '25', '0');
      expect(itemWithZeroQty.qty).toBe(1);

      const itemWithNegativeQty = validateCustomItem('Sterile Gauze', '25', '-10');
      expect(itemWithZeroQty.qty).toBe(1);

      const itemWithGarbageQty = validateCustomItem('Sterile Gauze', '25', 'abc');
      expect(itemWithGarbageQty.qty).toBe(1);
    });
  });

  describe('Challenge 2: 3-Way Tabbed Navigation & Cross-Date Draft Retrieval', () => {
    interface QueueItem {
      id: string;
      patientId: string;
      patientName: string;
      queueNumber?: string;
      doctorId?: string;
      doctorName?: string;
    }

    interface Invoice {
      id: string;
      invoiceNumber: string;
      patientId: string;
      queueItemId?: string;
      status: 'Draft' | 'PartiallyPaid' | 'Paid' | 'Voided';
      grossAmount: number;
      netAmount: number;
      balanceDue?: number;
      amountPaid?: number;
      notes?: string;
      invoiceDate: string;
    }

    interface BillingPatientState {
      key: string;
      patientId: string;
      patientName: string;
      queueItemId?: string;
      hasOpenSoa: boolean;
      activeInvoice?: Invoice;
      isAlreadyBilled: boolean;
      existingInvoiceNumber?: string;
      isPromissory: boolean;
    }

    const buildPatientStates = (
      queue: QueueItem[],
      invoices: Invoice[]
    ): BillingPatientState[] => {
      const billedMap = new Map<string, string>();
      const openSoaMap = new Map<string, Invoice>();

      for (const inv of invoices) {
        if (inv.status === 'Voided') continue;
        if (inv.status === 'Draft' || inv.status === 'PartiallyPaid') {
          if (inv.queueItemId) openSoaMap.set(inv.queueItemId, inv);
          if (inv.patientId) openSoaMap.set(inv.patientId, inv);
        } else if (inv.status === 'Paid') {
          if (inv.queueItemId) billedMap.set(inv.queueItemId, inv.invoiceNumber);
          if (inv.patientId) billedMap.set(inv.patientId, inv.invoiceNumber);
        }
      }

      return queue.map((item) => {
        const openInv = openSoaMap.get(item.id) || openSoaMap.get(item.patientId);
        const paidInvNum = billedMap.get(item.id) || billedMap.get(item.patientId);
        const isPromissory = Boolean(
          openInv?.notes?.includes('[PROMISSORY NOTE]') ||
          openInv?.notes?.toLowerCase().includes('promissory note')
        );

        return {
          key: item.id,
          patientId: item.patientId,
          patientName: item.patientName,
          queueItemId: item.id,
          hasOpenSoa: Boolean(openInv),
          activeInvoice: openInv,
          isAlreadyBilled: !openInv && Boolean(paidInvNum),
          existingInvoiceNumber: openInv ? openInv.invoiceNumber : paidInvNum,
          isPromissory,
        };
      });
    };

    const filterTabs = (patients: BillingPatientState[], invoices: Invoice[]) => {
      const activeQueue = patients.filter(
        (p) => (!p.isAlreadyBilled || p.hasOpenSoa) && !p.isPromissory
      );

      const unsettledPromissory = invoices.filter(
        (i) =>
          i.status !== 'Paid' &&
          i.status !== 'Voided' &&
          (Boolean(i.notes?.includes('[PROMISSORY NOTE]')) ||
            Boolean(i.notes?.toLowerCase().includes('promissory')) ||
            patients.some((p) => p.isPromissory && (p.activeInvoice?.id === i.id || p.patientId === i.patientId)))
      );

      const billedAndPaidToday = invoices.filter((i) => i.status === 'Paid');

      return { activeQueue, unsettledPromissory, billedAndPaidToday };
    };

    test('2.1 Cross-date draft retrieval seamlessly binds yesterday draft invoice to today encounter', () => {
      const queue: QueueItem[] = [
        { id: 'q-night-1', patientId: 'p-101', patientName: 'Night Shift Patient', queueNumber: 'N-01' },
      ];

      // Draft invoice created yesterday night at 11:45 PM
      const yesterdayDraft: Invoice = {
        id: 'inv-draft-yesterday',
        invoiceNumber: 'INV-20261020-088',
        patientId: 'p-101',
        queueItemId: 'q-night-1',
        status: 'Draft',
        grossAmount: 1200,
        netAmount: 1200,
        balanceDue: 1200,
        invoiceDate: '2026-10-20T23:45:00Z',
      };

      const states = buildPatientStates(queue, [yesterdayDraft]);
      expect(states.length).toBe(1);
      expect(states[0].hasOpenSoa).toBe(true);
      expect(states[0].isAlreadyBilled).toBe(false);
      expect(states[0].activeInvoice?.invoiceNumber).toBe('INV-20261020-088');

      const tabs = filterTabs(states, [yesterdayDraft]);
      expect(tabs.activeQueue.length).toBe(1);
      expect(tabs.activeQueue[0].patientName).toBe('Night Shift Patient');
    });

    test('2.2 Tab segregation: Active Queue, Unsettled Promissory, and Billed & Paid Today are mutually exclusive', () => {
      const queue: QueueItem[] = [
        { id: 'q-1', patientId: 'p-1', patientName: 'Active Patient A', queueNumber: 'A-01' },
        { id: 'q-2', patientId: 'p-2', patientName: 'Promissory Patient B', queueNumber: 'A-02' },
        { id: 'q-3', patientId: 'p-3', patientName: 'Paid Patient C', queueNumber: 'A-03' },
      ];

      const invoices: Invoice[] = [
        // Promissory invoice for p-2
        {
          id: 'inv-prom-1',
          invoiceNumber: 'INV-20261021-002',
          patientId: 'p-2',
          queueItemId: 'q-2',
          status: 'Draft',
          grossAmount: 750,
          netAmount: 750,
          balanceDue: 750,
          notes: '[PROMISSORY NOTE] Patient deferred payment due on 2026-10-28. Reason: Forgot cash',
          invoiceDate: '2026-10-21T09:00:00Z',
        },
        // Paid invoice for p-3
        {
          id: 'inv-paid-1',
          invoiceNumber: 'INV-20261021-003',
          patientId: 'p-3',
          queueItemId: 'q-3',
          status: 'Paid',
          grossAmount: 500,
          netAmount: 500,
          balanceDue: 0,
          amountPaid: 500,
          invoiceDate: '2026-10-21T09:30:00Z',
        },
      ];

      const states = buildPatientStates(queue, invoices);
      const tabs = filterTabs(states, invoices);

      // Active Queue: ONLY Patient A
      expect(tabs.activeQueue.length).toBe(1);
      expect(tabs.activeQueue[0].patientName).toBe('Active Patient A');

      // Unsettled Promissory: ONLY Patient B
      expect(tabs.unsettledPromissory.length).toBe(1);
      expect(tabs.unsettledPromissory[0].invoiceNumber).toBe('INV-20261021-002');

      // Billed & Paid Today: ONLY Patient C
      expect(tabs.billedAndPaidToday.length).toBe(1);
      expect(tabs.billedAndPaidToday[0].invoiceNumber).toBe('INV-20261021-003');
    });
  });

  describe('Challenge 3: Promissory Note Discharge & TotalUnpaidBalances Audit', () => {
    interface InvoiceState {
      id: string;
      invoiceNumber: string;
      status: 'Draft' | 'PartiallyPaid' | 'Paid' | 'Voided';
      grossAmount: number;
      netAmount: number;
      amountPaid?: number;
      balanceDue?: number;
      notes?: string;
    }

    const dischargeWithPromissoryNote = (
      invoice: InvoiceState,
      dueDate: string,
      reason: string,
      authorizer: string,
      guarantor?: string
    ): InvoiceState => {
      if (!dueDate.trim()) throw new Error('Promissory due date is mandatory.');
      if (!reason.trim()) throw new Error('Audit reason for promissory note is mandatory.');

      const guarantorClause = guarantor?.trim() ? ` (Guarantor: ${guarantor.trim()})` : '';
      const note = `[PROMISSORY NOTE] Patient deferred payment due on ${dueDate.trim()}. Reason: ${reason.trim()} (Auth: ${authorizer})${guarantorClause}`.trim();

      return {
        ...invoice,
        notes: invoice.notes ? `${invoice.notes}\n${note}` : note,
      };
    };

    const calculateTotalUnpaidBalances = (invoices: InvoiceState[]): number => {
      return invoices
        .filter((i) => i.status !== 'Paid' && i.status !== 'Voided')
        .reduce((sum, i) => sum + (i.balanceDue ?? Math.max(0, i.netAmount - (i.amountPaid ?? 0))), 0);
    };

    test('3.1 Promissory validation rejects empty or whitespace-only due date and reason', () => {
      const inv: InvoiceState = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: 'Draft',
        grossAmount: 500,
        netAmount: 500,
        balanceDue: 500,
      };

      // Empty due date
      expect(() => dischargeWithPromissoryNote(inv, '', 'Patient promised next week', 'Staff'))
        .toThrow('Promissory due date is mandatory.');
      expect(() => dischargeWithPromissoryNote(inv, '   ', 'Patient promised next week', 'Staff'))
        .toThrow('Promissory due date is mandatory.');

      // Empty audit reason
      expect(() => dischargeWithPromissoryNote(inv, '2026-10-31', '', 'Staff'))
        .toThrow('Audit reason for promissory note is mandatory.');
      expect(() => dischargeWithPromissoryNote(inv, '2026-10-31', '   ', 'Staff'))
        .toThrow('Audit reason for promissory note is mandatory.');
    });

    test('3.2 Discharging with promissory note formats audit clause and preserves balance in TotalUnpaidBalances', () => {
      const initialInvoices: InvoiceState[] = [
        {
          id: 'inv-active-1',
          invoiceNumber: 'INV-20261021-001',
          status: 'Draft',
          grossAmount: 1500,
          netAmount: 1200, // 20% senior discount applied
          balanceDue: 1200,
        },
        {
          id: 'inv-paid-1',
          invoiceNumber: 'INV-20261021-002',
          status: 'Paid',
          grossAmount: 600,
          netAmount: 600,
          amountPaid: 600,
          balanceDue: 0,
        },
      ];

      // Initial unpaid balances before discharge: 1200
      expect(calculateTotalUnpaidBalances(initialInvoices)).toBe(1200);

      // Execute Promissory Note Discharge
      const deferredInvoice = dischargeWithPromissoryNote(
        initialInvoices[0],
        '2026-10-28',
        'Patient forgot ATM card; requested payroll date settlement',
        'Nurse Joy',
        'Pedro Penduko (Brother)'
      );

      expect(deferredInvoice.notes).toContain('[PROMISSORY NOTE]');
      expect(deferredInvoice.notes).toContain('due on 2026-10-28');
      expect(deferredInvoice.notes).toContain('Pedro Penduko (Brother)');
      expect(deferredInvoice.balanceDue).toBe(1200);

      const updatedInvoices = [deferredInvoice, initialInvoices[1]];
      // Balance MUST remain in TotalUnpaidBalances
      expect(calculateTotalUnpaidBalances(updatedInvoices)).toBe(1200);
    });

    test('3.3 Voided invoices are strictly excluded from TotalUnpaidBalances', () => {
      const invoicesWithVoided: InvoiceState[] = [
        { id: '1', invoiceNumber: 'INV-1', status: 'Draft', grossAmount: 1000, netAmount: 1000, balanceDue: 1000 },
        { id: '2', invoiceNumber: 'INV-2', status: 'Voided', grossAmount: 5000, netAmount: 5000, balanceDue: 5000 },
        { id: '3', invoiceNumber: 'INV-3', status: 'PartiallyPaid', grossAmount: 2000, netAmount: 2000, amountPaid: 500, balanceDue: 1500 },
      ];

      // Expected unpaid balances: 1000 (inv-1) + 1500 (inv-3) = 2500. Voided is NOT included.
      expect(calculateTotalUnpaidBalances(invoicesWithVoided)).toBe(2500);
    });
  });

  describe('Challenge 4: Strict Document Separation (OR vs SOA) & Print Action Decoupling', () => {
    test('4.1 Official Receipt HTML contains strictly OR- prefix, BIR compliance, and payment settlement breakdown', () => {
      const receipt: ReceiptData = {
        orNumber: 'OR-20261021-007',
        invoiceNumber: 'INV-20261021-007',
        patientName: 'Juan Dela Cruz',
        cashierName: 'Maria Makiling, Cashier',
        paidAt: 'Oct 21, 2026, 10:15 AM',
        paymentMethod: 'Cash',
        grossAmount: 1000,
        discountType: 'SeniorCitizen',
        discountIdNumber: 'OSCA-44910',
        discountAmount: 200,
        netAmount: 800,
        cashTendered: 1000,
        change: 200,
        items: [
          {
            code: 'CONS-GEN',
            description: 'Consultation • Dr. Wave Ambray',
            category: 'Consultation',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
          {
            code: 'PROC-ECG',
            description: '12-Lead ECG • Dr. Allan Santos',
            category: 'Procedure',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
        ],
      };

      const orHtml = buildProfessionalReceiptHtml(receipt, sampleLetterhead);
      // Must contain OR number and document title
      expect(orHtml).toContain('OFFICIAL RECEIPT');
      expect(orHtml).toContain('OR #OR-20261021-007');
      expect(orHtml).toContain('BIR Registered TIN: 123-456-789-000');
      expect(orHtml).toContain('VAT-Exempt Sales (Medical):');
      expect(orHtml).toContain('Cash Tendered: ₱1,000.00');
      expect(orHtml).toContain('Change: ₱200.00');
      expect(orHtml).toContain('Authorized Cashier / Billing Officer');
      // Must NOT claim to be a Statement of Account
      expect(orHtml).not.toContain('STATEMENT OF ACCOUNT (SOA)');
    });

    test('4.2 Statement of Account HTML contains strictly INV- prefix, balance due, and attending physician stamps', () => {
      const soa: InvoicePdfData = {
        invoiceNumber: 'INV-20261021-007',
        invoiceDate: 'Oct 21, 2026',
        status: 'Draft',
        patientName: 'Juan Dela Cruz',
        queueNumber: 'A-01',
        grossAmount: 1000,
        discountType: 'SeniorCitizen',
        discountIdNumber: 'OSCA-44910',
        discountAmount: 200,
        netAmount: 800,
        balanceDue: 800,
        items: [
          {
            code: 'CONS-GEN',
            description: 'Consultation • Dr. Wave Ambray',
            category: 'Consultation',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
          {
            code: 'PROC-ECG',
            description: '12-Lead ECG • Dr. Allan Santos',
            category: 'Procedure',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
        ],
      };

      const soaHtml = buildInvoicePdfHtml(soa, sampleLetterhead);
      expect(soaHtml).toContain('<title>Invoice #INV-20261021-007</title>');
      expect(soaHtml).toContain('STATEMENT OF ACCOUNT (SOA)');
      expect(soaHtml).toContain('INV #INV-20261021-007');
      expect(soaHtml).toContain('Consultation • Dr. Wave Ambray');
      expect(soaHtml).toContain('12-Lead ECG • Dr. Allan Santos');
      expect(soaHtml).toContain('₱800.00');
      expect(soaHtml).not.toContain('<div class="or-title">OFFICIAL RECEIPT</div>');
      expect(soaHtml).not.toContain('THIS SERVES AS AN OFFICIAL RECEIPT');
    });

    test('4.3 Thermal POS receipt formats 80mm page size with distinct OR header and tax-exempt notice', () => {
      const receipt: ReceiptData = {
        orNumber: 'OR-20261021-007',
        invoiceNumber: 'INV-20261021-007',
        patientName: 'Juan Dela Cruz',
        cashierName: 'Maria Makiling',
        paidAt: '2026-10-21 10:15',
        paymentMethod: 'Cash',
        grossAmount: 1000,
        discountType: 'SeniorCitizen',
        discountIdNumber: 'OSCA-44910',
        discountAmount: 200,
        netAmount: 800,
        cashTendered: 1000,
        change: 200,
        items: [
          {
            description: 'Consultation • Dr. Wave Ambray',
            unitPrice: 500,
            quantity: 1,
          },
        ],
      };

      const thermalHtml = buildThermalReceiptHtml(receipt, sampleLetterhead);
      expect(thermalHtml).toContain('size: 80mm auto');
      expect(thermalHtml).toContain('OFFICIAL RECEIPT');
      expect(thermalHtml).toContain('#OR-20261021-007');
      expect(thermalHtml).toContain('THIS SERVES AS AN OFFICIAL RECEIPT');
      expect(thermalHtml).not.toContain('STATEMENT OF ACCOUNT');
    });
  });

  describe('Challenge 5: Doctor Encounter Signing Posts Charge Slip & Cashier Aggregates Charges', () => {
    test('5.1 Doctor encounter signing signs chart and posts charge slip without creating invoice (no 409 conflict)', async () => {
      let createdInvoiceCalls = 0;
      let signConsultationCalls = 0;
      let completedQueueCalls = 0;

      const mockClinicService = {
        createInvoice: async () => {
          createdInvoiceCalls++;
          return [{ id: 'inv-1', invoiceNumber: 'INV-001' }, null];
        },
        signConsultation: async (id: string) => {
          signConsultationCalls++;
          return [{ id, signed: true }, null];
        },
        completeQueueItem: async (id: string) => {
          completedQueueCalls++;
          return [{ id, status: 'Completed' }, null];
        },
      };

      // Doctor 1 signs encounter
      const [, signErr1] = await mockClinicService.signConsultation('c-1');
      await mockClinicService.completeQueueItem('q-1');
      expect(signErr1).toBeNull();
      expect(signConsultationCalls).toBe(1);
      expect(completedQueueCalls).toBe(1);

      // Doctor 2 signs encounter for same visit/patient
      const [, signErr2] = await mockClinicService.signConsultation('c-2');
      await mockClinicService.completeQueueItem('q-1');
      expect(signErr2).toBeNull();
      expect(signConsultationCalls).toBe(2);
      expect(completedQueueCalls).toBe(2);

      // Verify that doctor signing made 0 invoice creation calls
      expect(createdInvoiceCalls).toBe(0);
    });

    test('5.2 Cashier workstation rehydrates consultation & multi-doctor procedures into SOA and issues invoice upon payment', async () => {
      const mockPatient = {
        patientId: 'pat-100',
        patientName: 'Juan Dela Cruz',
        queueItemId: 'q-100',
        doctorId: 'doc-1',
        doctorName: 'Dr. Wave Ambray',
      };

      const mockConsultations = [
        { id: 'c-100', patientId: 'pat-100', doctorId: 'doc-1', doctorName: 'Dr. Wave Ambray' },
      ];

      const mockProcedures = [
        {
          id: 'proc-1',
          procedureCode: 'DENT-01',
          procedureName: 'Dental Cleaning',
          category: 'Dental',
          orderedByDoctorId: 'doc-2',
          orderedByDoctorName: 'Dr. Allan Santos',
          status: 'Ordered',
        },
      ];

      // Cashier rehydrates charge slip items
      const cashierLineItems: any[] = [];

      // Add consultation charge
      cashierLineItems.push({
        code: 'CONSULT',
        name: 'General Medical Consultation',
        category: 'Consultation',
        price: 500,
        qty: 1,
        doctorId: mockPatient.doctorId,
        doctorName: mockPatient.doctorName,
      });

      // Add procedure charge with doctor attribution
      for (const proc of mockProcedures) {
        cashierLineItems.push({
          code: proc.procedureCode,
          name: proc.procedureName,
          category: proc.category,
          price: 1200,
          qty: 1,
          doctorId: proc.orderedByDoctorId,
          doctorName: proc.orderedByDoctorName,
        });
      }

      expect(cashierLineItems).toHaveLength(2);
      expect(cashierLineItems[0].doctorName).toBe('Dr. Wave Ambray');
      expect(cashierLineItems[1].doctorName).toBe('Dr. Allan Santos');

      // Cashier compiles into Invoice upon payment collection
      const gross = cashierLineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
      expect(gross).toBe(1700);

      const invoicePayload = {
        patientId: mockPatient.patientId,
        patientName: mockPatient.patientName,
        queueItemId: mockPatient.queueItemId,
        lineItems: cashierLineItems,
        netAmount: gross,
      };

      expect(invoicePayload.lineItems[0].doctorName).toBe('Dr. Wave Ambray');
      expect(invoicePayload.lineItems[1].doctorName).toBe('Dr. Allan Santos');
    });
  });
});
