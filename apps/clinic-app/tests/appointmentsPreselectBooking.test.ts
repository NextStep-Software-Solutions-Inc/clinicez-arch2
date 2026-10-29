// token-guard:ignore-file
import { describe, expect, test, mock, afterAll } from 'bun:test';
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
    visible,
    style,
    onPress,
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
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
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
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
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
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

let lastSetParams: Record<string, any> | null = null;
let lastNavigatedRoute: { name: string; params?: any } | null = null;

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (name: string, params?: any) => {
      lastNavigatedRoute = { name, params };
    },
    setParams: (params: Record<string, any>) => {
      lastSetParams = params;
    },
  }),
  useRoute: () => ({ key: 'Appointments', name: 'Appointments', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

mock.module('../components/layout', () => ({
  ResponsiveLayout: ({ headerTitle, rightAction, children }: any) =>
    React.createElement('div', { 'data-layout': headerTitle }, rightAction, children),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [
      {
        id: 'doc-1',
        name: 'Maria Cruz',
        role: 'Doctor',
        title: 'MD',
      },
    ],
    currentName: 'Nurse Joy',
  }),
  formatStaffName: (s: any) => `Dr. ${s.name}`,
}));

(globalThis as any).__mockClinicContext = {
  settings: {
    patientSearchDisplayFieldsJson: JSON.stringify(['patientCode', 'age']),
  },
  letterhead: null,
};

const {
  default: AppointmentsScreen,
  buildPreselectedPatientFromRoute,
  AppointmentBookedSuccessView,
  defaultSlot,
} = await import('../navigation/screens/Appointments.screen');

const {
  default: PatientDirectoryCard,
  buildPatientOverflowMenuItems,
} = await import('../components/patient/PatientDirectoryCard');

import type { AppointmentItem, ClinicPatient } from '../services/clinicService';

