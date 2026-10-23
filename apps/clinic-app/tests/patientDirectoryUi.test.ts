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
  PatientDirectoryTableHeader,
  computePatientLocation,
  getPatientInitials,
  hasKnownAllergies,
  hasStatAllergy,
  formatPatientDemographicsLine,
  buildPatientOverflowMenuItems,
} = await import('../components/patient/PatientDirectoryCard');
import type { ClinicPatient } from '../services/clinicService';

describe('PatientDirectoryCard & Directory UI Improvements', () => {
  const basePatient: ClinicPatient = {
    id: 'pat-cassandra',
    tenantId: 'tenant-nextstep',
    clinicId: 'clinic-opd',
    patientCode: 'PAT-20261013-3EFFEA',
    firstName: 'Cassandra',
    lastName: 'Ambray',
    fullName: 'Ambray, Cassandra',
    dateOfBirth: '1999-12-28',
    age: 26,
    gender: 'Female',
    civilStatus: 'Single',
    contactNumber: '09357506035',
    barangay: 'Poblacion',
    city: 'Biñan',
    customFields: {
      primary_barangay: 'Poblacion',
      primary_city: 'Biñan',
    },
    bloodType: 'B+',
    philHealthNumber: '12-121212121-7',
    seniorCitizenId: '98928398293293',
    allergies: 'Amoxicillin (Medication - STAT), Pollen (Environmental)',
    alerts: 'High fall risk',
    verificationStatus: 'Verified',
    createdAt: '2026-10-13T00:00:00Z',
  };

  test('1. getPatientInitials extracts 2-letter uppercase initials reliably', () => {
    expect(getPatientInitials(basePatient)).toBe('AC');
    expect(
      getPatientInitials({
        firstName: '',
        lastName: '',
        fullName: 'Penida, Marco',
      })
    ).toBe('PM');
    expect(
      getPatientInitials({
        firstName: '',
        lastName: '',
        fullName: 'Madonna',
      })
    ).toBe('MA');
  });

  test('2. hasKnownAllergies and hasStatAllergy accurately classify clinical allergy strings', () => {
    expect(hasKnownAllergies(undefined)).toBe(false);
    expect(hasKnownAllergies('')).toBe(false);
    expect(hasKnownAllergies('None known')).toBe(false);
    expect(hasKnownAllergies('NKDA')).toBe(false);
    expect(hasKnownAllergies('Penicillin')).toBe(true);

    expect(hasStatAllergy('Penicillin (Medication - STAT)')).toBe(true);
    expect(hasStatAllergy('Peanuts (Anaphylactic)')).toBe(true);
    expect(hasStatAllergy('Pollen (Environmental)')).toBe(false);
    expect(hasStatAllergy('None known')).toBe(false);
  });

  test('3. formatPatientDemographicsLine preserves full chronological age (yrs, mos, wks, days) for all ages', () => {
    const refDate = new Date(2026, 9, 14); // Oct 14, 2026
    const line = formatPatientDemographicsLine(basePatient, refDate);
    expect(line).toContain('26 yrs, 9 mos, 2 wks, 2 days');
    expect(line).toContain('Female');
    expect(line).toContain('Single');
    expect(line).toContain('Blood type B+');
  });

  test('4. buildPatientOverflowMenuItems includes Edit Demographics and PhilHealth Profile in the ActionMenu', () => {
    let editedId = '';
    let philHealthId = '';
    let chartId = '';
    let bookedId = '';

    const items = buildPatientOverflowMenuItems(basePatient, {
      onEditDemographics: (p) => {
        editedId = p.id;
      },
      onOpenPhilHealth: (p) => {
        philHealthId = p.id;
      },
      onOpenChart: (p) => {
        chartId = p.id;
      },
      onBookAppointment: (p) => {
        bookedId = p.id;
      },
    });

    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['edit-demographics', 'philhealth-profile', 'view-chart', 'book-appointment']);

    items[0].onPress();
    expect(editedId).toBe('pat-cassandra');

    items[1].onPress();
    expect(philHealthId).toBe('pat-cassandra');

    items[2].onPress();
    expect(chartId).toBe('pat-cassandra');

    items[3].onPress();
    expect(bookedId).toBe('pat-cassandra');
  });

  test('5. Card mode renders 3-button footer (View chart, Book appointment, Add to queue), header ActionMenu trigger, initials avatar, and STAT allergy badge', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        isDesktopGrid: true,
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: () => {},
        onAddToQueue: () => {},
      })
    );

    // Identity & Initials Avatar
    expect(markup).toContain('AC');
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).toContain('PAT-20261013-3EFFEA');

    // Full chronological age
    expect(markup).toContain('yrs');
    expect(markup).toContain('mos');
    expect(markup).toContain('Female • Single • Blood type B+');

    // Contact & Statutory badges
    expect(markup).toContain('09357506035');
    expect(markup).toContain('Poblacion, Biñan');
    expect(markup).toContain('PhilHealth 12-121212121-7');
    expect(markup).toContain('Senior ID 98928398293293');

    // Clinical Urgency & STAT badge
    expect(markup).toContain('STAT');
    expect(markup).toContain('Allergies: Amoxicillin (Medication - STAT), Pollen (Environmental)');
    expect(markup).toContain('High fall risk');

    // 3-Button Footer + Overflow ActionMenu trigger
    expect(markup).toContain('View chart');
    expect(markup).toContain('Book appointment');
    expect(markup).toContain('Add to queue');
    expect(markup).toContain('aria-label="More actions for Ambray, Cassandra"');

    // Desktop 2-column constraint style applied so orphan cards do not stretch 100%
    expect(markup).toContain('&quot;maxWidth&quot;:&quot;49%&quot;');
    expect(markup).toContain('&quot;flexBasis&quot;:&quot;48.8%&quot;');
  });

  test('5.1 Mobile / single-row patient card has no fixed or minimum height (no flexBasis: 420 or minHeight)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        isDesktopGrid: false,
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: () => {},
        onAddToQueue: () => {},
      })
    );

    // Verifies full width layout without rigid min-height or flexBasis 420
    expect(markup).toContain('&quot;width&quot;:&quot;100%&quot;');
    expect(markup).not.toContain('420');
    expect(markup).not.toContain('&quot;minHeight&quot;:420');
  });

  test('5.2 Action footer renders all 3 action buttons in a single row with flexGrow, without wrapping group', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: () => {},
        onAddToQueue: () => {},
      })
    );

    // All 3 buttons present
    expect(markup).toContain('View chart');
    expect(markup).toContain('Book appointment');
    expect(markup).toContain('Add to queue');

    // No intermediate primaryActionsGroup wrapping buttons onto a second line
    expect(markup).not.toContain('primaryActionsGroup');

    // Buttons styled with flexGrow: 1 to divide single line equally
    expect(markup).toContain('&quot;flexGrow&quot;:1');
  });

  test('5.3 Action footer flex grows to cover entire span when only 2 or 1 action buttons are provided', () => {
    // Case A: 2 buttons provided (View chart + Add to queue)
    const markupTwo = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onAddToQueue: () => {},
      })
    );
    expect(markupTwo).toContain('View chart');
    expect(markupTwo).not.toContain('Book appointment');
    expect(markupTwo).toContain('Add to queue');
    expect(markupTwo).toContain('&quot;flexGrow&quot;:1');

    // Case B: 1 button provided (only Add to queue)
    const markupOne = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onAddToQueue: () => {},
      })
    );
    expect(markupOne).not.toContain('View chart');
    expect(markupOne).not.toContain('Book appointment');
    expect(markupOne).toContain('Add to queue');
    expect(markupOne).toContain('&quot;flexGrow&quot;:1');
  });

  test('6. Active queue ticket renders In Queue badge and updates primary CTA to Queued (Q-XXX)', () => {
    const queuedPatient: ClinicPatient = {
      ...basePatient,
      activeQueueTicket: 'Q-014',
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: queuedPatient,
        mode: 'card',
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: () => {},
        onAddToQueue: () => {},
      })
    );

    expect(markup).toContain('In Queue • Q-014');
    expect(markup).toContain('Queued (Q-014)');
  });

  test('7. Compact Workstation Table mode renders header and high-density row with full age and ActionMenu', () => {
    const headerMarkup = renderToStaticMarkup(React.createElement(PatientDirectoryTableHeader));
    expect(headerMarkup).toContain('PATIENT &amp; CODE');
    expect(headerMarkup).toContain('AGE &amp; DEMOGRAPHICS');
    expect(headerMarkup).toContain('CONTACT &amp; COVERAGE');
    expect(headerMarkup).toContain('CLINICAL ALERTS');
    expect(headerMarkup).toContain('ACTIONS');

    const rowMarkup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'table',
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onBookAppointment: () => {},
        onAddToQueue: () => {},
      })
    );

    expect(rowMarkup).toContain('data-testid="patient-table-row-pat-cassandra"');
    expect(rowMarkup).toContain('Ambray, Cassandra');
    expect(rowMarkup).toContain('PAT-20261013-3EFFEA');
    expect(rowMarkup).toContain('Female • Single • Blood type B+');
    expect(rowMarkup).toContain('STAT');
    expect(rowMarkup).toContain('View chart');
    expect(rowMarkup).toContain('Add to queue');
    expect(rowMarkup).toContain('aria-label="More actions for Ambray, Cassandra"');
  });

  test('8. computePatientLocation resolves Philippine administrative hierarchy from customFields', () => {
    // 1. Barangay, City, Province
    expect(
      computePatientLocation({
        customFields: {
          primary_barangay: 'San Vicente',
          primary_city: 'Biñan',
          primary_province: 'Laguna',
        },
      })
    ).toBe('San Vicente, Biñan, Laguna');

    // 2. Barangay, City
    expect(
      computePatientLocation({
        customFields: {
          primary_barangay: 'San Antonio',
          primary_city: 'Pasig City',
        },
      })
    ).toBe('San Antonio, Pasig City');

    // 3. City, Province
    expect(
      computePatientLocation({
        customFields: {
          primary_city: 'Cebu City',
          primary_province: 'Cebu',
        },
      })
    ).toBe('Cebu City, Cebu');

    // 4. City only
    expect(
      computePatientLocation({
        customFields: {
          primary_city: 'Davao City',
        },
      })
    ).toBe('Davao City');

    // 5. Barangay, Province
    expect(
      computePatientLocation({
        customFields: {
          primary_barangay: 'Lahug',
          primary_province: 'Cebu',
        },
      })
    ).toBe('Lahug, Cebu');

    // 6. Barangay only
    expect(
      computePatientLocation({
        customFields: {
          primary_barangay: 'Poblacion',
        },
      })
    ).toBe('Poblacion');

    // 7. Province only
    expect(
      computePatientLocation({
        customFields: {
          primary_province: 'Batangas',
        },
      })
    ).toBe('Batangas');

    // 8. Address line only
    expect(
      computePatientLocation({
        customFields: {
          primary_address_line: 'Unit 402, Sunshine Tower',
        },
      })
    ).toBe('Unit 402, Sunshine Tower');

    // 9. Empty fallback
    expect(computePatientLocation({})).toBe('');
    expect(computePatientLocation(null)).toBe('');
    expect(computePatientLocation(undefined)).toBe('');
    expect(computePatientLocation({ customFields: {} })).toBe('');
    expect(computePatientLocation({ customFields: null })).toBe('');

    // 10. Does NOT read top-level legacy properties
    expect(
      computePatientLocation({
        barangay: 'Legacy Brgy',
        city: 'Legacy City',
        customFields: {},
      } as any)
    ).toBe('');
  });
});

