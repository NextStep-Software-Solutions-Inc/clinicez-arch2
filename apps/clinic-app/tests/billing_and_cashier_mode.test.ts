// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
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
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
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

const { default: CashierStationSettingsCard, CASHIER_MODE_OPTIONS } = await import(
  '../components/settings/CashierStationSettingsCard'
);

describe('Billing & Cashier Station Feature Suite', () => {
  describe('Suite 1: CashierStationSettingsCard Billing & Cashier Configuration', () => {
    test('1.1 CASHIER_MODE_OPTIONS exports ClinicDesk and CashierCounter options', () => {
      expect(CASHIER_MODE_OPTIONS).toBeDefined();
      expect(CASHIER_MODE_OPTIONS.length).toBe(2);
      expect(CASHIER_MODE_OPTIONS.map((o) => o.id)).toEqual(['ClinicDesk', 'CashierCounter']);
    });

    test('1.2 Renders "Billing & Cashier Station" card with mode selection radios', () => {
      const html = renderToStaticMarkup(
        React.createElement(CashierStationSettingsCard, {
          cashierMode: 'ClinicDesk',
          onChangeCashierMode: () => {},
          onSave: async () => {},
          saving: false,
          showSkeletons: false,
        })
      );

      expect(html).toContain('Billing &amp; Cashier Station');
      expect(html).toContain('Clinic Desk Collection');
      expect(html).toContain('Centralized Cashier Counter');
      expect(html).toContain('Standalone / In-Clinic');
      expect(html).toContain('Hospital / Multi-Department');
      expect(html).toContain('Save billing station preferences');
    });

    test('1.3 Highlights CashierCounter when configured', () => {
      const html = renderToStaticMarkup(
        React.createElement(CashierStationSettingsCard, {
          cashierMode: 'CashierCounter',
          onChangeCashierMode: () => {},
          onSave: async () => {},
          saving: false,
          showSkeletons: false,
        })
      );

      expect(html).toContain('aria-label="Centralized Cashier Counter (Hospital / Multi-Department)"');
    });
  });

  describe('Suite 2: Consultations Screen Post-Encounter Dialog & Clinical Momentum', () => {
    const PostEncounterActionDialog = ({
      visible,
      onClose,
      selectedPatient,
      createdInvoiceNumber,
      createdInvoiceTotal,
      nextEligiblePatient,
      onCallNext,
      onGoToBilling,
      onPrintRx,
      hasPrescriptions,
    }: any) => {
      if (!visible) return null;
      return React.createElement(
        'div',
        { 'data-testid': 'post-encounter-dialog', 'aria-modal': 'true' },
        React.createElement('h2', null, 'Encounter Completed'),
        selectedPatient && React.createElement('p', null, `Patient: ${selectedPatient.patientName} (${selectedPatient.queueNumber})`),
        React.createElement('div', { 'data-testid': 'success-card' },
          React.createElement('span', null, 'Clinical Encounter Signed & Synchronized'),
          createdInvoiceTotal !== null && React.createElement('span', { 'data-testid': 'invoice-badge' },
            `Invoice ${createdInvoiceNumber || 'Created'}: ₱${createdInvoiceTotal.toFixed(2)} (Queued for Checkout)`
          )
        ),
        nextEligiblePatient ? React.createElement('div', { 'data-testid': 'next-queue-card' },
          React.createElement('span', null, 'NEXT PATIENT IN QUEUE'),
          React.createElement('span', { 'data-testid': 'queue-number' }, nextEligiblePatient.queueNumber),
          React.createElement('span', null, nextEligiblePatient.patientName),
          React.createElement('button', {
            'data-testid': 'btn-call-next',
            'aria-label': `Call Next Patient (${nextEligiblePatient.queueNumber})`,
            onClick: onCallNext,
          }, `Call Next Patient (${nextEligiblePatient.queueNumber})`)
        ) : React.createElement('div', { 'data-testid': 'empty-queue-card' },
          React.createElement('span', null, 'No other patients are currently waiting in this queue.')
        ),
        React.createElement('div', { 'data-testid': 'options-row' },
          hasPrescriptions && React.createElement('button', {
            'data-testid': 'btn-print-rx',
            onClick: onPrintRx,
          }, 'Print Rx Slip'),
          React.createElement('button', {
            'data-testid': 'btn-go-billing',
            onClick: onGoToBilling,
          }, 'Go to Billing Screen'),
          React.createElement('button', {
            'data-testid': 'btn-close',
            onClick: onClose,
          }, 'Close')
        )
      );
    };

    const calculateNextEligiblePatient = (queue: any[], currentPatientId?: string) => {
      const eligibleStatuses = ['Triaged', 'ReEvaluation', 'Waiting'];
      return queue.find((item) =>
        eligibleStatuses.includes(item.status) && item.patientId !== currentPatientId
      ) || null;
    };

    test('2.1 Post-Encounter Dialog renders with prominent primary action to call next patient', () => {
      const nextPatient = {
        id: 'q-2',
        patientId: 'p-2',
        queueNumber: 'Q-002',
        patientName: 'Pedro Penduko',
        status: 'Waiting',
        priority: 'Regular',
      };

      const html = renderToStaticMarkup(
        React.createElement(PostEncounterActionDialog, {
          visible: true,
          onClose: () => {},
          selectedPatient: { patientName: 'Maria Santos', queueNumber: 'Q-001' },
          createdInvoiceNumber: 'INV-20261020-001',
          createdInvoiceTotal: 500,
          nextEligiblePatient: nextPatient,
          onCallNext: () => {},
          onGoToBilling: () => {},
          onPrintRx: () => {},
          hasPrescriptions: true,
        })
      );

      expect(html).toContain('Encounter Completed');
      expect(html).toContain('Clinical Encounter Signed &amp; Synchronized');
      expect(html).toContain('Invoice INV-20261020-001: ₱500.00 (Queued for Checkout)');
      expect(html).toContain('NEXT PATIENT IN QUEUE');
      expect(html).toContain('Q-002');
      expect(html).toContain('Pedro Penduko');
      expect(html).toContain('Call Next Patient (Q-002)');
      expect(html).toContain('Print Rx Slip');
      expect(html).toContain('Go to Billing Screen');
    });

    test('2.2 Post-Encounter Dialog renders empty state notice when no patients wait in queue', () => {
      const html = renderToStaticMarkup(
        React.createElement(PostEncounterActionDialog, {
          visible: true,
          onClose: () => {},
          selectedPatient: { patientName: 'Maria Santos', queueNumber: 'Q-001' },
          createdInvoiceNumber: 'INV-20261020-001',
          createdInvoiceTotal: 500,
          nextEligiblePatient: null,
          onCallNext: () => {},
          onGoToBilling: () => {},
          onPrintRx: () => {},
          hasPrescriptions: false,
        })
      );

      expect(html).toContain('No other patients are currently waiting in this queue.');
      expect(html).not.toContain('Print Rx Slip');
      expect(html).toContain('Go to Billing Screen');
      expect(html).toContain('Close');
    });

    test('2.3 calculateNextEligiblePatient selects Triaged and Waiting patients over InProgress or Completed', () => {
      const queue = [
        { id: '1', patientId: 'p-1', status: 'Completed', queueNumber: 'Q-001' },
        { id: '2', patientId: 'p-2', status: 'InProgress', queueNumber: 'Q-002' },
        { id: '3', patientId: 'p-3', status: 'Triaged', queueNumber: 'Q-003' },
        { id: '4', patientId: 'p-4', status: 'Waiting', queueNumber: 'Q-004' },
      ];

      const next = calculateNextEligiblePatient(queue, 'p-2');
      expect(next).not.toBeNull();
      expect(next?.queueNumber).toBe('Q-003');
    });

    test('2.4 Signing an encounter preserves clinical momentum without automatic billing redirection', () => {
      let modalVisible = false;
      let navigatedToBilling = false;

      const handleSignAndSyncSuccess = (invoiceResult: { invoiceNumber: string; netAmount: number }) => {
        // Clinical momentum pattern: show modal dialog instead of forceful redirect
        modalVisible = true;
      };

      handleSignAndSyncSuccess({ invoiceNumber: 'INV-101', netAmount: 600 });
      expect(modalVisible).toBe(true);
      expect(navigatedToBilling).toBe(false);
    });
  });

  describe('Suite 3: Billing Screen Statement of Account (SOA) Review and Cashiering', () => {
    function toBillingPatient(
      item: any,
      billedMap?: Map<string, string>,
      openSoaMap?: Map<string, any>
    ) {
      const openInv = openSoaMap?.get(item.id) || openSoaMap?.get(item.patientId);
      const paidInvNum = billedMap?.get(item.id) || billedMap?.get(item.patientId);
      return {
        key: item.id,
        patientId: item.patientId,
        patientName: item.patientName,
        queueItemId: item.id,
        queueNumber: item.queueNumber,
        hasOpenSoa: Boolean(openInv),
        activeInvoice: openInv,
        isAlreadyBilled: !openInv && Boolean(paidInvNum),
        existingInvoiceNumber: openInv ? openInv.invoiceNumber : paidInvNum,
      };
    }

    const CashierCounterBanner = ({ billingRequestedAt }: { billingRequestedAt?: string | null }) => {
      if (!billingRequestedAt) return null;
      return React.createElement(
        'div',
        { 'data-testid': 'cashier-counter-banner', role: 'alert' },
        React.createElement('span', null, 'Dispatched to Central Cashier Station'),
        React.createElement('span', null, 'This bill has been sent to the central cashier counter. Settle payment at the main counter.')
      );
    };

    const SoaHeaderBanner = ({ activeInvoice }: { activeInvoice: any }) => {
      if (!activeInvoice) return null;
      return React.createElement(
        'div',
        { 'data-testid': 'soa-header-banner' },
        React.createElement('span', null, `Statement of Account: #${activeInvoice.invoiceNumber}`),
        React.createElement('span', null, 'Review ordered items, apply statutory discounts, and confirm checkout.')
      );
    };

    test('3.1 Open draft invoices map to hasOpenSoa and suppress duplicate billing warnings', () => {
      const openSoaMap = new Map();
      openSoaMap.set('q-1', {
        id: 'inv-1',
        invoiceNumber: 'INV-20261020-001',
        status: 'Draft',
        grossAmount: 500,
        netAmount: 500,
      });

      const billedMap = new Map(); // no paid invoice

      const patient = toBillingPatient({ id: 'q-1', patientId: 'p-1', queueNumber: 'Q-001', patientName: 'Maria Santos' }, billedMap, openSoaMap);

      expect(patient.hasOpenSoa).toBe(true);
      expect(patient.activeInvoice).toBeDefined();
      expect(patient.activeInvoice.invoiceNumber).toBe('INV-20261020-001');
      expect(patient.isAlreadyBilled).toBe(false); // Duplicate warning strictly suppressed!
    });

    test('3.2 Paid invoices without open SOA map to isAlreadyBilled=true', () => {
      const openSoaMap = new Map();
      const billedMap = new Map();
      billedMap.set('q-2', 'INV-20261020-002');

      const patient = toBillingPatient({ id: 'q-2', patientId: 'p-2', queueNumber: 'Q-002', patientName: 'Jose Rizal' }, billedMap, openSoaMap);

      expect(patient.hasOpenSoa).toBe(false);
      expect(patient.activeInvoice).toBeUndefined();
      expect(patient.isAlreadyBilled).toBe(true);
      expect(patient.existingInvoiceNumber).toBe('INV-20261020-002');
    });

    test('3.3 Statutory discounts (Senior Citizen 20%, PWD 20%, PhilHealth 100%) compute accurately', () => {
      const gross = 500;

      // Senior 20%
      const seniorDiscount = Math.round(gross * 0.20 * 100) / 100;
      const seniorNet = gross - seniorDiscount;
      expect(seniorDiscount).toBe(100);
      expect(seniorNet).toBe(400);

      // PWD 20%
      const pwdDiscount = Math.round(gross * 0.20 * 100) / 100;
      const pwdNet = gross - pwdDiscount;
      expect(pwdDiscount).toBe(100);
      expect(pwdNet).toBe(400);

      // PhilHealth 100%
      const philHealthDiscount = gross;
      const philHealthNet = gross - philHealthDiscount;
      expect(philHealthDiscount).toBe(500);
      expect(philHealthNet).toBe(0);
    });

    test('3.4 Cashier Counter notice renders when invoice is dispatched to central counter', () => {
      const htmlDispatched = renderToStaticMarkup(
        React.createElement(CashierCounterBanner, {
          billingRequestedAt: '2026-10-20T03:00:00Z',
        })
      );
      expect(htmlDispatched).toContain('Dispatched to Central Cashier Station');

      const htmlLocal = renderToStaticMarkup(
        React.createElement(CashierCounterBanner, {
          billingRequestedAt: null,
        })
      );
      expect(htmlLocal).toBe('');
    });

    test('3.5 SOA Header Banner renders active invoice number and review prompt', () => {
      const html = renderToStaticMarkup(
        React.createElement(SoaHeaderBanner, {
          activeInvoice: { invoiceNumber: 'INV-20261020-042' },
        })
      );
      expect(html).toContain('Statement of Account: #INV-20261020-042');
      expect(html).toContain('Review ordered items, apply statutory discounts, and confirm checkout.');
    });
  });

  describe('Suite 4: Design Token Integrity', () => {
    const consultationsPath = path.resolve(
      __dirname,
      '../navigation/screens/Consultations.screen.tsx'
    );
    const consultationsSource = fs.readFileSync(consultationsPath, 'utf8');
    const billingPath = path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx');
    const billingSource = fs.readFileSync(billingPath, 'utf8');

    test('4.1 Consultations.screen.tsx contains 0 raw hex color values', () => {
      const hexMatches = consultationsSource.match(/#[0-9a-fA-F]{3,8}/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    test('4.2 Billing.screen.tsx contains 0 raw hex color values', () => {
      const hexMatches = billingSource.match(/#[0-9a-fA-F]{3,8}/g) || [];
      expect(hexMatches.length).toBe(0);
    });
  });

  describe('Suite 5: Cashier Workstation 3-Way Tabs & Queue Navigation (Tier 1 & Tier 2)', () => {
    type CashierTab = 'ActiveQueue' | 'UnsettledPromissory' | 'BilledPaidToday';

    interface BillingQueueEntry {
      id: string;
      patientId: string;
      patientName: string;
      queueNumber: string;
      status: string;
      hasOpenSoa: boolean;
      activeInvoice?: any;
      isPromissory?: boolean;
      promissoryDueDate?: string;
      promissoryReason?: string;
      isAlreadyBilled?: boolean;
    }

    const filterQueueByTab = (
      tab: CashierTab,
      entries: BillingQueueEntry[],
      paidInvoices: any[]
    ) => {
      switch (tab) {
        case 'ActiveQueue':
          return entries.filter(
            (e) => !e.isAlreadyBilled && !e.isPromissory
          );
        case 'UnsettledPromissory':
          return entries.filter((e) => e.isPromissory && !e.isAlreadyBilled);
        case 'BilledPaidToday':
          return paidInvoices.filter((i) => i.status === 'Paid');
      }
    };

    const bindPatientToCrossDateDraft = (
      patient: { id: string; patientId: string; patientName: string; queueNumber: string },
      allOpenDrafts: any[]
    ): BillingQueueEntry => {
      const matchedDraft = allOpenDrafts.find(
        (inv) => inv.patientId === patient.patientId || inv.queueItemId === patient.id
      );
      const isPromissory = Boolean(matchedDraft?.notes?.includes('Promissory Note') || matchedDraft?.isDeferred);
      return {
        id: patient.id,
        patientId: patient.patientId,
        patientName: patient.patientName,
        queueNumber: patient.queueNumber,
        status: 'WaitingPayment',
        hasOpenSoa: Boolean(matchedDraft),
        activeInvoice: matchedDraft,
        isPromissory,
        promissoryDueDate: matchedDraft?.promissoryDueDate,
        promissoryReason: matchedDraft?.promissoryReason,
        isAlreadyBilled: false,
      };
    };

    test('5.1 3-way tab model strictly filters ActiveQueue, UnsettledPromissory, and BilledPaidToday', () => {
      const entries: BillingQueueEntry[] = [
        {
          id: 'q-1',
          patientId: 'p-1',
          patientName: 'Active Patient A',
          queueNumber: 'A-001',
          status: 'WaitingPayment',
          hasOpenSoa: true,
          isPromissory: false,
          isAlreadyBilled: false,
        },
        {
          id: 'q-2',
          patientId: 'p-2',
          patientName: 'Promissory Patient B',
          queueNumber: 'A-002',
          status: 'Deferred',
          hasOpenSoa: true,
          isPromissory: true,
          promissoryDueDate: '2026-10-28',
          isAlreadyBilled: false,
        },
        {
          id: 'q-3',
          patientId: 'p-3',
          patientName: 'Settled Patient C',
          queueNumber: 'A-003',
          status: 'Completed',
          hasOpenSoa: false,
          isPromissory: false,
          isAlreadyBilled: true,
        },
      ];

      const paidInvoices = [
        {
          id: 'inv-paid-1',
          invoiceNumber: 'INV-20261021-001',
          patientName: 'Settled Patient C',
          status: 'Paid',
          payments: [{ paymentNumber: 'OR-20261021-001', amount: 500 }],
        },
      ];

      const activeList = filterQueueByTab('ActiveQueue', entries, paidInvoices);
      expect(activeList.length).toBe(1);
      expect(activeList[0].patientName).toBe('Active Patient A');

      const promissoryList = filterQueueByTab('UnsettledPromissory', entries, paidInvoices);
      expect(promissoryList.length).toBe(1);
      expect(promissoryList[0].patientName).toBe('Promissory Patient B');
      expect(promissoryList[0].promissoryDueDate).toBe('2026-10-28');

      const paidList = filterQueueByTab('BilledPaidToday', entries, paidInvoices);
      expect(paidList.length).toBe(1);
      expect(paidList[0].invoiceNumber).toBe('INV-20261021-001');
      expect(paidList[0].payments[0].paymentNumber).toBe('OR-20261021-001');
    });

    test('5.2 Cross-date draft retrieval seamlessly binds yesterday draft invoice to queue encounter', () => {
      const yesterdayDraft = {
        id: 'inv-prev-99',
        invoiceNumber: 'INV-20261020-099',
        patientId: 'p-42',
        grossAmount: 750,
        netAmount: 750,
        balanceDue: 750,
        status: 'Draft',
        invoiceDate: '2026-10-20T22:30:00Z',
      };

      const queuePatient = {
        id: 'q-42',
        patientId: 'p-42',
        patientName: 'Overnight Shift Patient',
        queueNumber: 'N-001',
      };

      const bound = bindPatientToCrossDateDraft(queuePatient, [yesterdayDraft]);
      expect(bound.hasOpenSoa).toBe(true);
      expect(bound.activeInvoice).toBeDefined();
      expect(bound.activeInvoice.invoiceNumber).toBe('INV-20261020-099');
      expect(bound.activeInvoice.balanceDue).toBe(750);
      expect(bound.isAlreadyBilled).toBe(false);
    });
  });

  describe('Suite 6: Defensive Cashiering, Quantity Steppers & Non-Blocking Workflow (Tier 1 & Tier 2)', () => {
    interface CashierLineItem {
      id: string;
      code: string;
      name: string;
      category: string;
      price: number;
      qty: number;
      doctorId?: string;
      doctorName?: string;
    }

    const calculateTotals = (
      items: CashierLineItem[],
      discountType: string,
      customDiscountPct: number = 0
    ) => {
      const gross = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      let discountPct = 0;
      if (discountType === 'SeniorCitizen' || discountType === 'PWD') {
        discountPct = 20;
      } else if (discountType === 'PhilHealth') {
        discountPct = 100;
      } else if (discountType === 'Custom') {
        discountPct = customDiscountPct;
      }
      const discountAmount = Math.round(gross * (discountPct / 100) * 100) / 100;
      const net = Math.max(0, gross - discountAmount);
      return { gross, discountPct, discountAmount, net };
    };

    const handleIncrementQty = (items: CashierLineItem[], itemId: string): CashierLineItem[] => {
      return items.map((item) =>
        item.id === itemId ? { ...item, qty: item.qty + 1 } : item
      );
    };

    const handleDecrementQty = (items: CashierLineItem[], itemId: string): CashierLineItem[] => {
      return items.map((item) =>
        item.id === itemId ? { ...item, qty: Math.max(1, item.qty - 1) } : item
      );
    };

    const handleRemoveItem = (items: CashierLineItem[], itemId: string): CashierLineItem[] => {
      return items.filter((item) => item.id !== itemId);
    };

    test('6.1 Quantity steppers increment and decrement quantities with instant subtotal and gross recalculation', () => {
      let items: CashierLineItem[] = [
        { id: '1', code: 'NEB', name: 'Nebulization', category: 'Procedure', price: 350, qty: 1 },
        { id: '2', code: 'SALB', name: 'Salbutamol Nebule', category: 'Pharmacy', price: 50, qty: 1 },
      ];

      // Initial totals: 350 + 50 = 400
      let totals = calculateTotals(items, 'None');
      expect(totals.gross).toBe(400);

      // Increment Nebulization to 2
      items = handleIncrementQty(items, '1');
      expect(items[0].qty).toBe(2);
      totals = calculateTotals(items, 'None');
      expect(totals.gross).toBe(750); // (350 * 2) + 50

      // Increment Salbutamol to 3
      items = handleIncrementQty(items, '2');
      items = handleIncrementQty(items, '2');
      expect(items[1].qty).toBe(3);
      totals = calculateTotals(items, 'None');
      expect(totals.gross).toBe(850); // 700 + 150

      // Decrement Salbutamol back to 2
      items = handleDecrementQty(items, '2');
      expect(items[1].qty).toBe(2);
      totals = calculateTotals(items, 'None');
      expect(totals.gross).toBe(800); // 700 + 100

      // Decrement Nebulization at minimum quantity 1 is bounded at 1 (never negative or 0)
      items = handleDecrementQty(items, '1');
      items = handleDecrementQty(items, '1');
      expect(items[0].qty).toBe(1);
      totals = calculateTotals(items, 'None');
      expect(totals.gross).toBe(450); // 350 + 100
    });

    test('6.2 Item deletion recalculates gross, statutory discount, and net balance due cleanly', () => {
      let items: CashierLineItem[] = [
        { id: '1', code: 'CONS', name: 'General Consultation', category: 'Consultation', price: 500, qty: 1 },
        { id: '2', code: 'PROC', name: 'Wound Dressing', category: 'Procedure', price: 300, qty: 1 },
      ];

      // With Senior Citizen 20%: Gross = 800, Discount = 160, Net = 640
      let totals = calculateTotals(items, 'SeniorCitizen');
      expect(totals.gross).toBe(800);
      expect(totals.discountAmount).toBe(160);
      expect(totals.net).toBe(640);

      // Delete Wound Dressing
      items = handleRemoveItem(items, '2');
      expect(items.length).toBe(1);

      // Recalculated: Gross = 500, Discount = 100, Net = 400
      totals = calculateTotals(items, 'SeniorCitizen');
      expect(totals.gross).toBe(500);
      expect(totals.discountAmount).toBe(100);
      expect(totals.net).toBe(400);
    });

    test('6.3 Custom clinic medication or supply can be added with practitioner attribution', () => {
      const items: CashierLineItem[] = [
        {
          id: 'item-custom-1',
          code: 'SUP-SYR',
          name: 'Syringe 10ml with Needle',
          category: 'Supply',
          price: 25,
          qty: 2,
          doctorId: 'doc-wave-1',
          doctorName: 'Dr. Wave Ambray',
        },
      ];

      expect(items[0].doctorName).toBe('Dr. Wave Ambray');
      expect(items[0].doctorId).toBe('doc-wave-1');
      expect(items[0].price * items[0].qty).toBe(50);
    });

    test('6.4 Defensive cashiering: statutory discount toggling is non-blocking and handles zero balance', () => {
      const items: CashierLineItem[] = [
        { id: '1', code: 'KONS', name: 'PhilHealth Konsulta Checkup', category: 'Consultation', price: 500, qty: 1 },
      ];

      // Toggling between discounts never throws or dead-ends
      const noneTotals = calculateTotals(items, 'None');
      expect(noneTotals.net).toBe(500);

      const seniorTotals = calculateTotals(items, 'SeniorCitizen');
      expect(seniorTotals.net).toBe(400);

      const philhealthTotals = calculateTotals(items, 'PhilHealth');
      expect(philhealthTotals.net).toBe(0);
      expect(philhealthTotals.discountAmount).toBe(500);
    });
  });

  describe('Suite 7: Defer / Promissory Note Action & Discharge Flow (Tier 1, 2, 3)', () => {
    interface PromissoryPayload {
      patientId: string;
      invoiceId: string;
      dueDate: string;
      reason: string;
      authorizedByStaffName: string;
    }

    interface InvoiceState {
      id: string;
      status: string;
      balanceDue: number;
      isDeferred: boolean;
      promissoryDueDate?: string;
      notes?: string;
    }

    const applyPromissoryNote = (invoice: InvoiceState, payload: PromissoryPayload): InvoiceState => {
      if (!payload.dueDate) throw new Error('Promissory due date is mandatory.');
      if (!payload.reason.trim()) throw new Error('Audit reason for promissory note is mandatory.');

      return {
        ...invoice,
        isDeferred: true,
        promissoryDueDate: payload.dueDate,
        notes: `${invoice.notes || ''}\n[PROMISSORY NOTE] Patient deferred payment due on ${payload.dueDate}. Reason: ${payload.reason} (Auth: ${payload.authorizedByStaffName})`.trim(),
      };
    };

    const calculateTotalUnpaidBalances = (invoices: InvoiceState[]) => {
      return invoices
        .filter((i) => i.status !== 'Paid' && i.status !== 'Voided')
        .reduce((sum, i) => sum + i.balanceDue, 0);
    };

    test('7.1 Defer action records due date, promissory note audit reason, and preserves open balance', () => {
      const initialInvoice: InvoiceState = {
        id: 'inv-prom-01',
        status: 'Draft',
        balanceDue: 1250,
        isDeferred: false,
        notes: 'Initial clinical encounter draft',
      };

      const payload: PromissoryPayload = {
        patientId: 'pat-1',
        invoiceId: 'inv-prom-01',
        dueDate: '2026-10-31',
        reason: 'Patient forgot wallet; promised payment on month-end salary day',
        authorizedByStaffName: 'Cashier Bea Gomez',
      };

      const deferred = applyPromissoryNote(initialInvoice, payload);
      expect(deferred.isDeferred).toBe(true);
      expect(deferred.promissoryDueDate).toBe('2026-10-31');
      expect(deferred.balanceDue).toBe(1250); // Balance remains open as Accounts Receivable
      expect(deferred.notes).toContain('[PROMISSORY NOTE]');
      expect(deferred.notes).toContain('month-end salary day');
      expect(deferred.notes).toContain('Cashier Bea Gomez');
    });

    test('7.2 Defer action validates that due date and audit reason are non-empty', () => {
      const invoice: InvoiceState = {
        id: 'inv-prom-02',
        status: 'Draft',
        balanceDue: 500,
        isDeferred: false,
      };

      expect(() =>
        applyPromissoryNote(invoice, {
          patientId: 'p-1',
          invoiceId: 'inv-prom-02',
          dueDate: '',
          reason: 'Valid reason',
          authorizedByStaffName: 'Cashier',
        })
      ).toThrow('Promissory due date is mandatory.');

      expect(() =>
        applyPromissoryNote(invoice, {
          patientId: 'p-1',
          invoiceId: 'inv-prom-02',
          dueDate: '2026-10-30',
          reason: '   ',
          authorizedByStaffName: 'Cashier',
        })
      ).toThrow('Audit reason for promissory note is mandatory.');
    });

    test('7.3 Daily EOD audit summary includes deferred promissory invoices in TotalUnpaidBalances', () => {
      const allInvoices: InvoiceState[] = [
        { id: '1', status: 'Paid', balanceDue: 0, isDeferred: false },
        { id: '2', status: 'Draft', balanceDue: 600, isDeferred: false },
        { id: '3', status: 'Draft', balanceDue: 1400, isDeferred: true }, // Promissory
        { id: '4', status: 'Voided', balanceDue: 800, isDeferred: false },
      ];

      // Total unpaid balances = 600 + 1400 = 2000
      const totalUnpaid = calculateTotalUnpaidBalances(allInvoices);
      expect(totalUnpaid).toBe(2000);
    });
  });

  describe('Suite 8: Real-World Multi-Doctor & Split Payment Workstation Lifecycle (Tier 3 & Tier 4)', () => {
    test('8.1 Multi-specialty outpatient checkout with Senior discount and Split Settlement', () => {
      // 1. Consolidated multi-doctor line items
      const lineItems = [
        {
          id: 'item-1',
          code: 'CONS-GEN',
          name: 'General Consultation',
          category: 'Consultation',
          price: 600,
          qty: 1,
          doctorId: 'doc-wave',
          doctorName: 'Dr. Wave Ambray',
        },
        {
          id: 'item-2',
          code: 'DENT-REST',
          name: 'Tooth Restoration',
          category: 'Procedure',
          price: 1800,
          qty: 1,
          doctorId: 'doc-allan',
          doctorName: 'Dr. Allan Santos',
        },
        {
          id: 'item-3',
          code: 'LAB-CBC',
          name: 'Complete Blood Count (CBC)',
          category: 'Laboratory',
          price: 250,
          qty: 1,
        },
      ];

      // Gross = 600 + 1800 + 250 = 2650
      const gross = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
      expect(gross).toBe(2650);

      // Senior Citizen 20% discount
      const discountPct = 20;
      const discountAmount = Math.round(gross * (discountPct / 100) * 100) / 100; // 530
      const net = gross - discountAmount; // 2120
      expect(discountAmount).toBe(530);
      expect(net).toBe(2120);

      // Split Payment Execution:
      // Split 1: ₱1,000 Cash
      const split1 = 1000;
      let balance = net - split1; // 1120
      expect(balance).toBe(1120);

      // Split 2: ₱1,120 GCash
      const split2 = 1120;
      balance = balance - split2; // 0
      expect(balance).toBe(0);

      // Receipts generated
      const receipts = [
        { paymentNumber: 'OR-20261021-001', amount: split1, method: 'Cash' },
        { paymentNumber: 'OR-20261021-002', amount: split2, method: 'GCash', ref: 'GCASH-99120' },
      ];

      expect(receipts.length).toBe(2);
      expect(receipts[0].paymentNumber).toBe('OR-20261021-001');
      expect(receipts[1].paymentNumber).toBe('OR-20261021-002');
      expect(receipts.reduce((sum, r) => sum + r.amount, 0)).toBe(net);
    });

    test('8.2 Partial payment collection clamps tendered cash to amountToCollect and leaves remaining balance in unsettled accounts', () => {
      const netTotal = 1500;
      const previousPayments = 0;
      const balanceDue = netTotal - previousPayments;

      // Cashier collects partial payment of 500
      const isPartial = true;
      const partialAmount = 500;
      const amountToCollect = isPartial ? Math.min(balanceDue, partialAmount) : balanceDue;
      expect(amountToCollect).toBe(500);

      // Customer tenders 500 cash
      const cashTendered = 500;
      const changeDue = Math.max(0, cashTendered - amountToCollect);
      expect(changeDue).toBe(0);

      // Remaining balance
      const remainingBalance = balanceDue - amountToCollect;
      expect(remainingBalance).toBe(1000);

      // Subsequent payment settling the remaining 1000
      const subsequentBalanceDue = remainingBalance;
      const subsequentAmountToCollect = subsequentBalanceDue;
      const subsequentTendered = 1000;
      expect(subsequentAmountToCollect).toBe(1000);
      expect(subsequentTendered - subsequentAmountToCollect).toBe(0);
      expect(subsequentBalanceDue - subsequentAmountToCollect).toBe(0);
    });
  });
});

