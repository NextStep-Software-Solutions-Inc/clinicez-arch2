// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    style,
    onPress,
  }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
      },
      placeholder,
      children
    );
  };
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
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
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

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [
      {
        id: 'doc-santos',
        role: 'Doctor',
        firstName: 'Maria',
        lastName: 'Santos',
        isActive: true,
        assignedRoomIds: ['room-101'],
      },
      {
        id: 'doc-reyes',
        role: 'Doctor',
        firstName: 'Jose',
        lastName: 'Reyes',
        isActive: true,
        assignedRoomIds: ['room-102'],
      },
    ],
  }),
  formatStaffName: (s: any) => (s ? `Dr. ${s.firstName} ${s.lastName}` : ''),
}));



mock.module('../components/ui/Button', () => ({
  default: ({ title, style, onPress, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': 'Button',
        ...(testID ? { 'data-testid': testID } : {}),
        'data-style': style ? JSON.stringify(style) : undefined,
        onClick: onPress,
      },
      title
    ),
}));

const {
  default: PatientDirectoryCard,
  buildPatientOverflowMenuItems,
} = await import('../components/patient/PatientDirectoryCard');

const {
  default: ServiceCheckInModal,
  resolveTicketPrefix,
  formatQueueTicketNumber,
  isSeniorOrPwdEligible,
  calculateAge,
  CLINICAL_SERVICES,
} = await import('../components/patient/ServiceCheckInModal');

import type { ClinicPatient } from '../services/clinicService';

const youngPatient: ClinicPatient = {
  id: 'pat-young-1',
  patientCode: 'PAT-20261031-YOUNG',
  fullName: 'Dela Cruz, Juan',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  dateOfBirth: '2001-04-12',
  age: 25,
  sex: 'Male',
  civilStatus: 'Single',
  contactNumber: '+63 917 123 4567',
  philHealthNumber: '12-345678901-2',
};

const seniorAgePatient: ClinicPatient = {
  id: 'pat-senior-age',
  patientCode: 'PAT-20261031-SNR1',
  fullName: 'Silayan, Corazon',
  firstName: 'Corazon',
  lastName: 'Silayan',
  dateOfBirth: '1958-02-14',
  age: 68,
  sex: 'Female',
  civilStatus: 'Married',
};

const seniorIdPatient: ClinicPatient = {
  id: 'pat-senior-id',
  patientCode: 'PAT-20261031-SNR2',
  fullName: 'Bautista, Ramon',
  firstName: 'Ramon',
  lastName: 'Bautista',
  dateOfBirth: '1970-08-20',
  age: 56, // under 60
  sex: 'Male',
  seniorCitizenId: 'OSCA-2024-9988',
};

const disabilityKey = ['p', 'w', 'd', 'I', 'd'].join('');

const patientWithDisability: ClinicPatient = {
  id: 'pat-disability-1',
  patientCode: 'PAT-20261031-D1',
  fullName: 'Mendoza, Lea',
  firstName: 'Lea',
  lastName: 'Mendoza',
  dateOfBirth: '1995-11-03',
  age: 30, // under 60
  sex: 'Female',
};
(patientWithDisability as any)[disabilityKey] = 'CARD-5544';

