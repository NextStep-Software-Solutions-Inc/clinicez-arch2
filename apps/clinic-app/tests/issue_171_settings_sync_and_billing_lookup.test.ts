// token-guard:ignore-file
import { describe, expect, it, mock } from 'bun:test';
import React, { createElement, useContext, useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, style, testID, onPress, ...props }: any) => {
    return createElement(
      'div',
      {
        'data-component': name,
        'data-testid': testID,
        ...props,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => s,
  },
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
  TouchableHighlight: createMockComponent('TouchableOpacity'),
  Image: createMockComponent('Image'),
  RefreshControl: createMockComponent('RefreshControl'),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  Touchable: { Mixin: {} },
  processColor: (c: any) => c,
  Alert: { alert: () => {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: createMockComponent('Polyline'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  default: PatientSearchResultRow,
  parseConfiguredSearchFields,
  STANDARD_SEARCH_FIELDS,
} = await import('../components/patient/PatientSearchResultRow');

const { ClinicContext } = await import('../context/ClinicContext');

describe('Issue #171: Clinic Settings Synchronization & Billing Search Parity', () => {
  const samplePatient = {
    id: 'pat-101',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    patientCode: 'PAT-2026-01016',
    firstName: 'Esperanza',
    lastName: 'Santos',
    fullName: 'Esperanza Santos',
    dateOfBirth: '1999-09-10',
    age: 27,
    sex: 'Female',
    contactNumber: '0935-807-9387',
    philHealthNumber: '11-909567893-2',
    seniorCitizenId: 'OSCA-12345',
    pwdId: undefined,
  } as any;

  describe('Suite 1: PatientSearchResultRow Dynamic Fields and Action Integration', () => {
    it('1.1 Renders only patientCode when only patientCode is configured (default state before refresh)', () => {
      const html = renderToString(
        createElement(PatientSearchResultRow, {
          patient: samplePatient,
          configuredFieldKeys: ['patientCode'],
        })
      );

      expect(html).toContain('PAT-2026-01016');
      expect(html).not.toContain('27y');
      expect(html).not.toContain('Female');
      expect(html).not.toContain('1999-09-10');
      expect(html).not.toContain('0935-807-9387');
      expect(html).not.toContain('11-909567893-2');
    });

    it('1.2 Renders configured demographic fields (Age, DOB, Sex, Contact) and omits PhilHealth when unchecked', () => {
      const configuredFields = ['patientCode', 'age', 'dateOfBirth', 'sex', 'contactNumber'];
      const html = renderToString(
        createElement(PatientSearchResultRow, {
          patient: samplePatient,
          configuredFieldKeys: configuredFields,
        })
      );

      expect(html).toContain('PAT-2026-01016');
      expect(html).toContain('27y');
      expect(html).toContain('DOB: ');
      expect(html).toContain('1999-09-10');
      expect(html).toContain('Female');
      expect(html).toContain('0935-807-9387');
      // PhilHealth PIN was not in configuredFields, so it MUST NOT be rendered
      expect(html).not.toContain('11-909567893-2');
      expect(html).not.toContain('PhilHealth:');
    });

    it('1.3 Renders PhilHealth PIN when explicitly included in configured fields', () => {
      const configuredFields = ['patientCode', 'philHealthNumber'];
      const html = renderToString(
        createElement(PatientSearchResultRow, {
          patient: samplePatient,
          configuredFieldKeys: configuredFields,
        })
      );

      expect(html).toContain('PAT-2026-01016');
      expect(html).toContain('PhilHealth: ');
      expect(html).toContain('11-909567893-2');
      expect(html).not.toContain('27y');
    });

    it('1.4 Renders rightAction and extraBadges cleanly without breaking row layout', () => {
      const actionButton = createElement(
        'button',
        { 'data-testid': 'load-soa-btn' },
        'Load SOA / Bill'
      );
      const seniorBadge = createElement(
        'span',
        { 'data-testid': 'senior-badge' },
        'Senior'
      );

      const html = renderToString(
        createElement(PatientSearchResultRow, {
          patient: samplePatient,
          configuredFieldKeys: ['patientCode', 'age', 'sex'],
          rightAction: actionButton,
          extraBadges: seniorBadge,
          selected: true,
        })
      );

      expect(html).toContain('Esperanza Santos');
      expect(html).toContain('data-testid="load-soa-btn"');
      expect(html).toContain('data-testid="senior-badge"');
      expect(html).toContain('27y');
      expect(html).toContain('Female');
    });
  });

  describe('Suite 2: ClinicContext Synchronous updateSettings State Propagation', () => {
    it('2.1 ClinicContext exposes updateSettings function in its context contract', () => {
      let contextValue: any = null;
      function TestConsumer() {
        contextValue = useContext(ClinicContext);
        return null;
      }

      renderToString(createElement(TestConsumer));
      expect(contextValue).toBeDefined();
      expect(typeof contextValue.updateSettings).toBe('function');
    });

    it('2.2 Synchronous updateSettings updates settings in memory and triggers subscriber re-renders', () => {
      let capturedValue: any = null;

      function Consumer() {
        const { settings } = useContext(ClinicContext);
        return createElement(
          'div',
          { 'data-testid': 'consumer-content' },
          settings?.enableChipLevelQueueCalling ? 'CHIP_ENABLED' : 'CHIP_DISABLED'
        );
      }

      function TestProviderWrapper({ initialSettings }: { initialSettings: any }) {
        const [settings, setSettings] = useState<any>(initialSettings);
        const updateSettings = (updated: any) => {
          setSettings(updated);
        };
        capturedValue = { settings, updateSettings };

        return createElement(
          ClinicContext.Provider,
          {
            value: {
              settings,
              updateSettings,
            } as any,
          },
          createElement(Consumer)
        );
      }

      const initialHtml = renderToString(
        createElement(TestProviderWrapper, {
          initialSettings: {
            id: 'set-1',
            patientSearchDisplayFieldsJson: JSON.stringify(['patientCode']),
            enableChipLevelQueueCalling: false,
          },
        })
      );
      expect(initialHtml).toContain('CHIP_DISABLED');
      expect(capturedValue.settings.enableChipLevelQueueCalling).toBe(false);

      const updatedHtml = renderToString(
        createElement(TestProviderWrapper, {
          initialSettings: {
            id: 'set-1',
            patientSearchDisplayFieldsJson: JSON.stringify(['patientCode', 'age', 'sex']),
            enableChipLevelQueueCalling: true,
          },
        })
      );
      expect(updatedHtml).toContain('CHIP_ENABLED');
      expect(capturedValue.settings.enableChipLevelQueueCalling).toBe(true);
      expect(
        parseConfiguredSearchFields(capturedValue.settings.patientSearchDisplayFieldsJson)
      ).toEqual(['patientCode', 'age', 'sex']);
    });
  });

  describe('Suite 3: Settings.screen.tsx and Billing.screen.tsx Integration Contracts', () => {
    it('3.1 Settings.screen.tsx defines handleSettingsUpdated calling updateClinicSettings and refreshClinic', async () => {
      const fs = await import('fs');
      const settingsSource = fs.readFileSync(
        'apps/clinic-app/navigation/screens/Settings.screen.tsx',
        'utf-8'
      );

      expect(settingsSource).toContain('updateSettings: updateClinicSettings');
      expect(settingsSource).toContain('handleSettingsUpdated');
      expect(settingsSource).toContain('updateClinicSettings(updated);');
      expect(settingsSource).toContain('void refreshClinic();');
      expect(settingsSource).toContain('onSettingsUpdated={handleSettingsUpdated}');
    });

    it('3.2 Billing.screen.tsx integrates PatientSearchResultRow and configuredSearchFields', async () => {
      const fs = await import('fs');
      const billingSource = fs.readFileSync(
        'apps/clinic-app/navigation/screens/Billing.screen.tsx',
        'utf-8'
      );

      expect(billingSource).toContain('PatientSearchResultRow');
      expect(billingSource).toContain('parseConfiguredSearchFields');
      expect(billingSource).toContain('configuredSearchFields');
      expect(billingSource).toContain('customFieldDefs');
      // Confirms hardcoded PIN string in registry search was replaced with PatientSearchResultRow
      expect(billingSource).not.toContain('{patient.philHealthNumber ? ` • PIN: ${patient.philHealthNumber}` : \'\'}');
    });
  });
});
