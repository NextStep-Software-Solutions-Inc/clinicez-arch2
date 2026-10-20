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

  describe('Suite 2: Consultations Screen Post-Encounter Dialog', () => {
    const consultationsPath = path.resolve(
      __dirname,
      '../navigation/screens/Consultations.screen.tsx'
    );
    const consultationsSource = fs.readFileSync(consultationsPath, 'utf8');

    test('2.1 Post-Encounter Modal state is defined in Consultations.screen.tsx', () => {
      expect(consultationsSource).toContain('postEncounterModalVisible');
      expect(consultationsSource).toContain('setPostEncounterModalVisible');
      expect(consultationsSource).toContain('createdInvoiceNumber');
      expect(consultationsSource).toContain('createdInvoiceTotal');
    });

    test('2.2 handleSignAndSync triggers postEncounterModalVisible on success', () => {
      expect(consultationsSource).toContain('setPostEncounterModalVisible(true);');
      expect(consultationsSource).toContain('setCreatedInvoiceNumber(invoiceResult.invoiceNumber);');
      expect(consultationsSource).toContain('setCreatedInvoiceTotal(invoiceResult.netAmount);');
    });

    test('2.3 Post-Encounter Action Dialog contains "Call Next Patient" as prominent primary action', () => {
      expect(consultationsSource).toContain('title="Encounter Completed"');
      expect(consultationsSource).toContain('NEXT PATIENT IN QUEUE');
      expect(consultationsSource).toContain('Call Next Patient');
      expect(consultationsSource).toContain('handleOpenCallModal(nextEligiblePatient)');
    });

    test('2.4 Post-Encounter Action Dialog provides "Go to Billing Screen" and "Print Rx Slip" options', () => {
      expect(consultationsSource).toContain('title="Go to Billing Screen"');
      expect(consultationsSource).toContain('navigation.navigate(\'Billing\'');
      expect(consultationsSource).toContain('title="Print Rx Slip"');
    });
  });

  describe('Suite 3: Billing Screen Statement of Account (SOA) Review and Cashiering', () => {
    const billingPath = path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx');
    const billingSource = fs.readFileSync(billingPath, 'utf8');

    test('3.1 Billing screen has activeInvoice state and SOA Review banner', () => {
      expect(billingSource).toContain('activeInvoice');
      expect(billingSource).toContain('setActiveInvoice');
      expect(billingSource).toContain('Statement of Account: #{activeInvoice.invoiceNumber}');
      expect(billingSource).toContain('soaHeaderBanner');
    });

    test('3.2 Open draft invoices map to hasOpenSoa and (SOA Ready) tag instead of blocking duplicate error', () => {
      expect(billingSource).toContain('hasOpenSoa');
      expect(billingSource).toContain('(SOA Ready)');
      expect(billingSource).toContain('inv.status === \'Draft\' || inv.status === \'PartiallyPaid\'');
    });

    test('3.3 Settling an active draft invoice uses updateInvoice then recordPayment', () => {
      expect(billingSource).toContain('clinicService.updateInvoice(activeInvoice.id');
      expect(billingSource).toContain('clinicService.recordPayment(invoiceToPayId');
    });

    test('3.4 Cashier Counter notice appears when invoice has been dispatched to central counter', () => {
      expect(billingSource).toContain('activeInvoice?.billingRequestedAt');
      expect(billingSource).toContain('Dispatched to Central Cashier Station');
      expect(billingSource).toContain('cashierCounterBanner');
    });

    test('3.5 Duplicate warning is strictly suppressed when active draft invoice is present', () => {
      expect(billingSource).toContain('selectedPatient?.isAlreadyBilled && !activeInvoice');
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