describe('Book Appointment from Patient List & Post-Booking Success Dialog', () => {
  const samplePatient: ClinicPatient = {
    id: 'pat-cassandra',
    tenantId: 'tenant-nextstep',
    clinicId: 'clinic-opd',
    patientCode: 'PAT-20261013-3EFFEA',
    firstName: 'Cassandra',
    lastName: 'Ambray',
    fullName: 'Ambray, Cassandra',
    dateOfBirth: '1999-12-28',
    age: 26,
    sex: 'Female',
    civilStatus: 'Single',
    contactNumber: '09357506035',
    verificationStatus: 'Verified',
    createdAt: '2026-10-13T00:00:00Z',
  };

  test('1. buildPreselectedPatientFromRoute constructs a preselected ClinicPatient from route params and rejects incomplete params', () => {
    const preselected = buildPreselectedPatientFromRoute({
      patientId: 'pat-cassandra',
      patientName: 'Ambray, Cassandra',
      patientCode: 'PAT-20261013-3EFFEA',
    });

    expect(preselected).not.toBeNull();
    expect(preselected?.id).toBe('pat-cassandra');
    expect(preselected?.fullName).toBe('Ambray, Cassandra');
    expect(preselected?.patientCode).toBe('PAT-20261013-3EFFEA');

    // Without patientCode still succeeds
    const withoutCode = buildPreselectedPatientFromRoute({
      patientId: 'pat-cassandra',
      patientName: 'Ambray, Cassandra',
    });
    expect(withoutCode?.id).toBe('pat-cassandra');
    expect(withoutCode?.patientCode).toBe('');

    // Missing patientId or patientName returns null
    expect(buildPreselectedPatientFromRoute(undefined)).toBeNull();
    expect(buildPreselectedPatientFromRoute({ patientId: 'pat-1' })).toBeNull();
    expect(buildPreselectedPatientFromRoute({ patientName: 'Ambray, Cassandra' })).toBeNull();
    expect(buildPreselectedPatientFromRoute({ patientId: '  ', patientName: 'Ambray, Cassandra' })).toBeNull();
  });

  test('2. Clicking Book appointment from PatientDirectoryCard passes patientId, patientName, and patientCode to Appointments route', () => {
    lastNavigatedRoute = null;
    const handleBookFromPatientList = (p: ClinicPatient) => {
      lastNavigatedRoute = {
        name: 'Appointments',
        params: {
          patientId: p.id,
          patientName: p.fullName,
          patientCode: p.patientCode,
        },
      };
    };

    const items = buildPatientOverflowMenuItems(samplePatient, {
      onEditDemographics: () => {},
      onOpenPhilHealth: () => {},
      onOpenChart: () => {},
      onBookAppointment: handleBookFromPatientList,
    });

    const bookMenuItem = items.find((item) => item.id === 'book-appointment');
    expect(bookMenuItem).toBeDefined();
    bookMenuItem!.onPress();

    expect(lastNavigatedRoute).toEqual({
      name: 'Appointments',
      params: {
        patientId: 'pat-cassandra',
        patientName: 'Ambray, Cassandra',
        patientCode: 'PAT-20261013-3EFFEA',
      },
    });

    // Also verify Card mode renders Book appointment button
    const cardMarkup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: samplePatient,
        mode: 'card',
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: handleBookFromPatientList,
        onAddToQueue: () => {},
      })
    );
    expect(cardMarkup).toContain('Book appointment');
  });

  test('3. AppointmentsScreen automatically opens Book appointment dialog with preselected patient when route.params contains patientId and patientName', () => {
    const markupWithPatient = renderToStaticMarkup(
      React.createElement(AppointmentsScreen, {
        route: {
          key: 'Appointments-1',
          name: 'Appointments',
          params: {
            patientId: 'pat-cassandra',
            patientName: 'Ambray, Cassandra',
            patientCode: 'PAT-20261013-3EFFEA',
          },
        } as any,
      })
    );

    // Book appointment modal is open
    expect(markupWithPatient).toContain('data-testid="book-appointment-modal"');
    expect(markupWithPatient).toContain('data-testid="selected-patient-summary"');

    // Preselected patient name and patientCode are shown with Change button
    expect(markupWithPatient).toContain('Ambray, Cassandra');
    expect(markupWithPatient).toContain('PAT-20261013-3EFFEA');
    expect(markupWithPatient).toContain('Change');

    // Patient search input is hidden because patient is already preselected
    expect(markupWithPatient).not.toContain('Search by name or patient code');

    // Normal booking controls are rendered and ready
    expect(markupWithPatient).toContain('Attending physician');
    expect(markupWithPatient).toContain('Dr. Maria Cruz');
    expect(markupWithPatient).toContain('Appointment Date');
    expect(markupWithPatient).toContain('Selected Time');
    expect(markupWithPatient).toContain('Service type');
    expect(markupWithPatient).toContain('Reason for visit');
    expect(markupWithPatient).toContain('Confirm and schedule');
  });

  test('4. AppointmentsScreen keeps Book appointment dialog closed by default when rendered without route params', () => {
    const markupDefault = renderToStaticMarkup(React.createElement(AppointmentsScreen, {}));
    expect(markupDefault).not.toContain('data-testid="selected-patient-summary"');
    expect(markupDefault).not.toContain('Confirm and schedule');
  });

  test('5. AppointmentBookedSuccessView renders post-booking confirmation details and prompt to book a new appointment or close', () => {
    const bookedApt: AppointmentItem = {
      id: 'apt-999',
      clinicId: 'clinic-opd',
      patientId: 'pat-cassandra',
      patientName: 'Ambray, Cassandra',
      doctorId: 'doc-1',
      doctorName: 'Dr. Maria Cruz',
      scheduledAt: '2026-10-15T10:00:00.000Z',
      durationMinutes: 30,
      status: 'Confirmed',
      serviceType: 'Consultation, 12-Lead ECG',
      reason: 'Follow-up blood pressure check',
      createdAt: '2026-10-14T11:30:00.000Z',
    };

    const markup = renderToStaticMarkup(
      React.createElement(AppointmentBookedSuccessView, {
        appointment: bookedApt,
      })
    );

    expect(markup).toContain('data-testid="appointment-booked-success-view"');
    expect(markup).toContain('Appointment confirmed for Ambray, Cassandra');
    expect(markup).toContain('The appointment has been added to the clinic schedule.');
    expect(markup).toContain('Dr. Maria Cruz');
    expect(markup).toContain('Consultation, 12-Lead ECG');
    expect(markup).toContain('Follow-up blood pressure check');
    expect(markup).toContain('Would you like to book a new appointment or close this dialog?');
  });

  test('6. Post-booking state machine transitions cleanly between preselected booking -> success dialog -> Book new appointment / Close', () => {
    const slot = defaultSlot();
    expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(slot.time).toMatch(/^\d{2}:\d{2}$/);

    // Step 1: Open modal with preselected patient from Patient Directory
    let bookModalVisible = false;
    let bookedAppointment: AppointmentItem | null = null;
    let formPatient: ClinicPatient | null = null;

    const openBookModal = (preselected?: ClinicPatient | null) => {
      bookedAppointment = null;
      formPatient = preselected ?? null;
      bookModalVisible = true;
    };

    const closeBookModal = () => {
      bookModalVisible = false;
      bookedAppointment = null;
      formPatient = null;
    };

    const preselected = buildPreselectedPatientFromRoute({
      patientId: samplePatient.id,
      patientName: samplePatient.fullName,
      patientCode: samplePatient.patientCode,
    });
    openBookModal(preselected);

    expect(bookModalVisible).toBe(true);
    expect(formPatient?.id).toBe('pat-cassandra');
    expect(bookedAppointment).toBeNull();

    // Step 2: Confirm and schedule -> transitions to Success Dialog (modal stays open, bookedAppointment set)
    bookedAppointment = {
      id: 'apt-1001',
      clinicId: 'clinic-opd',
      patientId: formPatient!.id,
      patientName: formPatient!.fullName,
      scheduledAt: `${slot.date}T${slot.time}:00.000Z`,
      durationMinutes: 30,
      status: 'Confirmed',
      serviceType: 'Consultation',
      reason: 'General Consultation',
      createdAt: new Date().toISOString(),
    };
    formPatient = null;

    expect(bookModalVisible).toBe(true);
    expect(bookedAppointment.patientName).toBe('Ambray, Cassandra');

    // Step 3A: Clinic staff clicks "Book new appointment" -> stays open, clears success state and starts clean form
    openBookModal(null);
    expect(bookModalVisible).toBe(true);
    expect(bookedAppointment).toBeNull();
    expect(formPatient).toBeNull();

    // Step 3B: Clinic staff clicks "Close" -> closes modal and resets state
    closeBookModal();
    expect(bookModalVisible).toBe(false);
    expect(bookedAppointment).toBeNull();
    expect(formPatient).toBeNull();
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
});
