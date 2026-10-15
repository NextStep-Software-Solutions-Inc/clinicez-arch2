// token-guard:ignore-file
import { describe, expect, test, mock, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(testID ? { 'data-testid': testID } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  Touchable: { Mixin: {} },
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

(globalThis as any).__mockClinicContext = {
  facilityName: 'Metro Health Wellness Center',
  settings: {
    id: 'sett-123',
    clinicId: '44444444-4444-4444-4444-444444444444',
    tenantId: 'metro-health-tenant',
    clinicName: 'Metro Health Wellness Center',
    operatingHours: 'Mon-Fri 8:00 AM - 5:00 PM',
    defaultSlotDurationMinutes: 15,
    queuePrefix: 'Q',
    invoicePrefix: 'INV',
    defaultConsultationFee: 500,
    vatRate: 0.12,
  },
  primaryColorHex: '#0D6963',
  license: null,
};

const { default: DevDataSeederCard } = await import('../components/settings/DevDataSeederCard');
const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');

describe('DevDataSeederCard — Clinic-Exclusive Data Seeder Component', () => {
  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
  test('1. Renders clinic-exclusive scope banner with active clinic name, ID, and tenant', () => {
    const markup = renderToStaticMarkup(React.createElement(DevDataSeederCard));

    expect(markup).toContain('Development Data Seeder &amp; Scalability Engine');
    expect(markup).toContain('Clinic-Exclusive Test Scope');
    expect(markup).toContain('Metro Health Wellness Center');
    expect(markup).toContain('44444444-4444-4444-4444-444444444444');
    expect(markup).toContain('metro-health-tenant');
    expect(markup).toContain('Other clinics and tenants in the system will not see or share this test dataset.');
  });

  test('2. Renders all 4 preset record count options including 1,000 scalability goal', () => {
    const markup = renderToStaticMarkup(React.createElement(DevDataSeederCard));

    expect(markup).toContain('500 Records');
    expect(markup).toContain('1,000 Records');
    expect(markup).toContain('2,500 Records');
    expect(markup).toContain('5,000 Records');
    expect(markup).toContain('Browser scalability goal');
  });

  test('3. Renders purge previous test records toggle and actions', () => {
    const markup = renderToStaticMarkup(React.createElement(DevDataSeederCard));

    expect(markup).toContain('Purge previous test records before seeding');
    expect(markup).toContain('Seed 1,000 Records for this Clinic');
    expect(markup).toContain('Purge Clinic Test Data');
    expect(markup).toContain('Open Patient Registry');
  });

  test('4. Exposes clinicService methods for clinic-exclusive seeding and clearing', () => {
    expect(typeof clinicService.seedClinicData).toBe('function');
    expect(typeof clinicService.getClinicSeedStatus).toBe('function');
    expect(typeof clinicService.clearClinicSeedData).toBe('function');
  });

  test('5. clearClinicSeedData supports both string clinicId and object options with purgeAll', async () => {
    let capturedUrl = '';
    let capturedConfig: any = null;
    const originalDelete = clinicApiClient.delete;
    (clinicApiClient as any).delete = async (url: string, config?: any) => {
      capturedUrl = url;
      capturedConfig = config;
      return [{ clearedCount: 5, clinicId: 'test-clinic-id' }, null];
    };

    try {
      await clinicService.clearClinicSeedData('test-clinic-id');
      expect(capturedUrl).toContain('clinicId=test-clinic-id');
      expect(capturedConfig?.timeout).toBe(300_000);

      await clinicService.clearClinicSeedData({ clinicId: 'test-clinic-id', purgeAll: true });
      expect(capturedUrl).toContain('clinicId=test-clinic-id');
      expect(capturedUrl).toContain('purgeAll=true');
      expect(capturedConfig?.timeout).toBe(300_000);
    } finally {
      (clinicApiClient as any).delete = originalDelete;
    }
  });
});