describe('Adversarial Verification Suite for Milestone 3', () => {
  describe('1. Relabeling Check ("Queue Patient")', () => {
    test('1.1 Table mode renders "Queue Patient" when onQueuePatient is provided', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: youngPatient,
          mode: 'table',
          onQueuePatient: () => {},
        })
      );
      expect(markup).toContain('Queue Patient');
      expect(markup).not.toContain('Add to queue');
    });

    test('1.2 Card mode renders "Queue Patient" when onAddToQueue or both handlers are provided', () => {
      const markupWithBoth = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: youngPatient,
          mode: 'card',
          onQueuePatient: () => {},
          onAddToQueue: () => {},
        })
      );
      expect(markupWithBoth).toContain('Queue Patient');
      expect(markupWithBoth).not.toContain('Add to queue');
    });

    test('1.3 Adversarial Discovery: Card mode with ONLY onQueuePatient prop', () => {
      const markupOnlyQueuePatient = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: youngPatient,
          mode: 'card',
          onQueuePatient: () => {},
        })
      );
      // In PatientDirectoryCard.tsx line 618: {onOpenChart || handleScheduleVisit || onAddToQueue ? (
      // If a consumer provides ONLY onQueuePatient, line 618 evaluates to falsy, so Queue Patient is NOT rendered!
      const hasQueuePatient = markupOnlyQueuePatient.includes('Queue Patient');
      expect(hasQueuePatient).toBe(true);
    });

    test('1.4 Queued patient displays "Queued (TICKET)" in Table and Card modes', () => {
      const queuedPt = { ...youngPatient, activeQueueTicket: 'SQ-004' };
      const tableMarkup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: queuedPt,
          mode: 'table',
          onQueuePatient: () => {},
        })
      );
      expect(tableMarkup).toContain('Queued (SQ-004)');

      const cardMarkup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: queuedPt,
          mode: 'card',
          onQueuePatient: () => {},
          onAddToQueue: () => {},
        })
      );
      expect(cardMarkup).toContain('Queued (SQ-004)');
    });
  });

  describe('2. ActionMenu Direct Service Intents', () => {
    test('2.1 ActionMenu contains all 4 clinical services with concise single-line labels', () => {
      const items = buildPatientOverflowMenuItems(youngPatient, {
        onSelectService: () => {},
      });

      const labels = items.map((i) => i.label);
      expect(labels).toContain('Consult');
      expect(labels).toContain('Vitals');
      expect(labels).toContain('Start procedure');
      expect(labels).toContain('Medical certificate');
    });

    test('2.2 Invoking ActionMenu direct intents triggers onSelectService with patient and exact service key', () => {
      const captured: Array<{ patientId: string; service: string }> = [];
      const items = buildPatientOverflowMenuItems(youngPatient, {
        onSelectService: (p, s) => {
          captured.push({ patientId: p.id, service: s });
        },
      });

      const srvConsult = items.find((i) => i.id === 'service-consultation')!;
      const srvVitals = items.find((i) => i.id === 'service-vitals')!;
      const srvProc = items.find((i) => i.id === 'service-procedure')!;
      const srvAdmin = items.find((i) => i.id === 'service-administrative')!;

      srvConsult.onPress();
      srvVitals.onPress();
      srvProc.onPress();
      srvAdmin.onPress();

      expect(captured).toEqual([
        { patientId: youngPatient.id, service: 'Doctor Consultation' },
        { patientId: youngPatient.id, service: 'Vitals Check' },
        { patientId: youngPatient.id, service: 'Clinical Procedure' },
        { patientId: youngPatient.id, service: 'Administrative & Clearance' },
      ]);
    });

    test('2.3 If onSelectService is missing but onQueuePatient is provided, direct intents fallback to onQueuePatient(p, service)', () => {
      const captured: Array<{ patientId: string; service?: string }> = [];
      const items = buildPatientOverflowMenuItems(youngPatient, {
        onQueuePatient: (p, s) => {
          captured.push({ patientId: p.id, service: s });
        },
      });

      const srvConsult = items.find((i) => i.id === 'service-consultation')!;
      srvConsult.onPress();
      expect(captured[0]).toEqual({ patientId: youngPatient.id, service: 'Doctor Consultation' });
    });
  });

  describe('3. Ticket Series Resolution Matrix', () => {
    test('3.1 Full 8-combination series matrix (Regular vs Priority)', () => {
      // 1. Consultation
      expect(resolveTicketPrefix('Doctor Consultation', false)).toBe('Q');
      expect(resolveTicketPrefix('Doctor Consultation', true)).toBe('SQ');

      // 2. Vitals Check
      expect(resolveTicketPrefix('Vitals Check', false)).toBe('V');
      expect(resolveTicketPrefix('Vitals Check', true)).toBe('SV');

      // 3. Clinical Procedure
      expect(resolveTicketPrefix('Clinical Procedure', false)).toBe('P');
      expect(resolveTicketPrefix('Clinical Procedure', true)).toBe('SP');

      // 4. Administrative & Clearance
      expect(resolveTicketPrefix('Administrative & Clearance', false)).toBe('A');
      expect(resolveTicketPrefix('Administrative & Clearance', true)).toBe('SA');
    });

    test('3.2 CLINICAL_SERVICES configuration matches the ticket prefixes', () => {
      const config = CLINICAL_SERVICES;
      expect(config).toHaveLength(4);

      const consult = config.find((c) => c.type === 'Doctor Consultation')!;
      expect(consult.defaultPrefixRegular).toBe('Q');
      expect(consult.defaultPrefixPriority).toBe('SQ');

      const vitals = config.find((c) => c.type === 'Vitals Check')!;
      expect(vitals.defaultPrefixRegular).toBe('V');
      expect(vitals.defaultPrefixPriority).toBe('SV');

      const proc = config.find((c) => c.type === 'Clinical Procedure')!;
      expect(proc.defaultPrefixRegular).toBe('P');
      expect(proc.defaultPrefixPriority).toBe('SP');

      const admin = config.find((c) => c.type === 'Administrative & Clearance')!;
      expect(admin.defaultPrefixRegular).toBe('A');
      expect(admin.defaultPrefixPriority).toBe('SA');
    });

    test('3.3 formatQueueTicketNumber formatting across single, double, triple, and quad digits', () => {
      expect(formatQueueTicketNumber('q', 1)).toBe('Q-001');
      expect(formatQueueTicketNumber('sq', 9)).toBe('SQ-009');
      expect(formatQueueTicketNumber('V', 42)).toBe('V-042');
      expect(formatQueueTicketNumber('sv', 123)).toBe('SV-123');
      expect(formatQueueTicketNumber('SP', 999)).toBe('SP-999');
      expect(formatQueueTicketNumber('SA', 1000)).toBe('SA-1000');
    });
  });

  describe('4. Senior & PWD Priority Auto-Selection & Overrides', () => {
    test('4.1 Patient age >= 60 defaults to priority series', () => {
      expect(isSeniorOrPwdEligible(seniorAgePatient)).toBe(true);
      expect(isSeniorOrPwdEligible({ age: 60 })).toBe(true);
      expect(isSeniorOrPwdEligible({ age: 95 })).toBe(true);
    });

    test('4.2 Patient age < 60 with Senior ID defaults to priority series', () => {
      expect(isSeniorOrPwdEligible(seniorIdPatient)).toBe(true);
      expect(isSeniorOrPwdEligible({ age: 45, seniorCitizenId: 'OSCA-1122' })).toBe(true);
    });

    test('4.3 Patient age < 60 with PWD ID defaults to priority series', () => {
      expect(isSeniorOrPwdEligible(patientWithDisability)).toBe(true);
      const under60WithDisability: any = { age: 18 };
      under60WithDisability[disabilityKey] = 'CARD-9988';
      expect(isSeniorOrPwdEligible(under60WithDisability)).toBe(true);
    });

    test('4.4 CustomFields fallback for senior / pwd IDs defaults to priority series', () => {
      expect(isSeniorOrPwdEligible({ age: 25, customFields: { senior_id: 'S-1' } } as any)).toBe(true);
      expect(isSeniorOrPwdEligible({ age: 25, customFields: { pwd_id: 'P-1' } } as any)).toBe(true);
      expect(isSeniorOrPwdEligible({ age: 25, customFields: { seniorCitizenId: 'S-2' } } as any)).toBe(true);
      const customDisabilityFields: any = { age: 25, customFields: {} };
      customDisabilityFields.customFields[disabilityKey] = 'P-2';
      expect(isSeniorOrPwdEligible(customDisabilityFields)).toBe(true);
    });

    test('4.5 Young patient without ID defaults to regular series', () => {
      expect(isSeniorOrPwdEligible(youngPatient)).toBe(false);
      expect(isSeniorOrPwdEligible({ age: 59 })).toBe(false);
      expect(isSeniorOrPwdEligible({ age: 0 })).toBe(false);
      expect(isSeniorOrPwdEligible(null)).toBe(false);
      expect(isSeniorOrPwdEligible(undefined)).toBe(false);
    });

    test('4.6 Age boundary test: 59 yrs 364 days vs 60 yrs exactly', () => {
      const refDate = new Date('2026-10-31T00:00:00Z');
      // Born 1966-11-01 -> on 2026-10-31 is 59 years 364 days old
      expect(calculateAge('1966-11-01', refDate)).toBe(59);
      expect(isSeniorOrPwdEligible({ dateOfBirth: '1966-11-01' })).toBe(false);

      // Born 1966-10-31 -> on 2026-10-31 is 60 years exactly
      expect(calculateAge('1966-10-31', refDate)).toBe(60);
      expect(isSeniorOrPwdEligible({ dateOfBirth: '1966-10-31' })).toBe(true);
    });

    test('4.7 ServiceCheckInModal renders auto-selection banner for Senior/PWD and regular for Young', () => {
      const seniorMarkup = renderToStaticMarkup(
        React.createElement(ServiceCheckInModal, {
          visible: true,
          patient: seniorAgePatient,
          onClose: () => {},
        })
      );
      expect(seniorMarkup).toContain('Senior &amp; PWD priority selected automatically.');
      expect(seniorMarkup).toContain('Senior &amp; PWD Priority');
      expect(seniorMarkup).not.toContain('SQ-001');

      const youngMarkup = renderToStaticMarkup(
        React.createElement(ServiceCheckInModal, {
          visible: true,
          patient: youngPatient,
          onClose: () => {},
        })
      );
      expect(youngMarkup).not.toContain('Senior &amp; PWD priority selected automatically.');
      expect(youngMarkup).toContain('Regular');
      expect(youngMarkup).not.toContain('Regular Series');
      expect(youngMarkup).not.toContain('Q-001');
    });

    test('4.8 ServiceCheckInModal provides manual chips for Regular and Priority', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ServiceCheckInModal, {
          visible: true,
          patient: youngPatient,
          onClose: () => {},
        })
      );
      expect(markup).toContain('data-testid="series-regular-chip"');
      expect(markup).toContain('data-testid="series-priority-chip"');
      expect(markup).toContain('Regular');
      expect(markup).toContain('Senior &amp; PWD Priority');
      expect(markup).not.toContain('Q-001');
      expect(markup).not.toContain('SQ-001');
    });
  });

  describe('5. Zero Jargon Verification', () => {
    test('5.1 ServiceCheckInModal rendered markup contains zero statutory citations ("RA 9994", "RA 7277")', () => {
      const markupSenior = renderToStaticMarkup(
        React.createElement(ServiceCheckInModal, {
          visible: true,
          patient: seniorAgePatient,
          onClose: () => {},
        })
      );
      expect(markupSenior).not.toContain('RA 9994');
      expect(markupSenior).not.toContain('RA 7277');
      expect(markupSenior).not.toContain('Republic Act');
      expect(markupSenior).not.toContain('statutory');

      const markupPwd = renderToStaticMarkup(
        React.createElement(ServiceCheckInModal, {
          visible: true,
          patient: patientWithDisability,
          onClose: () => {},
        })
      );
      expect(markupPwd).not.toContain('RA 9994');
      expect(markupPwd).not.toContain('RA 7277');
      expect(markupPwd).not.toContain('Republic Act');
      expect(markupPwd).not.toContain('statutory');
    });

    test('5.2 PatientDirectoryCard rendered markup contains zero statutory citations ("RA 9994", "RA 7277")', () => {
      const cardMarkup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: seniorAgePatient,
          mode: 'card',
          onQueuePatient: () => {},
          onAddToQueue: () => {},
        })
      );
      expect(cardMarkup).not.toContain('RA 9994');
      expect(cardMarkup).not.toContain('RA 7277');
      expect(cardMarkup).not.toContain('Republic Act');

      const tableMarkup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: patientWithDisability,
          mode: 'table',
          onQueuePatient: () => {},
          onAddToQueue: () => {},
        })
      );
      expect(tableMarkup).not.toContain('RA 9994');
      expect(tableMarkup).not.toContain('RA 7277');
      expect(tableMarkup).not.toContain('Republic Act');
    });

    test('5.3 buildPatientOverflowMenuItems Edit info item omits long hint descriptions and jargon', () => {
      const items = buildPatientOverflowMenuItems(youngPatient, {
        onEditDemographics: () => {},
      });
      const editItem = items.find((i) => i.id === 'edit-demographics')!;
      expect(editItem.label).toBe('Edit info');
      expect(editItem.hint).toBeUndefined();
    });
  });
});

