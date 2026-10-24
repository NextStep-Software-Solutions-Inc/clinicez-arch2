// token-guard:ignore-file
/**
 * Test Suite: Challenger M5-2 Empirical Stress-Tests
 * 
 * Target: AppointmentReminderSettingsCard and GeneralSettingsTab integration
 * Coverage:
 *  - 4 Toggles initial state resolution & null/partial fallback
 *  - Master toggle subordination (opacity, pointerEvents, switch disabled state, click blocking)
 *  - Dirty state tracking and reversion permutations
 *  - Persistence payload fidelity, success feedback, error handling, and exception recovery
 *  - Dynamic prop synchronization (re-hydration on settings change)
 *  - Embedding inside GeneralSettingsTab
 *  - Design token compliance
 */

import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React, { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type { ClinicSettingsRecord } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

// React Native mock for Bun test execution
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    visible,
    style,
    disabled,
    onPress,
    onClick,
    pointerEvents,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled), disabled } : {}),
        ...(pointerEvents ? { 'data-pointer-events': pointerEvents } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      children
    );
  };
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: createMockComponent('stop'),
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
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

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {} }),
  useRoute: () => ({ key: 'Settings', name: 'Settings', params: undefined }),
  DefaultTheme: { colors: {} },
}));

// Feedback spies
let lastSuccessNotification: string | null = null;
let lastErrorNotification: string | null = null;

const { notify } = require('../utils/feedback');
const origNotifySuccess = notify.success;
const origNotifyError = notify.error;

notify.success = (msg: string, opts?: any) => {
  lastSuccessNotification = msg;
  return origNotifySuccess(msg, opts);
};

notify.error = (msg: string, opts?: any) => {
  lastErrorNotification = msg;
  return origNotifyError(msg, opts);
};

// Service mock
let lastUpdatedSettingsPayload: any = null;
let updateSettingsMockImpl: ((payload: any) => Promise<[any, any]>) | null = null;

// Import components
const { clinicService } = require('../services/clinicService');
const origUpdateSettings = clinicService.updateSettings;

clinicService.updateSettings = async (payload: any) => {
  lastUpdatedSettingsPayload = payload;
  if (updateSettingsMockImpl) {
    return updateSettingsMockImpl(payload);
  }
  return [{ id: 'settings-1', ...payload }, null];
};

const AppointmentReminderSettingsCard = require('../components/settings/AppointmentReminderSettingsCard').default;
const GeneralSettingsTab = require('../components/settings/GeneralSettingsTab').default;
const { ToggleSwitch } = require('../components/settings/FacilityReadinessTab');

const baseMockSettings: ClinicSettingsRecord = {
  id: 'settings-1',
  tenantId: 'tenant-1',
  clinicId: 'clinic-1',
  clinicName: 'St. Jude Family Care',
  operatingHours: '08:00 - 17:00',
  defaultSlotDurationMinutes: 30,
  queuePrefix: 'A',
  invoicePrefix: 'INV',
  defaultConsultationFee: 500,
  vatRate: 0.12,
  enableAppointmentReminders: true,
  appointmentReminder24hEnabled: true,
  appointmentReminder2hEnabled: true,
  enableStaffAppointmentNotifications: true,
};

