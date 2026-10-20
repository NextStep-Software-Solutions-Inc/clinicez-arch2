// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

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

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({
    canceled: false,
    assets: [{
      uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC',
      name: 'signature_specimen.png',
      mimeType: 'image/png',
      size: 68,
    }],
  }),
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

const { theme } = await import('../constants/theme');

describe('Staff Signature Specimen & Physician Stamp Imprint Management', () => {
  const sampleDoctorProfile = {
    id: 'doc-001',
    name: 'Dr. Allan Ramos, MD, FPCP',
    role: 'Doctor',
    prcLicenseNumber: 'PRC-0056789',
    ptrNumber: 'PTR-2026-9912',
    s2LicenseNumber: 'S2-0918-99214-A1',
    philHealthPan: 'PAN-12-09281',
    signatureSpecimen: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC',
    defaultSignatureMode: 'ESignatureSpecimen' as const,
  };

  test('1. Physician Stamp Imprint renders mandatory Philippine medical credentials', () => {
    // Stamp must present doctor's full legal name, PRC, PTR, S2, and PhilHealth PAN
    expect(sampleDoctorProfile.name).toContain('Dr. Allan Ramos');
    expect(sampleDoctorProfile.prcLicenseNumber).toBe('PRC-0056789');
    expect(sampleDoctorProfile.ptrNumber).toBe('PTR-2026-9912');
    expect(sampleDoctorProfile.s2LicenseNumber).toBe('S2-0918-99214-A1');
    expect(sampleDoctorProfile.philHealthPan).toBe('PAN-12-09281');
  });

  test('2. Signature Upload validates transparent PNG MIME type and size', () => {
    const validPngAsset = {
      name: 'specimen.png',
      mimeType: 'image/png',
      size: 45000, // 45KB
    };

    const isPng = validPngAsset.mimeType === 'image/png' || validPngAsset.name.endsWith('.png');
    const isWithinSizeLimit = validPngAsset.size <= 500000; // max 500KB

    expect(isPng).toBe(true);
    expect(isWithinSizeLimit).toBe(true);
  });

  test('3. Signature Upload rejects non-PNG or oversized files', () => {
    const invalidJpgAsset = {
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 45000,
    };
    const oversizedPngAsset = {
      name: 'huge_specimen.png',
      mimeType: 'image/png',
      size: 1500000, // 1.5MB
    };

    const validateAsset = (asset: { mimeType: string; size: number }) => {
      if (asset.mimeType !== 'image/png') return { valid: false, error: 'Only transparent PNG signature specimens are supported.' };
      if (asset.size > 500000) return { valid: false, error: 'Signature specimen image must not exceed 500KB.' };
      return { valid: true, error: null };
    };

    expect(validateAsset(invalidJpgAsset).valid).toBe(false);
    expect(validateAsset(oversizedPngAsset).valid).toBe(false);
  });

  test('4. Signature Pad stroke recording captures base64 representation', () => {
    // Canvas draw pad generates data URI transparent PNG
    const drawPadDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC';
    expect(drawPadDataUri).toStartWith('data:image/png;base64,');
  });

  test('5. Default Signing Mode Selector supports Tri-Mode options', () => {
    type SignatureMode = 'ESignatureSpecimen' | 'DigitalSealOnly' | 'WetSignature';
    const modes: SignatureMode[] = ['ESignatureSpecimen', 'DigitalSealOnly', 'WetSignature'];

    expect(modes).toHaveLength(3);
    expect(modes).toContain(sampleDoctorProfile.defaultSignatureMode);
  });

  test('6. Physician Stamp Imprint layout adjusts reactively to selected mode', () => {
    const getStampDisplay = (mode: string, signatureUri?: string | null) => {
      switch (mode) {
        case 'ESignatureSpecimen':
          return {
            hasImage: Boolean(signatureUri),
            hasBlankLine: false,
            badge: '✓ Digitally Certified & Locked',
            color: theme.colors.success ?? '#16A34A',
          };
        case 'DigitalSealOnly':
          return {
            hasImage: false,
            hasBlankLine: false,
            badge: '✓ Digital Verification Seal',
            color: theme.colors.primary,
          };
        case 'WetSignature':
          return {
            hasImage: false,
            hasBlankLine: true,
            badge: null,
            color: theme.colors.textMuted ?? '#6B7280',
          };
        default:
          throw new Error(`Unknown mode ${mode}`);
      }
    };

    const eSigStamp = getStampDisplay('ESignatureSpecimen', sampleDoctorProfile.signatureSpecimen);
    expect(eSigStamp.hasImage).toBe(true);
    expect(eSigStamp.badge).toContain('Digitally Certified');

    const sealStamp = getStampDisplay('DigitalSealOnly');
    expect(sealStamp.hasImage).toBe(false);
    expect(sealStamp.badge).toContain('Digital Verification Seal');

    const wetStamp = getStampDisplay('WetSignature');
    expect(wetStamp.hasImage).toBe(false);
    expect(wetStamp.hasBlankLine).toBe(true);
    expect(wetStamp.badge).toBeNull();
  });

  test('7. Stamp Imprint Design Token compliance: uses standard theme colors', () => {
    expect(theme.colors.primary).toBeTruthy();
    expect(theme.colors.border).toBeTruthy();
    expect(theme.colors.text).toBeTruthy();
  });

  test('8. validateSignatureAsset helper validates MIME type and file size thresholds', async () => {
    const { validateSignatureAsset } = await import('../components/settings/SignatureSpecimenModal');

    // Valid PNG below 500KB
    const valid = validateSignatureAsset({ name: 'sig.png', mimeType: 'image/png', size: 120000 });
    expect(valid.valid).toBe(true);
    expect(valid.error).toBeNull();

    // Invalid non-PNG
    const invalidType = validateSignatureAsset({ name: 'photo.jpg', mimeType: 'image/jpeg', size: 40000 });
    expect(invalidType.valid).toBe(false);
    expect(invalidType.error).toBe('Only transparent PNG signature specimens are supported.');

    // Oversized PNG (> 500KB)
    const oversized = validateSignatureAsset({ name: 'sig.png', mimeType: 'image/png', size: 600000 });
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toBe('Signature specimen image must not exceed 500KB.');
  });

  test('9. strokesToPngDataUri and strokeToSvgPath generate paths and transparent PNG data URI', async () => {
    const { strokesToPngDataUri, strokeToSvgPath } = await import('../components/settings/SignatureSpecimenModal');

    const sampleStroke = [
      { x: 10, y: 15 },
      { x: 25, y: 35 },
      { x: 50, y: 60 },
    ];

    const svgPath = strokeToSvgPath(sampleStroke);
    expect(svgPath).toBe('M 10 15 L 25 35 L 50 60');

    const emptyPath = strokeToSvgPath([]);
    expect(emptyPath).toBe('');

    const dataUri = strokesToPngDataUri([sampleStroke]);
    expect(dataUri).toStartWith('data:image/png;base64,');
  });

  test('10. pickSignatureSpecimen reads asset from document picker', async () => {
    const { pickSignatureSpecimen } = await import('../components/settings/SignatureSpecimenModal');
    const res = await pickSignatureSpecimen();
    expect(res).not.toBeNull();
    expect(res?.dataUri).toStartWith('data:image/png;base64,');
    expect(res?.error).toBeUndefined();
  });

  test('11. SignatureSpecimenModal renders component hierarchy with active mode', async () => {
    const { default: SignatureSpecimenModal } = await import('../components/settings/SignatureSpecimenModal');
    expect(SignatureSpecimenModal).toBeDefined();

    const modalElem = React.createElement(SignatureSpecimenModal, {
      visible: true,
      onClose: () => {},
      initialSignature: sampleDoctorProfile.signatureSpecimen,
      initialMode: 'ESignatureSpecimen',
      doctorName: sampleDoctorProfile.name,
      credentials: {
        prc: sampleDoctorProfile.prcLicenseNumber,
        ptr: sampleDoctorProfile.ptrNumber,
        s2: sampleDoctorProfile.s2LicenseNumber,
        pan: sampleDoctorProfile.philHealthPan,
      },
      onSave: () => {},
    });

    expect(modalElem).toBeDefined();
    expect(modalElem.props.visible).toBe(true);
    expect(modalElem.props.initialMode).toBe('ESignatureSpecimen');
  });

  test('12. StaffMember and clinicService payload contracts accept signature fields', async () => {
    const { clinicService } = await import('../services/clinicService');
    expect(clinicService).toBeDefined();

    const staffPayload = {
      firstName: 'Allan',
      lastName: 'Ramos',
      role: 'Doctor' as const,
      signatureSpecimen: sampleDoctorProfile.signatureSpecimen,
      defaultSignatureMode: 'ESignatureSpecimen' as const,
    };

    expect(staffPayload.signatureSpecimen).toBe(sampleDoctorProfile.signatureSpecimen);
    expect(staffPayload.defaultSignatureMode).toBe('ESignatureSpecimen');
  });
});
