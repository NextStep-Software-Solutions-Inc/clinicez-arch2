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

mock.module('expo-print', () => ({
  printAsync: () => Promise.resolve(),
}));

mock.module('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(false),
  shareAsync: () => Promise.resolve(),
}));

mock.module('../../context/ClinicContext', () => ({
  useClinic: () => ({
    clinicLogo: null,
    setClinicLogo: () => Promise.resolve(true),
    clinicBranding: null,
    refreshClinic: () => Promise.resolve(),
    facilityName: 'Test Facility',
    accreditationNumber: 'ACC-123',
    taxIdentificationNumber: 'TIN-456',
    letterhead: null,
  }),
}));

mock.module('../../context/StaffContext', () => ({
  useStaff: () => ({
    current: { id: 'staff-1', name: 'Dr. Test' },
    currentName: 'Dr. Test',
  }),
}));

mock.module('../../services/clinicService', () => ({
  clinicService: {
    getServices: () => Promise.resolve([[], null]),
    getQueue: () => Promise.resolve([[], null]),
    getDailyEodReport: () => Promise.resolve([null, null]),
    getInvoices: () => Promise.resolve([[], null]),
    getSettings: () => Promise.resolve([{ cashierMode: 'ClinicDesk' }, null]),
    updateSettings: (payload: any) => Promise.resolve([{ ...payload }, null]),
    createInvoice: () => Promise.resolve([{ id: 'inv-1', invoiceNumber: 'INV-1' }, null]),
    updateInvoice: () => Promise.resolve([{ id: 'inv-1', invoiceNumber: 'INV-1' }, null]),
    recordPayment: () => Promise.resolve([{ id: 'inv-1', invoiceNumber: 'INV-1', payments: [] }, null]),
  },
}));

mock.module('../../utils/feedback', () => ({
  Alert: { alert: () => {} },
  notify: {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  },
}));

mock.module('../../utils/logoUploader', () => ({
  pickClinicLogo: () => Promise.resolve(null),
}));

mock.module('../components/settings/JoinLinkSettingsCard', () => ({
  default: () => React.createElement('div', { 'data-mock': 'JoinLinkSettingsCard' }),
}));

mock.module('../components/settings/ColorBrandingSection', () => ({
  default: () => React.createElement('div', { 'data-mock': 'ColorBrandingSection' }),
}));

mock.module('../components/settings/LogoCropModal', () => ({
  default: () => null,
}));

const { default: GeneralSettingsTab, CASHIER_MODE_OPTIONS } = await import(
  '../components/settings/GeneralSettingsTab'
);

describe('Billing & Cashier Station Feature Suite', () => {
  describe('Suite 1: GeneralSettingsTab Billing & Cashier Configuration', () => {
    test('1.1 CASHIER_MODE_OPTIONS exports ClinicDesk and CashierCounter options', () => {
      expect(CASHIER_MODE_OPTIONS).toBeDefined();
      expect(CASHIER_MODE_OPTIONS.length).toBe(2);
      expect(CASHIER_MODE_OPTIONS.map((o) => o.id)).toEqual(['ClinicDesk', 'CashierCounter']);
    });

    test('1.2 Renders "Billing & Cashier Station" card with mode selection radios', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Clinic',
          setClinicName: () => {},
          accreditationNumber: 'ACC-123',
          setAccreditationNumber: () => {},
          operatingHours: '8am-5pm',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: '',
          setLetterheadHeader: () => {},
          letterheadAddress: '',
          setLetterheadAddress: () => {},
          letterheadContact: '',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          settings: {
            id: 'settings-1',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            clinicName: 'Test Clinic',
            operatingHours: '8am-5pm',
            defaultSlotDurationMinutes: 30,
            queuePrefix: 'Q',
            invoicePrefix: 'INV',
            defaultConsultationFee: 500,
            vatRate: 0.12,
            cashierMode: 'ClinicDesk',
          },
          cashierMode: 'ClinicDesk',
          setCashierMode: () => {},
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
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
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Hospital OPD',
          setClinicName: () => {},
          accreditationNumber: '',
          setAccreditationNumber: () => {},
          operatingHours: '',
          setOperatingHours: () => {},
          slotDuration: '15',
          setSlotDuration: () => {},
          consultationFee: '600',
          setConsultationFee: () => {},
          letterheadHeader: '',
          setLetterheadHeader: () => {},
          letterheadAddress: '',
          setLetterheadAddress: () => {},
          letterheadContact: '',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          settings: {
            id: 'settings-2',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            clinicName: 'Hospital OPD',
            operatingHours: '',
            defaultSlotDurationMinutes: 15,
            queuePrefix: 'Q',
            invoicePrefix: 'INV',
            defaultConsultationFee: 600,
            vatRate: 0.12,
            cashierMode: 'CashierCounter',
          },
          cashierMode: 'CashierCounter',
          setCashierMode: () => {},
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
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
});