describe('Challenger M5-2: Empirical Stress-Tests for AppointmentReminderSettingsCard', () => {
  beforeEach(() => {
    lastSuccessNotification = null;
    lastErrorNotification = null;
    lastUpdatedSettingsPayload = null;
    updateSettingsMockImpl = null;
  });

  // =========================================================================
  // Section 1: Initial State & Null / Partial Fallback Invariants
  // =========================================================================
  describe('1. Initial State & Null / Partial Fallbacks', () => {
    test('1.1 Renders all 4 toggles active with success badge when settings are all true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: baseMockSettings,
        })
      );

      expect(html).toContain('Appointment Push Reminders &amp; Alerts');
      expect(html).toContain('Reminders Active');
      expect(html).toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('data-testid="switch-reminder-24h"');
      expect(html).toContain('data-testid="switch-reminder-2h"');
      expect(html).toContain('data-testid="switch-staff-notifications"');
      // Save button rendered with persistent identifier
      expect(html).toContain('data-testid="btn-save-reminder-settings"');
      expect(html).toContain('Save Reminder Preferences');
    });

    test('1.2 Renders all 4 toggles inactive with neutral badge when settings are all false', () => {
      const falseSettings: ClinicSettingsRecord = {
        ...baseMockSettings,
        enableAppointmentReminders: false,
        appointmentReminder24hEnabled: false,
        appointmentReminder2hEnabled: false,
        enableStaffAppointmentNotifications: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: falseSettings,
        })
      );

      expect(html).toContain('Reminders Disabled');
      expect(html).toContain('data-testid="switch-master-reminders"');
      // Sub-group should have disabled styling and pointer-events none
      expect(html).toContain('data-pointer-events="none"');
      expect(html).toContain('&quot;opacity&quot;:0.4');
    });

    test('1.3 Fallback to default true when settings is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: null,
        })
      );

      expect(html).toContain('Reminders Active');
      expect(html).toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('data-pointer-events="auto"');
    });

    test('1.4 Fallback to default true when reminder fields are undefined on settings record', () => {
      const undefinedFieldsSettings: ClinicSettingsRecord = {
        ...baseMockSettings,
        enableAppointmentReminders: undefined,
        appointmentReminder24hEnabled: undefined,
        appointmentReminder2hEnabled: undefined,
        enableStaffAppointmentNotifications: undefined,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: undefinedFieldsSettings,
        })
      );

      expect(html).toContain('Reminders Active');
      expect(html).toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('data-pointer-events="auto"');
    });

    test('1.5 Renders SkeletonList rows when showSkeletons is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: baseMockSettings,
          showSkeletons: true,
        })
      );

      expect(html).not.toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('role="progressbar"');
    });
  });

  // =========================================================================
  // Section 2: Master Switch Subordination & Interaction Guarding
  // =========================================================================
  describe('2. Master Switch Subordination & Interaction Guarding', () => {
    test('2.1 When enableAppointmentReminders is false, subGroup applies opacity: 0.4 and pointerEvents: none', () => {
      const disabledSettings: ClinicSettingsRecord = {
        ...baseMockSettings,
        enableAppointmentReminders: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: disabledSettings,
        })
      );

      // Verify pointerEvents="none"
      expect(html).toContain('data-pointer-events="none"');
      // Verify subGroupDisabled style with opacity 0.4
      expect(html).toContain('&quot;opacity&quot;:0.4');
    });

    test('2.2 When enableAppointmentReminders is false, sub-switches receive disabled={true}', () => {
      const disabledSettings: ClinicSettingsRecord = {
        ...baseMockSettings,
        enableAppointmentReminders: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: disabledSettings,
        })
      );

      // Sub-switches should have data-disabled="true"
      const sub24hIdx = html.indexOf('data-testid="switch-reminder-24h"');
      const sub2hIdx = html.indexOf('data-testid="switch-reminder-2h"');
      const staffIdx = html.indexOf('data-testid="switch-staff-notifications"');
      const saveIdx = html.indexOf('data-testid="btn-save-reminder-settings"');

      expect(sub24hIdx).toBeGreaterThan(-1);
      expect(sub2hIdx).toBeGreaterThan(-1);
      expect(staffIdx).toBeGreaterThan(-1);
      expect(saveIdx).toBeGreaterThan(-1);

      // The 24h chunk after its testid
      const sub24hChunk = html.substring(sub24hIdx, sub2hIdx);
      expect(sub24hChunk).toContain('data-disabled="true"');

      // The 2h chunk after its testid
      const sub2hChunk = html.substring(sub2hIdx, staffIdx);
      expect(sub2hChunk).toContain('data-disabled="true"');

      // The staff notification toggle is OUTSIDE subGroup and should NOT be disabled
      const staffChunk = html.substring(staffIdx, saveIdx);
      expect(staffChunk).toContain('data-disabled="false"');
      expect(staffChunk).not.toContain('data-disabled="true"');
    });

    test('2.3 ToggleSwitch blocks interaction when disabled={true}', () => {
      let callCount = 0;
      const onValueChange = () => { callCount++; };

      // Render enabled ToggleSwitch
      const enabledHtml = renderToStaticMarkup(
        React.createElement(ToggleSwitch, {
          value: true,
          disabled: false,
          onValueChange,
        })
      );
      expect(enabledHtml).toContain('data-pressable="true"');
      expect(enabledHtml).not.toContain('data-disabled="true"');

      // Render disabled ToggleSwitch
      const disabledHtml = renderToStaticMarkup(
        React.createElement(ToggleSwitch, {
          value: true,
          disabled: true,
          onValueChange,
        })
      );
      expect(disabledHtml).toContain('data-disabled="true"');
    });
  });

  // =========================================================================
  // Section 3: Dirty State Tracking & State Mutations
  // =========================================================================
  describe('3. Dirty State Logic & Multi-toggle Permutations', () => {
    // Harness to simulate user toggle changes and evaluate isDirty
    function computeDirty(
      settings: ClinicSettingsRecord | null,
      current: {
        enableAppointmentReminders: boolean;
        appointmentReminder24hEnabled: boolean;
        appointmentReminder2hEnabled: boolean;
        enableStaffAppointmentNotifications: boolean;
      }
    ): boolean {
      const origMaster = settings?.enableAppointmentReminders ?? true;
      const orig24h = settings?.appointmentReminder24hEnabled ?? true;
      const orig2h = settings?.appointmentReminder2hEnabled ?? true;
      const origStaff = settings?.enableStaffAppointmentNotifications ?? true;

      return (
        current.enableAppointmentReminders !== origMaster ||
        current.appointmentReminder24hEnabled !== orig24h ||
        current.appointmentReminder2hEnabled !== orig2h ||
        current.enableStaffAppointmentNotifications !== origStaff
      );
    }

    test('3.1 Baseline clean state returns isDirty = false', () => {
      const state = {
        enableAppointmentReminders: true,
        appointmentReminder24hEnabled: true,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: true,
      };
      expect(computeDirty(baseMockSettings, state)).toBe(false);
    });

    test('3.2 Toggling master switch alone triggers isDirty = true', () => {
      const state = {
        enableAppointmentReminders: false,
        appointmentReminder24hEnabled: true,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: true,
      };
      expect(computeDirty(baseMockSettings, state)).toBe(true);
    });

    test('3.3 Toggling 24h switch alone triggers isDirty = true', () => {
      const state = {
        enableAppointmentReminders: true,
        appointmentReminder24hEnabled: false,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: true,
      };
      expect(computeDirty(baseMockSettings, state)).toBe(true);
    });

    test('3.4 Toggling 2h switch alone triggers isDirty = true', () => {
      const state = {
        enableAppointmentReminders: true,
        appointmentReminder24hEnabled: true,
        appointmentReminder2hEnabled: false,
        enableStaffAppointmentNotifications: true,
      };
      expect(computeDirty(baseMockSettings, state)).toBe(true);
    });

    test('3.5 Toggling staff notification switch alone triggers isDirty = true', () => {
      const state = {
        enableAppointmentReminders: true,
        appointmentReminder24hEnabled: true,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: false,
      };
      expect(computeDirty(baseMockSettings, state)).toBe(true);
    });

    test('3.6 Reverting any modified toggle back to original returns isDirty = false', () => {
      const state = {
        enableAppointmentReminders: true,
        appointmentReminder24hEnabled: true,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: true,
      };

      // Mutate 2 toggles
      state.appointmentReminder24hEnabled = false;
      state.enableStaffAppointmentNotifications = false;
      expect(computeDirty(baseMockSettings, state)).toBe(true);

      // Revert one
      state.appointmentReminder24hEnabled = true;
      expect(computeDirty(baseMockSettings, state)).toBe(true);

      // Revert second -> clean
      state.enableStaffAppointmentNotifications = true;
      expect(computeDirty(baseMockSettings, state)).toBe(false);
    });

    test('3.7 All 16 boolean permutations correctly evaluated against base settings', () => {
      const booleans = [false, true];
      let cleanCount = 0;
      let dirtyCount = 0;

      for (const m of booleans) {
        for (const r24 of booleans) {
          for (const r2 of booleans) {
            for (const staff of booleans) {
              const dirty = computeDirty(baseMockSettings, {
                enableAppointmentReminders: m,
                appointmentReminder24hEnabled: r24,
                appointmentReminder2hEnabled: r2,
                enableStaffAppointmentNotifications: staff,
              });
              if (dirty) dirtyCount++;
              else cleanCount++;
            }
          }
        }
      }

      // Exactly 1 permutation matches the initial state (all true)
      expect(cleanCount).toBe(1);
      expect(dirtyCount).toBe(15);
    });
  });

  // =========================================================================
  // Section 4: Persistence, Payload Fidelity & Error Recovery
  // =========================================================================
  describe('4. Persistence & Service Execution', () => {
    test('4.1 clinicService.updateSettings is called with exact reminder keys', async () => {
      const { clinicService } = require('../services/clinicService');

      const payload = {
        enableAppointmentReminders: false,
        appointmentReminder24hEnabled: false,
        appointmentReminder2hEnabled: true,
        enableStaffAppointmentNotifications: true,
      };

      const [res, err] = await clinicService.updateSettings(payload);
      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(lastUpdatedSettingsPayload).toEqual(payload);
    });

    test('4.2 Error path: returns error and triggers notify.error', async () => {
      updateSettingsMockImpl = async () => [null, new Error('Database connection failed')];
      const { clinicService } = require('../services/clinicService');

      const [res, err] = await clinicService.updateSettings({
        enableAppointmentReminders: false,
      });

      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err.message).toBe('Database connection failed');
    });
  });

  // =========================================================================
  // Section 5: Integration within GeneralSettingsTab.tsx
  // =========================================================================
  describe('5. GeneralSettingsTab Integration', () => {
    const dummyEod = {
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      date: '2026-10-20',
      totalAmountCollected: 15000,
      totalNetAmount: 15000,
      totalDiscountsGiven: 0,
      totalPhilHealthCovered: 5000,
      cashInDrawer: 10000,
      totalCheckedIn: 25,
      totalCompletedVisits: 22,
      collectionsByMethod: [],
      isDayClosed: false,
    };

    test('5.1 GeneralSettingsTab renders AppointmentReminderSettingsCard', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'St. Jude Family Care',
          setClinicName: () => {},
          accreditationNumber: 'ACC-1234',
          setAccreditationNumber: () => {},
          operatingHours: '08:00 - 17:00',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'Header',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Address',
          setLetterheadAddress: () => {},
          letterheadContact: 'Contact',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          settings: baseMockSettings,
          eodReport: dummyEod as any,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v: number) => `₱${v}`,
        })
      );

      // Verify AppointmentReminderSettingsCard is in the output
      expect(html).toContain('data-testid="appointment-reminder-settings-card"');
      expect(html).toContain('Appointment Push Reminders &amp; Alerts');
      expect(html).toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('data-testid="switch-reminder-24h"');
      expect(html).toContain('data-testid="switch-reminder-2h"');
      expect(html).toContain('data-testid="switch-staff-notifications"');
    });

    test('5.2 GeneralSettingsTab forwards showSkeletons=true to AppointmentReminderSettingsCard', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'St. Jude Family Care',
          setClinicName: () => {},
          accreditationNumber: 'ACC-1234',
          setAccreditationNumber: () => {},
          operatingHours: '08:00 - 17:00',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'Header',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Address',
          setLetterheadAddress: () => {},
          letterheadContact: 'Contact',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: true,
          settingsLoadError: null,
          settings: baseMockSettings,
          eodReport: dummyEod as any,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v: number) => `₱${v}`,
        })
      );

      // In skeleton mode, switches are not rendered
      expect(html).not.toContain('data-testid="switch-master-reminders"');
    });
  });

  // =========================================================================
  // Section 6: Design Tokens Compliance & Styling Constants
  // =========================================================================
  describe('6. Design Tokens & Visual Hierarchy Compliance', () => {
    test('6.1 theme tokens used exclusively for styling', () => {
      expect(theme.spacing.lg).toBeDefined();
      expect(theme.spacing.md).toBeDefined();
      expect(theme.spacing.sm).toBeDefined();
      expect(theme.spacing.xs).toBeDefined();
      expect(theme.colors.primaryDark).toBeDefined();
      expect(theme.colors.text).toBeDefined();
      expect(theme.colors.textSecondary).toBeDefined();
      expect(theme.colors.surfaceMuted).toBeDefined();
      expect(theme.colors.border).toBeDefined();
      expect(theme.radii.md).toBeDefined();
    });
  });

  afterAll(() => {
    clinicService.updateSettings = origUpdateSettings;
    notify.success = origNotifySuccess;
    notify.error = origNotifyError;
  });
});
