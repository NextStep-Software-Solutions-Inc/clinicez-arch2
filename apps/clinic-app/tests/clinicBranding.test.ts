// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('../components/FacilityActivationGate', () => ({
  useFacilityLicense: () => ({
    license: { clinicId: 'clinic-1', clinicName: 'St. Jude General Hospital', planTier: 'enterprise' },
  }),
}));

const { getDeviceItem, setDeviceItem } = await import('../utils/deviceStorage');
const { clinicService } = await import('../services/clinicService');
const { ClinicProvider, useClinic, CLINIC_LOGO_STORAGE_KEY } = await import('../context/ClinicContext');

let mockUpdateSettingsPayload: any = null;
let mockSettingsResponse: any = {
  clinicName: 'St. Jude General Hospital',
  primaryLogoUrl: 'data:image/png;base64,initialLogoData',
  primaryColorHex: '#0D6963',
};

const origGetSettings = clinicService.getSettings.bind(clinicService);
const origGetRooms = clinicService.getRooms.bind(clinicService);
const origUpdateSettings = clinicService.updateSettings.bind(clinicService);

function TestClinicConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useClinic>) => void }) {
  const ctx = useClinic();
  onRender(ctx);
  return React.createElement('div', { 'data-logo': ctx.clinicLogo ?? '' }, ctx.facilityName);
}

describe('Clinic Branding & Database Logo Persistence', () => {
  beforeEach(() => {
    delete (globalThis as any).__mockClinicContext;
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, null);
    mockUpdateSettingsPayload = null;
    mockSettingsResponse = {
      clinicName: 'St. Jude General Hospital',
      primaryLogoUrl: 'data:image/png;base64,initialLogoData',
      primaryColorHex: '#0D6963',
    };

    clinicService.getSettings = () => Promise.resolve([mockSettingsResponse, null]) as any;
    clinicService.getRooms = () => Promise.resolve([[], null]) as any;
    clinicService.updateSettings = (payload: any) => {
      mockUpdateSettingsPayload = payload;
      return Promise.resolve([{ ...mockSettingsResponse, ...payload }, null]) as any;
    };
  });

  afterAll(() => {
    clinicService.getSettings = origGetSettings;
    clinicService.getRooms = origGetRooms;
    clinicService.updateSettings = origUpdateSettings;
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, null);
    delete (globalThis as any).__mockClinicContext;
  });

  test('loads logo from database settings or deviceStorage cache', () => {
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, 'data:image/png;base64,cachedLogo');

    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    expect(captured).not.toBeNull();
    expect(captured.clinicLogo).toBe('data:image/png;base64,cachedLogo');
    expect(captured.facilityName).toBe('St. Jude General Hospital');
  });

  test('setClinicLogo writes to deviceStorage and commits to backend database', async () => {
    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    const newLogoUri = 'data:image/png;base64,updatedClinicLogoData';
    const success = await captured.setClinicLogo(newLogoUri);

    expect(success).toBe(true);
    // Verified local persistence
    expect(getDeviceItem(CLINIC_LOGO_STORAGE_KEY)).toBe(newLogoUri);
    // Verified database update payload sent to backend API
    expect(mockUpdateSettingsPayload).toEqual({ primaryLogoUrl: newLogoUri });
  });

  test('setClinicLogo with null removes logo from cache and sends empty string to database', async () => {
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, 'data:image/png;base64,existingLogo');

    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    const success = await captured.setClinicLogo(null);

    expect(success).toBe(true);
    // Verified local cache cleared
    expect(getDeviceItem(CLINIC_LOGO_STORAGE_KEY)).toBeNull();
    // Verified database update payload cleared
    expect(mockUpdateSettingsPayload).toEqual({ primaryLogoUrl: '' });
  });
});
