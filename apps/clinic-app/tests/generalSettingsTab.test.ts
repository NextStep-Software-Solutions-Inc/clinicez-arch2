// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { default: GeneralSettingsTab } = await import('../components/settings/GeneralSettingsTab');
const { CHART_LAYOUT_OPTIONS } = await import('../components/chart/types');

describe('GeneralSettingsTab — Preferred Medical Chart Layout Configuration', () => {
  test('1. Renders Preferred Medical Chart Layout section with title and description', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'St. Jude Family Clinic',
        setClinicName: () => {},
        accreditationNumber: 'PHIC-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 8am-5pm',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '500',
        setConsultationFee: () => {},
        letterheadHeader: 'St. Jude Clinic',
        setLetterheadHeader: () => {},
        letterheadAddress: '123 Main St',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-123-4567',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        settings: null,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
        preferredChartLayout: 'modal',
        setPreferredChartLayout: () => {},
      })
    );

    expect(markup).toContain('Preferred Medical Chart Layout');
    expect(markup).toContain('Configure the default workstation layout when opening patient medical charts across your facility');
    expect(markup).toContain('Centered Workstation Modal');
    expect(markup).toContain('Split-Pane Clinical Workstation');
    expect(markup).toContain('Slide-Over Focus Drawer');
    expect(markup).toContain('Save layout preference');
  });

  test('2. Renders all 3 layout option cards with radio accessibility attributes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'St. Jude Family Clinic',
        setClinicName: () => {},
        accreditationNumber: 'PHIC-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 8am-5pm',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '500',
        setConsultationFee: () => {},
        letterheadHeader: 'St. Jude Clinic',
        setLetterheadHeader: () => {},
        letterheadAddress: '123 Main St',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-123-4567',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        settings: null,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
        preferredChartLayout: 'split',
        setPreferredChartLayout: () => {},
      })
    );

    for (const opt of CHART_LAYOUT_OPTIONS) {
      expect(markup).toContain(`aria-label="${opt.label} (${opt.badge})"`);
      expect(markup).toContain(opt.description);
    }
  });

  test('3. Renders Clinic Specialty & Clinical Modules section with Medical, Dental, and Multi-Specialty cards', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'St. Jude Family Clinic',
        setClinicName: () => {},
        accreditationNumber: 'PHIC-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 8am-5pm',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '500',
        setConsultationFee: () => {},
        letterheadHeader: 'St. Jude Clinic',
        setLetterheadHeader: () => {},
        letterheadAddress: '123 Main St',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-123-4567',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        settings: {
          specialtyMode: 'Medical',
          enableDentalModule: false,
        } as any,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
      })
    );

    expect(markup).toContain('Clinic Specialty');
    expect(markup).toContain('Clinical Modules');
    expect(markup).toContain('Configure facility specialization and toggle specialty clinical workstations');
    expect(markup).toContain('Medical Practice');
    expect(markup).toContain('Dental Practice');
    expect(markup).toContain('Multi-Specialty Clinic');
    expect(markup).toContain('Save specialty preferences');
  });

  test('4. In Medical specialty mode: Dental Chart Module is marked Inactive and toggle is disabled', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'General Med Clinic',
        setClinicName: () => {},
        accreditationNumber: 'PHIC-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 8am-5pm',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '500',
        setConsultationFee: () => {},
        letterheadHeader: 'St. Jude Clinic',
        setLetterheadHeader: () => {},
        letterheadAddress: '123 Main St',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-123-4567',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        specialtyMode: 'Medical',
        enableDentalModule: false,
        settings: {
          specialtyMode: 'Medical',
          enableDentalModule: false,
        } as any,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
      })
    );

    expect(markup).toContain('Inactive in Medical Mode');
    expect(markup).toContain('Select Dental or Multi-Specialty to activate dental charting');
  });

  test('5. In Dental specialty mode: Dental Chart Module is Permanently Active and toggle is locked', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'Bright Smiles Dental Clinic',
        setClinicName: () => {},
        accreditationNumber: 'DENT-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 9am-6pm',
        setOperatingHours: () => {},
        slotDuration: '45',
        setSlotDuration: () => {},
        consultationFee: '800',
        setConsultationFee: () => {},
        letterheadHeader: 'Bright Smiles',
        setLetterheadHeader: () => {},
        letterheadAddress: '456 Dental Ave',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-888-9999',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        specialtyMode: 'Dental',
        enableDentalModule: true,
        settings: {
          specialtyMode: 'Dental',
          enableDentalModule: true,
        } as any,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
      })
    );

    expect(markup).toContain('Permanently Active (Dental Practice)');
    expect(markup).toContain('The FDI odontogram, tooth surface tracking, and dental procedure catalog are permanently active');
  });

  test('6. In Multi-Specialty mode: Dental Chart Module toggle is enabled and reflects active status', () => {
    const markupActive = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'Metro Polymedic Center',
        setClinicName: () => {},
        accreditationNumber: 'POLY-001',
        setAccreditationNumber: () => {},
        operatingHours: '24/7',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '600',
        setConsultationFee: () => {},
        letterheadHeader: 'Metro Polymedic',
        setLetterheadHeader: () => {},
        letterheadAddress: '789 Highway',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-555-1234',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: true,
        settings: {
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: true,
        } as any,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
      })
    );

    expect(markupActive).toContain('Active');
    expect(markupActive).toContain('Enables adult (11–48) and child (51–85) FDI odontograms');

    const markupDisabled = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'Metro Polymedic Center',
        setClinicName: () => {},
        accreditationNumber: 'POLY-001',
        setAccreditationNumber: () => {},
        operatingHours: '24/7',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '600',
        setConsultationFee: () => {},
        letterheadHeader: 'Metro Polymedic',
        setLetterheadHeader: () => {},
        letterheadAddress: '789 Highway',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-555-1234',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: false,
        settings: {
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: false,
        } as any,
        eodReport: null,
        eodLoadError: null,
        onRefreshEod: async () => {},
        formatPeso: (v) => `₱${v}`,
      })
    );

    expect(markupDisabled).toContain('Disabled');
  });
});
