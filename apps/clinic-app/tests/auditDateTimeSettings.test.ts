// token-guard:ignore-file
/**
 * Test Suite: Audit Logs Timestamp Display - Clinic Setting Configuration
 * 
 * Verifies that the audit logs workstation (AuditTableRow, AuditTable, AuditInspectionDrawer)
 * strictly respects the active clinic regional configuration:
 *  - Date format (MMM d, yyyy | d MMM yyyy | dd/MM/yyyy | MM/dd/yyyy | yyyy-MM-dd)
 *  - Time format (12h AM/PM | 24h military)
 *  - Time zone (Asia/Manila | UTC | America/New_York | etc.)
 *  - Timezone day-boundary rollover handling
 *  - Defensive fallback for invalid/missing dates
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. React Native Mocking for Headless Bun Environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { onClick: onPress } : {}),
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
  RefreshControl: createMockComponent('RefreshControl'),
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
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
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

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: true,
  }),
}));

import type { ClinicAuditEntryDto } from '../services/clinicService';

const { AuditTableRow, AuditCard, formatTimestamp } = await import('../components/audit/AuditTableRow');
const { AuditTable } = await import('../components/audit/AuditTable');
const { AuditInspectionDrawer } = await import('../components/audit/AuditInspectionDrawer');
const { setClinicRegionalConfig } = await import('../services/clinicService');

const SAMPLE_ENTRY: ClinicAuditEntryDto = {
  id: 'audit-test-001',
  timestamp: '2026-10-17T04:30:00Z', // 12:30 PM in Asia/Manila (UTC+8)
  category: 'Clinical',
  severity: 'Routine',
  action: 'clinical.consultation.signed',
  actorName: 'Dr. Maria Santos',
  actorRole: 'Doctor',
  actorStaffId: 'staff-dr-santos',
  targetEntityType: 'ConsultationEncounter',
  targetEntityId: 'enc-20261017-001',
  patientId: 'pat-juan-01',
  patientNameMasked: 'J*** D*** C***',
  patientPinMasked: '12-****5678-9',
  outcome: 'Success',
  description: 'Consultation encounter signed and locked',
  clientIpAddress: '192.168.1.104',
  userAgent: 'ClinicEZ-Workstation/1.0',
  clinicId: 'clinic-branch-01',
  tenantId: 'tenant-main',
  metadataJson: '{"notes":"Prescribed amoxicillin"}',
};

const LATE_NIGHT_ENTRY: ClinicAuditEntryDto = {
  ...SAMPLE_ENTRY,
  id: 'audit-test-002',
  timestamp: '2026-10-17T18:30:00Z', // In Manila (UTC+8), this is 02:30 AM on Oct 18!
};

describe('Audit Logs Timestamp Display - Clinic Setting Configuration', () => {
  beforeEach(() => {
    delete (globalThis as any).__mockClinicContext;
    setClinicRegionalConfig({
      dateFormat: 'MMM d, yyyy',
      timeFormat: '12h',
      timeZoneId: 'Asia/Manila',
    });
  });

  afterEach(() => {
    delete (globalThis as any).__mockClinicContext;
    setClinicRegionalConfig({
      dateFormat: 'MMM d, yyyy',
      timeFormat: '12h',
      timeZoneId: 'Asia/Manila',
    });
  });

  describe('1. AuditTableRow Respects Clinic Configuration', () => {
    test('1.1 Default configuration formats timestamp in Asia/Manila 12-hour format', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
        })
      );

      // In Asia/Manila (UTC+8), 04:30:00Z is 12:30 PM
      expect(markup).toContain('Oct 17, 2026, 12:30 PM');
    });

    test('1.2 Custom date format dd/MM/yyyy with 24-hour military time', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
          dateFormat: 'dd/MM/yyyy',
          timeFormat: '24h',
        })
      );

      expect(markup).toContain('17/10/2026, 12:30');
    });

    test('1.3 Custom date format yyyy-MM-dd with 24-hour time in UTC', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
          dateFormat: 'yyyy-MM-dd',
          timeFormat: '24h',
          timeZoneId: 'UTC',
        })
      );

      // In UTC, 04:30:00Z is 04:30
      expect(markup).toContain('2026-10-17, 04:30');
    });

    test('1.4 Custom date format d MMM yyyy with 12-hour AM/PM time', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
          dateFormat: 'd MMM yyyy',
          timeFormat: '12h',
        })
      );

      expect(markup).toContain('17 Oct 2026, 12:30 PM');
    });

    test('1.5 Custom date format MM/dd/yyyy with 12-hour AM/PM time in America/New_York', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
          dateFormat: 'MM/dd/yyyy',
          timeFormat: '12h',
          timeZoneId: 'America/New_York',
        })
      );

      // 04:30Z is 00:30 (12:30 AM) EDT (UTC-4) in New York
      expect(markup).toContain('10/17/2026, 12:30 AM');
    });

    test('1.6 Day-shifting across midnight boundary: UTC late evening becomes next day in Manila', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: LATE_NIGHT_ENTRY,
          onInspect: () => {},
          timeZoneId: 'Asia/Manila',
        })
      );

      // 18:30Z on Oct 17 + 8 hours = 02:30 AM on Oct 18 in Manila
      expect(markup).toContain('Oct 18, 2026, 02:30 AM');
    });

    test('1.7 Card mode (mobile view) also respects clinic timestamp configuration', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditCard, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
          dateFormat: 'dd/MM/yyyy',
          timeFormat: '24h',
        })
      );

      expect(markup).toContain('17/10/2026, 12:30');
    });

    test('1.8 Unparseable / corrupt timestamp gracefully renders fallback without throwing', () => {
      const corruptEntry: ClinicAuditEntryDto = {
        ...SAMPLE_ENTRY,
        timestamp: 'corrupt-timestamp-string',
      };

      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: corruptEntry,
          onInspect: () => {},
        })
      );

      expect(markup).toContain('corrupt-timestamp-string');
    });
  });

  describe('2. AuditTable Propagates Clinic Regional Settings to Rows', () => {
    test('2.1 AuditTable forwards regional configuration props to all rendered rows', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: [SAMPLE_ENTRY, LATE_NIGHT_ENTRY],
          loading: false,
          totalCount: 2,
          pageNumber: 1,
          onInspect: () => {},
          onResetFilters: () => {},
          dateFormat: 'yyyy-MM-dd',
          timeFormat: '24h',
          timeZoneId: 'UTC',
        })
      );

      // In UTC 24h yyyy-MM-dd:
      expect(markup).toContain('2026-10-17, 04:30');
      expect(markup).toContain('2026-10-17, 18:30');
    });

    test('2.2 AuditTable consumes global clinic settings when props omitted', () => {
      setClinicRegionalConfig({
        dateFormat: 'dd/MM/yyyy',
        timeFormat: '24h',
        timeZoneId: 'Asia/Manila',
      });

      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: [SAMPLE_ENTRY],
          loading: false,
          totalCount: 1,
          pageNumber: 1,
          onInspect: () => {},
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('17/10/2026, 12:30');
    });
  });

  describe('3. AuditInspectionDrawer Displays Formatted Clinic Timestamp', () => {
    test('3.1 Drawer displays Clinic Timestamp alongside UTC Timestamp', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: SAMPLE_ENTRY,
          detail: null,
          loadingDetail: false,
          onClose: () => {},
          dateFormat: 'MMM d, yyyy',
          timeFormat: '12h',
          timeZoneId: 'Asia/Manila',
        })
      );

      // Both UTC forensic timestamp and formatted Clinic Timestamp are present
      expect(markup).toContain('UTC Timestamp');
      expect(markup).toContain('2026-10-17T04:30:00Z');
      expect(markup).toContain('Clinic Timestamp');
      expect(markup).toContain('Oct 17, 2026, 12:30 PM');
    });

    test('3.2 Drawer updates Clinic Timestamp when clinic configuration changes', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: SAMPLE_ENTRY,
          detail: null,
          loadingDetail: false,
          onClose: () => {},
          dateFormat: 'dd/MM/yyyy',
          timeFormat: '24h',
          timeZoneId: 'UTC',
        })
      );

      expect(markup).toContain('Clinic Timestamp');
      expect(markup).toContain('17/10/2026, 04:30');
    });
  });

  describe('4. formatTimestamp Export Helper', () => {
    test('4.1 formatTimestamp respects passed options', () => {
      const formatted = formatTimestamp('2026-10-17T04:30:00Z', {
        dateFormat: 'dd/MM/yyyy',
        timeFormat: '24h',
        timeZoneId: 'Asia/Manila',
      });
      expect(formatted).toBe('17/10/2026, 12:30');
    });

    test('4.2 formatTimestamp respects active clinic configuration when options omitted', () => {
      setClinicRegionalConfig({
        dateFormat: 'MMM d, yyyy',
        timeFormat: '12h',
        timeZoneId: 'Asia/Manila',
      });
      const formatted = formatTimestamp('2026-10-17T04:30:00Z');
      expect(formatted).toBe('Oct 17, 2026, 12:30 PM');
    });
  });

  describe('5. Context-Driven Dynamic Updates via useClinic()', () => {
    test('5.1 AuditTableRow reacts dynamically when ClinicContext overrides change', () => {
      (globalThis as any).__mockClinicContext = {
        dateFormat: 'yyyy-MM-dd',
        timeFormat: '24h',
        timeZoneId: 'Asia/Manila',
      };

      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: SAMPLE_ENTRY,
          onInspect: () => {},
        })
      );

      expect(markup).toContain('2026-10-17, 12:30');
    });
  });
});
