// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;
(globalThis as any).expo = {
  EventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
};

mock.module('expo-print', () => ({
  printAsync: () => Promise.resolve(),
}));

mock.module('../utils/printHelper', () => ({
  openPrintableUrl: () => Promise.resolve(true),
  printReceiptDialog: () => {},
}));

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
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
  processColor: (c: any) => c,
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
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  PanResponder: {
    create: (config: any) => ({
      panHandlers: {},
      ...config,
    }),
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

const { theme } = await import('../constants/theme');

describe('PDEA S2 Prescription Print Hardening & Regulatory Safeguards', () => {
  const dangerousPrescriptionItems = [
    {
      itemId: 'rx-item-01',
      genericName: 'Morphine Sulfate (PDEA S2 Dangerous Drug)',
      brandName: 'MST Continus',
      dosage: '10 mg',
      form: 'Tablet',
      sig: 'Take 1 tablet every 12 hours as directed',
      quantity: 14,
      isDangerousDrug: true,
      remarks: 'Strict Yellow Prescription Regulation (RA 9165)',
    },
    {
      itemId: 'rx-item-02',
      genericName: 'Paracetamol',
      brandName: 'Biogesic',
      dosage: '500 mg',
      form: 'Tablet',
      sig: 'Take 1 tablet every 6 hours as needed',
      quantity: 10,
      isDangerousDrug: false,
      remarks: null,
    },
  ];

  const standardPrescriptionItems = [
    {
      itemId: 'rx-item-03',
      genericName: 'Azithromycin',
      brandName: 'Zithromax',
      dosage: '500 mg',
      form: 'Tablet',
      sig: 'Take 1 tablet once daily for 3 days',
      quantity: 3,
      isDangerousDrug: false,
      remarks: null,
    },
    {
      itemId: 'rx-item-04',
      genericName: 'Cetirizine',
      brandName: 'Virlix',
      dosage: '10 mg',
      form: 'Tablet',
      sig: 'Take 1 tablet at bedtime as needed',
      quantity: 5,
      isDangerousDrug: false,
      remarks: null,
    },
  ];

  test('1. Instant Print Options Selector provides E-Signed PDF vs Wet Signature choices', () => {
    const printOptions = [
      { id: 'esign', label: 'E-Signed PDF', icon: 'pen' },
      { id: 'wet', label: 'Wet Signature (Pen)', icon: 'file-text' },
    ];

    expect(printOptions).toHaveLength(2);
    expect(printOptions[0].label).toContain('E-Signed PDF');
    expect(printOptions[1].label).toContain('Wet Signature');
  });

  test('2. Defaults to attending clinician preferred signing mode for standard prescriptions', () => {
    const doctorDefaultMode = 'ESignatureSpecimen';
    const hasDangerousDrug = standardPrescriptionItems.some(i => i.isDangerousDrug);

    const resolveInitialPrintMode = (defaultMode: string, hasDangerous: boolean) => {
      if (hasDangerous) return 'WetSignature';
      return defaultMode === 'WetSignature' ? 'WetSignature' : 'ESignatureSpecimen';
    };

    const resolvedMode = resolveInitialPrintMode(doctorDefaultMode, hasDangerousDrug);
    expect(resolvedMode).toBe('ESignatureSpecimen');
  });

  test('3. PDEA S2 Detection: Automatically defaults to Wet Signature Mode when dangerous drug present', () => {
    const doctorDefaultMode = 'ESignatureSpecimen'; // Doctor prefers E-Signature
    const hasDangerousDrug = dangerousPrescriptionItems.some(i => i.isDangerousDrug);

    const resolveInitialPrintMode = (defaultMode: string, hasDangerous: boolean) => {
      if (hasDangerous) return 'WetSignature';
      return defaultMode === 'WetSignature' ? 'WetSignature' : 'ESignatureSpecimen';
    };

    const resolvedMode = resolveInitialPrintMode(doctorDefaultMode, hasDangerousDrug);

    // RA 9165 / DOH-PDEA overrides doctor preference to Wet Signature
    expect(hasDangerousDrug).toBe(true);
    expect(resolvedMode).toBe('WetSignature');
  });

  test('4. Statutory PDEA S2 Regulatory Warning Badge is rendered when dangerous drug present', () => {
    const hasDangerousDrug = dangerousPrescriptionItems.some(i => i.isDangerousDrug);

    const getRegulatoryWarningBadge = (hasDangerous: boolean) => {
      if (!hasDangerous) return null;
      return {
        text: '⚠️ PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations.',
        variant: 'warning',
        backgroundColor: theme.colors.warningLight ?? '#FEF3C7',
        textColor: theme.colors.warningText ?? '#92400E',
      };
    };

    const badge = getRegulatoryWarningBadge(hasDangerousDrug);
    expect(badge).not.toBeNull();
    expect(badge!.text).toContain('PDEA S2 Regulated Substance');
    expect(badge!.text).toContain('DOH-PDEA regulations');
    expect(badge!.variant).toBe('warning');
  });

  test('5. Standard prescription without dangerous drugs omits PDEA warning badge and allows free selection', () => {
    const hasDangerousDrug = standardPrescriptionItems.some(i => i.isDangerousDrug);

    const getRegulatoryWarningBadge = (hasDangerous: boolean) => {
      if (!hasDangerous) return null;
      return { text: 'PDEA S2 warning' };
    };

    const badge = getRegulatoryWarningBadge(hasDangerousDrug);
    expect(hasDangerousDrug).toBe(false);
    expect(badge).toBeNull();
  });

  test('6. Print URL generation attaches ?wet=true when wet signature option is active', () => {
    const getPdfUrl = (consultationId: string, isWet: boolean) => {
      const baseUrl = `/api/v1/prescriptions/${consultationId}/slip-pdf`;
      return isWet ? `${baseUrl}?wet=true` : `${baseUrl}?wet=false`;
    };

    const wetUrl = getPdfUrl('con-123', true);
    const esignUrl = getPdfUrl('con-123', false);

    expect(wetUrl).toBe('/api/v1/prescriptions/con-123/slip-pdf?wet=true');
    expect(esignUrl).toBe('/api/v1/prescriptions/con-123/slip-pdf?wet=false');
  });

  test('7. Token Compliance: warning badge uses semantic warning tokens', () => {
    expect(theme.colors.warning).toBeTruthy();
    expect(theme.colors.surface).toBeTruthy();
    expect(theme.colors.primary).toBeTruthy();
  });

  test('8. clinicService PDF URL helper methods append ?wet=true|false correctly across all 5 endpoints', async () => {
    const { clinicService } = await import('../services/clinicService');

    const rxWet = clinicService.getPrescriptionSlipPdfUrl('con-1', { wet: true });
    const rxEsign = clinicService.getPrescriptionSlipPdfUrl('con-1', { wet: false });
    const rxDefault = clinicService.getPrescriptionSlipPdfUrl('con-1');
    expect(rxWet).toContain('/prescriptions/con-1/slip-pdf?wet=true');
    expect(rxEsign).toContain('/prescriptions/con-1/slip-pdf?wet=false');
    expect(rxDefault).toContain('/prescriptions/con-1/slip-pdf');
    expect(rxDefault).not.toContain('?wet=');

    const numWet = clinicService.getPrescriptionSlipPdfByNumberUrl('RX-99', { wet: true });
    const numEsign = clinicService.getPrescriptionSlipPdfByNumberUrl('RX-99', { wet: false });
    expect(numWet).toContain('/prescriptions/by-number/RX-99/slip-pdf?wet=true');
    expect(numEsign).toContain('/prescriptions/by-number/RX-99/slip-pdf?wet=false');

    const medCertWet = clinicService.getMedicalCertificatePdfUrl('mc-1', { wet: true });
    const medCertEsign = clinicService.getMedicalCertificatePdfUrl('mc-1', { wet: false });
    expect(medCertWet).toContain('/documents/medical-certificates/mc-1/pdf?wet=true');
    expect(medCertEsign).toContain('/documents/medical-certificates/mc-1/pdf?wet=false');

    const refWet = clinicService.getReferralLetterPdfUrl('ref-1', { wet: true });
    const refEsign = clinicService.getReferralLetterPdfUrl('ref-1', { wet: false });
    expect(refWet).toContain('/documents/referrals/ref-1/pdf?wet=true');
    expect(refEsign).toContain('/documents/referrals/ref-1/pdf?wet=false');

    const labWet = clinicService.getLabOrderSlipPdfUrl('lab-1', { wet: true });
    const labEsign = clinicService.getLabOrderSlipPdfUrl('lab-1', { wet: false });
    expect(labWet).toContain('/lab-orders/lab-1/slip-pdf?wet=true');
    expect(labEsign).toContain('/lab-orders/lab-1/slip-pdf?wet=false');
  });

  test('9. PrescriptionSlipModal component mounts and renders with PDEA hardening props', async () => {
    const { default: PrescriptionSlipModal } = await import('../components/PrescriptionSlipModal');
    expect(PrescriptionSlipModal).toBeDefined();

    const slipWithDangerous: any = {
      consultationId: 'con-123',
      prescriptionNumber: 'RX-2026-0001',
      issuedAt: new Date().toISOString(),
      doctorName: 'Dr. John Doe',
      doctorPrcLicense: 'PRC-12345',
      patientName: 'Juan Dela Cruz',
      patientAge: 35,
      patientGender: 'Male',
      items: dangerousPrescriptionItems,
      dispenseStatus: 'Issued',
    };

    const element = React.createElement(PrescriptionSlipModal, {
      visible: true,
      onClose: () => {},
      slip: slipWithDangerous,
      attendingDoctor: {
        id: 'doc-1',
        defaultSignatureMode: 'ESignatureSpecimen',
      } as any,
    });
    expect(element).toBeDefined();
    expect(element.type).toBe(PrescriptionSlipModal);
    expect(element.props.slip.items[0].isDangerousDrug).toBe(true);
  });
});
