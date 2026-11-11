// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
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
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  RefreshControl: createMockComponent('RefreshControl'),
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
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'polyline',
  Polygon: 'polygon',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  default: GeneralSettingsTab,
  CLINIC_SPECIALTY_OPTIONS,
  PLAIN_CHART_VIEW_OPTIONS,
  buildChartLayoutSavePayload,
  isBillingShortcutEnabled,
} = await import('../components/settings/GeneralSettingsTab');

const baseProps = {
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
  formatPeso: (v: number | undefined | null) => `₱${v ?? 0}`,
};

describe('GeneralSettingsTab — Modular Decomposition & Card Restyling', () => {
  test('1. Renders Default Patient Chart View section with plain clinic language and dirty-only Save button', () => {
    const cleanMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        settings: { preferredChartLayout: 'modal' } as any,
        preferredChartLayout: 'modal',
        setPreferredChartLayout: () => {},
      })
    );

    expect(cleanMarkup).toContain('Default Patient Chart View');
    expect(cleanMarkup).toContain('Choose how patient medical charts open by default across your clinic');
    expect(cleanMarkup).toContain('Centered Window');
    expect(cleanMarkup).toContain('Side-by-Side View');
    expect(cleanMarkup).toContain('Side Panel');
    expect(cleanMarkup).not.toContain('Save chart view');

    const dirtyMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        settings: { preferredChartLayout: 'modal' } as any,
        preferredChartLayout: 'split',
        setPreferredChartLayout: () => {},
      })
    );
    expect(dirtyMarkup).toContain('Save chart view');
  });

  test('2. Renders all 3 plain chart view cards with radio accessibility attributes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        preferredChartLayout: 'split',
        setPreferredChartLayout: () => {},
      })
    );

    for (const opt of PLAIN_CHART_VIEW_OPTIONS) {
      expect(markup).toContain(`aria-label="${opt.label} (${opt.badge})"`);
      expect(markup).toContain(opt.description);
    }
  });

  test('3. Renders Clinic Specialty section with Medical, Dental, and Multi-Specialty cards and dirty-only Save button', () => {
    const cleanMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        specialtyMode: 'Medical',
        enableDentalModule: false,
        settings: {
          specialtyMode: 'Medical',
          enableDentalModule: false,
        } as any,
      })
    );

    expect(cleanMarkup).toContain('Clinic Specialty');
    expect(cleanMarkup).toContain('Choose whether your clinic sees medical patients, dental patients, or both');
    expect(cleanMarkup).toContain('Medical Practice');
    expect(cleanMarkup).toContain('Dental Practice');
    expect(cleanMarkup).toContain('Multi-Specialty Clinic');
    expect(cleanMarkup).toContain('Dental Tooth Chart');
    expect(cleanMarkup).not.toContain('Save specialty');

    const dirtyMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        specialtyMode: 'Dental',
        enableDentalModule: true,
        settings: {
          specialtyMode: 'Medical',
          enableDentalModule: false,
        } as any,
      })
    );
    expect(dirtyMarkup).toContain('Save specialty');
  });

  test('4. In Medical specialty mode: Dental Chart Module is marked Inactive and toggle is disabled', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        clinicName: 'General Med Clinic',
        specialtyMode: 'Medical',
        enableDentalModule: false,
        settings: {
          specialtyMode: 'Medical',
          enableDentalModule: false,
        } as any,
      })
    );

    expect(markup).toContain('Inactive in Medical Mode');
    expect(markup).toContain('Select Dental or Multi-Specialty to activate dental charting');
  });

  test('5. In Dental specialty mode: Dental Chart Module is Permanently Active and toggle is locked', () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        clinicName: 'Bright Smiles Dental Clinic',
        specialtyMode: 'Dental',
        enableDentalModule: true,
        settings: {
          specialtyMode: 'Dental',
          enableDentalModule: true,
        } as any,
      })
    );

    expect(markup).toContain('Permanently Active (Dental Practice)');
    expect(markup).toContain('The FDI odontogram, tooth surface tracking, and dental procedure catalog are permanently active');
  });

  test('6. In Multi-Specialty mode: Dental Chart Module toggle is enabled and reflects active status', () => {
    const markupActive = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        clinicName: 'Metro Polymedic Center',
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: true,
        settings: {
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: true,
        } as any,
      })
    );

    expect(markupActive).toContain('Active');
    expect(markupActive).toContain('Enables adult (11–48) and child (51–85) FDI odontograms');

    const markupDisabled = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        clinicName: 'Metro Polymedic Center',
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: false,
        settings: {
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: false,
        } as any,
      })
    );

    expect(markupDisabled).toContain('Disabled');
  });

  test('7. Fixes all UTF-8 mojibake in specialty descriptions, schedule helper, and Peso fee label', () => {
    for (const opt of CLINIC_SPECIALTY_OPTIONS) {
      expect(opt.description).not.toContain('â');
    }
    const dentalOpt = CLINIC_SPECIALTY_OPTIONS.find((o) => o.id === 'Dental')!;
    const multiOpt = CLINIC_SPECIALTY_OPTIONS.find((o) => o.id === 'Multi-Specialty')!;
    expect(dentalOpt.description).toContain('11–48');
    expect(multiOpt.description).toContain('facility’s');

    const generalMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'general',
        operatingHours: '',
      })
    );
    expect(generalMarkup).toContain('Not configured yet — please specify clinic schedule');
    expect(generalMarkup).toContain('Consultation fee (₱)');
    expect(generalMarkup).not.toContain('â');
  });

  test('8. activeSection isolates each decomposed section cleanly and expands fluidly across 100% width', () => {
    const generalOnly = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, { ...baseProps, activeSection: 'general' })
    );
    expect(generalOnly).toContain('data-testid="general-settings-constrained-root"');
    expect(generalOnly).not.toContain('960');
    expect(generalOnly).toContain('data-testid="facility-identity-card"');
    expect(generalOnly).toContain('data-testid="schedule-consultation-card"');
    expect(generalOnly).toContain('data-testid="official-letterhead-card"');
    expect(generalOnly).not.toContain('data-testid="clinical-specialty-card"');
    expect(generalOnly).not.toContain('data-testid="clinic-logo-specimen-card"');

    const brandingOnly = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, { ...baseProps, activeSection: 'branding' })
    );
    expect(brandingOnly).toContain('data-testid="clinic-logo-specimen-card"');
    expect(brandingOnly).not.toContain('data-testid="facility-identity-card"');

    const clinicalOnly = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, { ...baseProps, activeSection: 'clinical' })
    );
    expect(clinicalOnly).toContain('data-testid="clinical-specialty-card"');
    expect(clinicalOnly).toContain('data-testid="chart-layout-default-card"');
    expect(clinicalOnly).not.toContain('data-testid="facility-identity-card"');
  });

  test('9. Removes duplicate 6-StatCard collections census block and conditionally renders Billing shortcut', () => {
    const billingHiddenMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'billing-policy',
        canAccessBilling: false,
        eodReport: {
          cashInDrawer: 10000,
          totalAmountCollected: 15000,
          totalNetAmount: 15000,
          totalCheckedIn: 12,
          totalCompletedVisits: 10,
          totalDiscountsGiven: 500,
          totalPhilHealthCovered: 1000,
        } as any,
      })
    );
    expect(billingHiddenMarkup).not.toContain("Today's collections");
    expect(billingHiddenMarkup).not.toContain('Cash in drawer');
    expect(billingHiddenMarkup).not.toContain('data-testid="billing-live-shortcut-card"');

    const billingVisibleMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'billing-policy',
        canAccessBilling: true,
        cashierMode: 'ClinicDesk',
      })
    );
    expect(billingVisibleMarkup).toContain('data-testid="billing-live-shortcut-card"');
    expect(billingVisibleMarkup).toContain('Today&#x27;s Billing &amp; Daily Summary');
    expect(billingVisibleMarkup).toContain('Front-Desk Billing');
    expect(billingVisibleMarkup).toContain('Open Billing');

    // Hidden when routed to external Centralized Cashier Counter
    const counterModeMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'billing-policy',
        canAccessBilling: true,
        cashierMode: 'CashierCounter',
      })
    );
    expect(counterModeMarkup).not.toContain('data-testid="billing-live-shortcut-card"');

    expect(isBillingShortcutEnabled({ cashierMode: 'ClinicDesk', userRole: 'Admin' })).toBe(true);
    expect(isBillingShortcutEnabled({ cashierMode: 'ClinicDesk', userRole: 'Doctor' })).toBe(false);
    expect(isBillingShortcutEnabled({ cashierMode: 'CashierCounter', userRole: 'Admin' })).toBe(false);
  });

  test('10. Chart layout save payload is decoupled from clinic-name validation', () => {
    expect(buildChartLayoutSavePayload('split')).toEqual({ preferredChartLayout: 'split' });
    expect(buildChartLayoutSavePayload('drawer')).toEqual({ preferredChartLayout: 'drawer' });
  });

  test('11. Zero hardcoded fallbacks & full Skeleton loading coverage across GeneralSettingsTab cards', () => {
    const brandingSkeleton = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'branding',
        clinicName: '',
        showSkeletons: true,
      })
    );
    expect(brandingSkeleton).toContain('role="progressbar"');
    expect(brandingSkeleton).not.toContain('Default Logo');
    expect(brandingSkeleton).not.toContain('Clinic EZ Facility');

    const brandingLoadedBlank = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'branding',
        clinicName: '',
        showSkeletons: false,
      })
    );
    expect(brandingLoadedBlank).toContain('No clinic name set');
    expect(brandingLoadedBlank).not.toContain('Clinic EZ Facility');

    const clinicalSkeleton = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'clinical',
        showSkeletons: true,
      })
    );
    expect(clinicalSkeleton).toContain('data-testid="patient-search-skeleton"');

    const queueSkeleton = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'queue-tv',
        showSkeletons: true,
      })
    );
    expect(queueSkeleton).toContain('data-testid="clinic-rooms-skeleton"');

    const billingSkeleton = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'billing-policy',
        canAccessBilling: true,
        showSkeletons: true,
      })
    );
    expect(billingSkeleton).toContain('data-testid="billing-live-shortcut-skeleton"');
    expect(billingSkeleton).not.toContain('Front-Desk Billing');

    const generalNeutralPlaceholders = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'general',
      })
    );
    expect(generalNeutralPlaceholders).toContain('Enter clinic hours');
    expect(generalNeutralPlaceholders).toContain('Minutes per slot');
    expect(generalNeutralPlaceholders).not.toContain('e.g. 30');
    expect(generalNeutralPlaceholders).not.toContain('e.g. 500');
  });

  test('12. Hides all inline Save buttons across Settings cards when unchanged (!isDirty && !saving) and shows only the modified card Save button', () => {
    const savedSettings = {
      id: 's-1',
      tenantId: 't-1',
      clinicId: 'c-1',
      clinicName: 'St. Jude Family Clinic',
      accreditationNumber: 'PHIC-001',
      operatingHours: 'Mon-Fri 8am-5pm',
      defaultSlotDurationMinutes: 30,
      defaultConsultationFee: 500,
      letterheadHeader: 'St. Jude Clinic',
      letterheadAddress: '123 Main St',
      letterheadContact: '0917-123-4567',
      specialtyMode: 'Medical',
      enableDentalModule: false,
      preferredChartLayout: 'modal',
      cashierMode: 'ClinicDesk',
      eodReconciliationTime: '21:00',
      autoEodEnabled: true,
      enableQueuePushNotifications: true,
      queuePushNotificationThreshold: 2,
      staffNotificationRetentionDays: 30,
      enableStatAudioAlert: true,
      enableStatVibrationAlert: true,
      enableAppointmentReminders: true,
      appointmentReminder24hEnabled: true,
      appointmentReminder2hEnabled: true,
      enableStaffAppointmentNotifications: true,
      tvDisplayPin: '123456',
    } as any;

    const cleanAllMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        settings: savedSettings,
        preferredChartLayout: 'modal',
        specialtyMode: 'Medical',
        enableDentalModule: false,
        cashierMode: 'ClinicDesk',
      })
    );

    // Every single inline Save button must be omitted from the DOM when clean
    expect(cleanAllMarkup).not.toContain('Save changes');
    expect(cleanAllMarkup).not.toContain('Save hours &amp; fee');
    expect(cleanAllMarkup).not.toContain('Save header &amp; contact info');
    expect(cleanAllMarkup).not.toContain('Save Regional Settings');
    expect(cleanAllMarkup).not.toContain('Save specialty');
    expect(cleanAllMarkup).not.toContain('Save chart view');
    expect(cleanAllMarkup).not.toContain('Save Search Fields');
    expect(cleanAllMarkup).not.toContain('Save Passcode');
    expect(cleanAllMarkup).not.toContain('Save Notification Settings');
    expect(cleanAllMarkup).not.toContain('Save Reminder Preferences');
    expect(cleanAllMarkup).not.toContain('Save billing station preferences');
    expect(cleanAllMarkup).not.toContain('Save EOD Schedule');

    // Modifying Clinic Details only reveals "Save changes" and keeps other cards clean
    const dirtyIdentityMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'general',
        settings: savedSettings,
        clinicName: 'St. Jude Family Clinic Updated',
      })
    );
    expect(dirtyIdentityMarkup).toContain('Save changes');
    expect(dirtyIdentityMarkup).not.toContain('Save hours &amp; fee');
    expect(dirtyIdentityMarkup).not.toContain('Save header &amp; contact info');

    // Modifying Consultation Fee only reveals "Save hours & fee"
    const dirtyScheduleMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'general',
        settings: savedSettings,
        consultationFee: '650',
      })
    );
    expect(dirtyScheduleMarkup).not.toContain('Save changes');
    expect(dirtyScheduleMarkup).toContain('Save hours &amp; fee');
    expect(dirtyScheduleMarkup).not.toContain('Save header &amp; contact info');

    // Modifying Printed Header only reveals "Save header & contact info"
    const dirtyLetterheadMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        ...baseProps,
        activeSection: 'general',
        settings: savedSettings,
        letterheadAddress: '456 Rizal Ave, Manila',
      })
    );
    expect(dirtyLetterheadMarkup).not.toContain('Save changes');
    expect(dirtyLetterheadMarkup).not.toContain('Save hours &amp; fee');
    expect(dirtyLetterheadMarkup).toContain('Save header &amp; contact info');
  });
});
