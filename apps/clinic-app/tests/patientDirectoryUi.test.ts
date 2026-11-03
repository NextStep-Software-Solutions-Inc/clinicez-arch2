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
  isMyPatient,
} = await import('../components/patient/PatientDirectoryCard');

const { default: ScheduleVisitModal } = await import('../components/patient/ScheduleVisitModal');
const { default: QueueTicketPickerModal } = await import('../components/patient/QueueTicketPickerModal');
const {
  default: ServiceCheckInModal,
  isSeniorOrPwdEligible,
  resolveTicketPrefix,
  formatQueueTicketNumber,
  formatQueueStatusMeta,
  formatVisitTypeMeta,
  formatTicketSubtext,
} = await import('../components/patient/ServiceCheckInModal');

import type { ClinicPatient } from '../services/clinicService';
import { theme } from '../constants/theme';

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
    sex: 'Female',
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

  test('4. buildPatientOverflowMenuItems includes Edit info and PhilHealth info in the ActionMenu without subtext', () => {
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
      onScheduleVisit: (p) => {
        bookedId = p.id;
      },
    });

    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['edit-demographics', 'philhealth-profile', 'view-chart', 'schedule-visit']);
    expect(items.map((i) => i.label)).toEqual(['Edit info', 'PhilHealth info', 'View chart', 'Schedule visit']);
    expect(items.every((i) => i.hint === undefined)).toBe(true);

    items[0].onPress();
    expect(editedId).toBe('pat-cassandra');

    items[1].onPress();
    expect(philHealthId).toBe('pat-cassandra');

    items[2].onPress();
    expect(chartId).toBe('pat-cassandra');

    items[3].onPress();
    expect(bookedId).toBe('pat-cassandra');
  });

  test('5. Card mode renders 3-button footer (View chart, Schedule visit, Queue Patient), header ActionMenu trigger, initials avatar, and STAT allergy badge', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: basePatient,
        mode: 'card',
        isDesktopGrid: true,
        onOpenChart: () => {},
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onScheduleVisit: () => {},
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
    expect(markup).toContain('Schedule visit');
    expect(markup).toContain('Queue Patient');
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
        onScheduleVisit: () => {},
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
        onScheduleVisit: () => {},
        onAddToQueue: () => {},
      })
    );

    // All 3 buttons present
    expect(markup).toContain('View chart');
    expect(markup).toContain('Schedule visit');
    expect(markup).toContain('Queue Patient');

    // No intermediate primaryActionsGroup wrapping buttons onto a second line
    expect(markup).not.toContain('primaryActionsGroup');

    // Buttons styled with flexGrow: 1 to divide single line equally
    expect(markup).toContain('&quot;flexGrow&quot;:1');
  });

  test('5.3 Action footer flex grows to cover entire span when only 2 or 1 action buttons are provided', () => {
    // Case A: 2 buttons provided (View chart + Queue Patient)
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
    expect(markupTwo).not.toContain('Schedule visit');
    expect(markupTwo).toContain('Queue Patient');
    expect(markupTwo).toContain('&quot;flexGrow&quot;:1');

    // Case B: 1 button provided (only Queue Patient)
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
    expect(markupOne).not.toContain('Schedule visit');
    expect(markupOne).toContain('Queue Patient');
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

    expect(markup).not.toContain('In Queue • Q-014');
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
        onScheduleVisit: () => {},
        onAddToQueue: () => {},
      })
    );

    expect(rowMarkup).toContain('data-testid="patient-table-row-pat-cassandra"');
    expect(rowMarkup).toContain('Ambray, Cassandra');
    expect(rowMarkup).toContain('PAT-20261013-3EFFEA');
    expect(rowMarkup).toContain('Female • Single • Blood type B+');
    expect(rowMarkup).toContain('STAT');
    expect(rowMarkup).toContain('View chart');
    expect(rowMarkup).toContain('Schedule visit');
    expect(rowMarkup).toContain('Queue Patient');
    expect(rowMarkup).toContain('aria-label="More actions for Ambray, Cassandra"');
  });

  test('8. Card mode renders clinicEzId badge with primary variant when clinicEzId is present', () => {
    const patientWithEzId: ClinicPatient = {
      ...basePatient,
      clinicEzId: 'CEZ-2026-0042',
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithEzId,
        mode: 'card',
        onOpenChart: () => {},
      })
    );

    // Verify clinicEzId badge is rendered
    expect(markup).toContain('CEZ-2026-0042');
    // Verify semantic token styling: primary variant uses theme.colors.primaryLight & primaryBorder
    expect(markup).toContain(theme.colors.primaryLight);
    expect(markup).toContain(theme.colors.primaryBorder);
    expect(markup).toContain(theme.colors.primaryDark);
  });

  test('9. Table mode renders clinicEzId badge with primary variant and sm size when clinicEzId is present', () => {
    const patientWithEzId: ClinicPatient = {
      ...basePatient,
      clinicEzId: 'CEZ-2026-8888',
    };

    const rowMarkup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithEzId,
        mode: 'table',
        onOpenChart: () => {},
      })
    );

    // Verify clinicEzId badge is rendered in table row
    expect(rowMarkup).toContain('CEZ-2026-8888');
    // Verify semantic token styling for primary variant
    expect(rowMarkup).toContain(theme.colors.primaryLight);
    expect(rowMarkup).toContain(theme.colors.primaryBorder);
    expect(rowMarkup).toContain(theme.colors.primaryDark);
  });

  test('10. Absence of clinicEzId badge when clinicEzId is null or undefined', () => {
    // Case A: undefined in card mode and table mode
    const patientWithoutEzId: ClinicPatient = {
      ...basePatient,
      clinicEzId: undefined,
    };

    const cardMarkupUndefined = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithoutEzId,
        mode: 'card',
      })
    );
    expect(cardMarkupUndefined).not.toContain('CEZ-');

    const tableMarkupUndefined = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithoutEzId,
        mode: 'table',
      })
    );
    expect(tableMarkupUndefined).not.toContain('CEZ-');

    // Case B: null in card mode and table mode
    const patientWithNullEzId: ClinicPatient = {
      ...basePatient,
      clinicEzId: null,
    };

    const cardMarkupNull = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithNullEzId,
        mode: 'card',
      })
    );
    expect(cardMarkupNull).not.toContain('CEZ-');

    const tableMarkupNull = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: patientWithNullEzId,
        mode: 'table',
      })
    );
    expect(tableMarkupNull).not.toContain('CEZ-');
  });

  test('11. Directory reactivity and state upsert logic: prepend new patient and update existing in-place', () => {
    // The exact state updater logic from Patients.screen.tsx:
    const upsertDirectoryPatient = (
      prev: ClinicPatient[] | null,
      patient: ClinicPatient
    ): ClinicPatient[] => {
      if (!prev) return [patient];
      const index = prev.findIndex((p) => p.id === patient.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...patient };
        return next;
      }
      return [patient, ...prev];
    };

    // Sub-case A: initial state is null
    const initialUpsert = upsertDirectoryPatient(null, basePatient);
    expect(initialUpsert).toHaveLength(1);
    expect(initialUpsert[0].id).toBe(basePatient.id);

    // Sub-case B: prepend new patient
    const existingList: ClinicPatient[] = [basePatient];
    const newPatient: ClinicPatient = {
      ...basePatient,
      id: 'pat-diego',
      patientCode: 'PAT-20261023-DIEGO1',
      fullName: 'Dela Cruz, Diego',
      clinicEzId: 'CEZ-2026-0099',
    };

    const listAfterPrepend = upsertDirectoryPatient(existingList, newPatient);
    expect(listAfterPrepend).toHaveLength(2);
    expect(listAfterPrepend[0].id).toBe('pat-diego');
    expect(listAfterPrepend[0].clinicEzId).toBe('CEZ-2026-0099');
    expect(listAfterPrepend[1].id).toBe(basePatient.id);

    // Sub-case C: update existing patient in-place (e.g. clinicEzId added after sync or demographic update)
    const updatedPatient: ClinicPatient = {
      ...basePatient,
      clinicEzId: 'CEZ-2026-0042',
      verificationStatus: 'Verified',
    };

    const listAfterUpdate = upsertDirectoryPatient(listAfterPrepend, updatedPatient);
    expect(listAfterUpdate).toHaveLength(2);
    // Position 0 unchanged
    expect(listAfterUpdate[0].id).toBe('pat-diego');
    // Position 1 updated in-place with new clinicEzId
    expect(listAfterUpdate[1].id).toBe(basePatient.id);
    expect(listAfterUpdate[1].clinicEzId).toBe('CEZ-2026-0042');
    expect(listAfterUpdate[1].verificationStatus).toBe('Verified');
  });

  test('12. Directory navigation focus reactivity guard: suppresses first focus and triggers on subsequent focus', () => {
    let fetchCount = 0;
    const fetchPatients = () => {
      fetchCount += 1;
    };

    const isFirstFocusRef = { current: true };
    const focusCallback = () => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      fetchPatients();
    };

    // Initial mount focus: suppressed, does not double-fetch
    focusCallback();
    expect(fetchCount).toBe(0);
    expect(isFirstFocusRef.current).toBe(false);

    // Subsequent navigation focus (e.g. navigating back from QR scan or import): triggers refresh
    focusCallback();
    expect(fetchCount).toBe(1);

    focusCallback();
    expect(fetchCount).toBe(2);
  });

  test('13. computePatientLocation resolves Philippine administrative hierarchy from customFields', () => {
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

  test('14. SegmentedControl renders string count (e.g. 50/5000) for loaded over total display', async () => {
    const { default: SegmentedControl } = await import('../components/ui/SegmentedControl');

    const markup = renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        value: 'ALL',
        onChange: () => {},
        options: [
          { value: 'ALL', label: 'All patients', count: '50/5000' },
          { value: 'STUDENTS', label: 'Students', count: '0/120' },
          { value: 'EMPLOYEES', label: 'Employees', count: '0/80' },
          { value: 'ALERTS', label: 'Alerts & allergies', count: '24/240' },
          { value: 'SENIOR_PWD', label: 'Senior & PWD', count: '11/110' },
        ],
      })
    );

    expect(markup).toContain('All patients');
    expect(markup).toContain('50/5000');
    expect(markup).toContain('Students');
    expect(markup).toContain('0/120');
    expect(markup).toContain('Alerts &amp; allergies');
    expect(markup).toContain('24/240');
    expect(markup).toContain('Senior &amp; PWD');
    expect(markup).toContain('11/110');
  });

  test('15. Patients.screen.tsx tab filters display loaded over total and removes redundant toolbar label', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // Toolbar text "Scroll for more" is completely removed from the header toolbar
    expect(screenCode).not.toContain('{filteredPatients.length} loaded{hasMore ? \' • Scroll for more\' : \'\'}');
    expect(screenCode).not.toContain('Scroll for more');

    // formatTabCount helper is present and formats loaded/total
    expect(screenCode).toContain('const formatTabCount = useCallback(');
    expect(screenCode).toContain('`${loaded}/${total}`');

    // Tab options consume formatTabCount
    expect(screenCode).toContain("formatTabCount(filterCounts?.all, totalCounts?.all)");
    expect(screenCode).toContain("formatTabCount(filterCounts?.myPatients, totalCounts?.myPatients)");
    expect(screenCode).toContain("formatTabCount(filterCounts?.students, totalCounts?.students)");
    expect(screenCode).toContain("formatTabCount(filterCounts?.employees, totalCounts?.employees)");
    expect(screenCode).toContain("formatTabCount(filterCounts?.alerts, totalCounts?.alerts)");
    expect(screenCode).toContain("formatTabCount(filterCounts?.seniorPwd, totalCounts?.seniorPwd)");

    // getPatientCounts is called to fetch database totals
    expect(screenCode).toContain('clinicService.getPatientCounts');
  });

  test('16. Patients.screen.tsx includes "My patients" tab toolbar option placed directly after "All patients"', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // PatientFilter includes MY_PATIENTS
    expect(screenCode).toContain("'ALL' | 'MY_PATIENTS' | 'STUDENTS' | 'EMPLOYEES' | 'ALERTS' | 'SENIOR_PWD'");

    // Options array includes MY_PATIENTS tab right after All patients
    const allPatientsIndex = screenCode.indexOf("value: 'ALL', label: 'All patients'");
    const myPatientsIndex = screenCode.indexOf("value: 'MY_PATIENTS', label: 'My patients'");
    const studentsIndex = screenCode.indexOf("value: 'STUDENTS', label: 'Students'");

    expect(allPatientsIndex).toBeGreaterThan(-1);
    expect(myPatientsIndex).toBeGreaterThan(allPatientsIndex);
    expect(studentsIndex).toBeGreaterThan(myPatientsIndex);

    // formatTabCount is used for myPatients
    expect(screenCode).toContain("formatTabCount(filterCounts?.myPatients, totalCounts?.myPatients)");

    // Server-side filtering parameters passed in fetchPatients
    expect(screenCode).toContain("serverFilterMode = activeFilter !== 'ALL' ? activeFilter : undefined;");
  });

  test('17. isMyPatient isolates patients assigned to or seen by doctors and nurses', () => {
    const doctorStaff: any = {

      id: 'doc-santos-1',
      role: 'Doctor',
      firstName: 'Maria',
      lastName: 'Santos',
    };

    const nurseStaff: any = {
      id: 'nurse-joy-1',
      role: 'Nurse',
      firstName: 'Joy',
      lastName: 'Flores',
      assignedRoomIds: ['room-triage-a', 'room-triage-b'],
    };

    // 1. Doctor matches assigned_doctor_id
    const patDocAssigned: any = {
      id: 'p1',
      fullName: 'Patient 1',
      customFields: { assigned_doctor_id: 'doc-santos-1' },
    };
    expect(isMyPatient(patDocAssigned, doctorStaff)).toBe(true);

    // 2. Doctor matches doctor_id
    const patDocSeen: any = {
      id: 'p2',
      fullName: 'Patient 2',
      customFields: { doctor_id: 'doc-santos-1' },
    };
    expect(isMyPatient(patDocSeen, doctorStaff)).toBe(true);

    // 3. Doctor matches activeQueueDoctorId
    const patDocQueued: any = {
      id: 'p3',
      fullName: 'Patient 3',
      activeQueueDoctorId: 'doc-santos-1',
      customFields: {},
    };
    expect(isMyPatient(patDocQueued, doctorStaff)).toBe(true);

    // 4. Doctor does NOT match other doctor's patient
    const patDocOther: any = {
      id: 'p4',
      fullName: 'Patient 4',
      customFields: { assigned_doctor_id: 'doc-other-99' },
    };
    expect(isMyPatient(patDocOther, doctorStaff)).toBe(false);

    // 5. Nurse matches nurse_id in customFields
    const patNurseAssigned: any = {
      id: 'p5',
      fullName: 'Patient 5',
      customFields: { nurse_id: 'nurse-joy-1' },
    };
    expect(isMyPatient(patNurseAssigned, nurseStaff)).toBe(true);

    // 6. Nurse matches vitals recorded by nurse
    const patNurseVitals: any = {
      id: 'p6',
      fullName: 'Patient 6',
      customFields: { vitals_recorded_by_nurse_id: 'nurse-joy-1' },
    };
    expect(isMyPatient(patNurseVitals, nurseStaff)).toBe(true);

    // 7. Nurse matches assigned room ID
    const patNurseRoom: any = {
      id: 'p7',
      fullName: 'Patient 7',
      roomId: 'room-triage-a',
      customFields: {},
    };
    expect(isMyPatient(patNurseRoom, nurseStaff)).toBe(true);

    // 8. Nurse does NOT match other room or unassigned patient
    const patNurseOther: any = {
      id: 'p8',
      fullName: 'Patient 8',
      roomId: 'room-other-x',
      customFields: {},
    };
    expect(isMyPatient(patNurseOther, nurseStaff)).toBe(false);

    // 9. Null or undefined staff returns false
    expect(isMyPatient(patDocAssigned, null)).toBe(false);
    expect(isMyPatient(patDocAssigned, undefined)).toBe(false);
  });

  test('18. ScheduleVisitModal renders patient name subtitle without demographic bloat, quick dates, and visit purposes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScheduleVisitModal, {
        visible: true,
        patient: basePatient,
        onClose: () => {},
        attendingDoctor: 'Dr. Maria Santos',
        visitPurpose: 'Consultation',
      })
    );

    // Concise patient subtitle without demographic detail banner
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).not.toContain('PAT-20261013-3EFFEA');
    expect(markup).not.toContain('PhilHealth PIN 12-121212121-7');
    expect(markup).not.toContain('Direct clinic appointment setup');

    // Title and quick date options
    expect(markup).toContain('Schedule visit');
    expect(markup).toContain('Today');
    expect(markup).toContain('Tomorrow');
    expect(markup).toContain('Next Week');

    // Visit Purpose options
    expect(markup).toContain('Consultation');
    expect(markup).toContain('Routine Follow-up');
    expect(markup).toContain('Chronic Disease Review');
    expect(markup).toContain('Post-Op Check');

    // Footer action buttons
    expect(markup).toContain('Cancel');
    expect(markup).toContain('Confirm and schedule');
  });

  test('19. ScheduleVisitModal handles null visibility cleanly without rendering modal card', () => {
    const closedMarkup = renderToStaticMarkup(
      React.createElement(ScheduleVisitModal, {
        visible: false,
        patient: basePatient,
        onClose: () => {},
      })
    );
    expect(closedMarkup).toBe('');

    const nullPatientMarkup = renderToStaticMarkup(
      React.createElement(ScheduleVisitModal, {
        visible: true,
        patient: null,
        onClose: () => {},
      })
    );
    expect(nullPatientMarkup).toBe('');
  });

  test('20. Patients.screen.tsx wires onScheduleVisit and mounts ScheduleVisitModal', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // Imports ScheduleVisitModal
    expect(screenCode).toContain("import ScheduleVisitModal from '../../components/patient/ScheduleVisitModal'");

    // Declares scheduleModalPatient state
    expect(screenCode).toContain('const [scheduleModalPatient, setScheduleModalPatient] = useState<ClinicPatient | null>(null)');

    // Wires onScheduleVisit in card and table modes
    expect(screenCode).toContain('onScheduleVisit={(p) => setScheduleModalPatient(p)}');

    // Mounts ScheduleVisitModal
    expect(screenCode).toContain('<ScheduleVisitModal');
    expect(screenCode).toContain('visible={!!scheduleModalPatient}');
    expect(screenCode).toContain('patient={scheduleModalPatient}');
    expect(screenCode).toContain('onClose={() => setScheduleModalPatient(null)}');
  });

  test('21. buildPatientOverflowMenuItems includes 4 direct clinical service intents under Services & Queue when onSelectService is provided', () => {
    let selectedService: string | null = null;
    let targetPatientId: string | null = null;

    const items = buildPatientOverflowMenuItems(basePatient, {
      onSelectService: (p, srv) => {
        targetPatientId = p.id;
        selectedService = srv;
      },
    });

    const itemLabels = items.map((i) => i.label);
    expect(itemLabels).toContain('Consult');
    expect(itemLabels).toContain('Vitals');
    expect(itemLabels).toContain('Start procedure');
    expect(itemLabels).toContain('Medical certificate');
    expect(items.every((i) => i.hint === undefined)).toBe(true);

    const consultItem = items.find((i) => i.id === 'service-consultation')!;
    consultItem.onPress();
    expect(targetPatientId).toBe('pat-cassandra');
    expect(selectedService).toBe('Doctor Consultation');

    const vitalsItem = items.find((i) => i.id === 'service-vitals')!;
    vitalsItem.onPress();
    expect(selectedService).toBe('Vitals Check');

    const procedureItem = items.find((i) => i.id === 'service-procedure')!;
    procedureItem.onPress();
    expect(selectedService).toBe('Clinical Procedure');

    const adminItem = items.find((i) => i.id === 'service-administrative')!;
    adminItem.onPress();
    expect(selectedService).toBe('Administrative & Clearance');
  });

  test('22. ServiceCheckInModal renders concise patient subtitle, plain-language service cards, and omits patient banner & series badge', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: basePatient,
        onClose: () => {},
      })
    );

    // Patient name in subtitle without demographic banner or series badge
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).not.toContain('PAT-20261013-3EFFEA');
    expect(markup).not.toContain('data-testid="ticket-series-preview"');
    expect(markup).not.toContain('Regular Series');
    expect(markup).not.toContain('SOAP');
    expect(markup).not.toContain('SpO2');

    // Conversational question prompts
    expect(markup).toContain('What service would the patient like to avail?');
    expect(markup).toContain('Does this patient need a priority lane?');

    // 4 Clinical Services
    expect(markup).toContain('Doctor Consultation');
    expect(markup).toContain('Vitals Check');
    expect(markup).toContain('Clinical Procedure');
    expect(markup).toContain('Administrative &amp; Clearance');

    // Footer actions
    expect(markup).toContain('Continue');
    expect(markup).toContain('Cancel');
  });

  test('23. ServiceCheckInModal auto-selects Senior & PWD Priority when patient is senior or PWD', () => {
    const seniorPatient: ClinicPatient = {
      ...basePatient,
      id: 'pat-senior',
      age: 72,
      seniorCitizenId: 'SC-12345',
    };

    expect(isSeniorOrPwdEligible(seniorPatient)).toBe(true);
    expect(isSeniorOrPwdEligible(basePatient)).toBe(true); // basePatient has seniorCitizenId: '98928398293293'

    const youngPatient: ClinicPatient = {
      ...basePatient,
      id: 'pat-young',
      age: 28,
      dateOfBirth: '1998-05-15',
      seniorCitizenId: undefined,
      pwdId: undefined,
      customFields: {},
    };
    expect(isSeniorOrPwdEligible(youngPatient)).toBe(false);

    // Markup for senior patient shows plain-language priority note
    const seniorMarkup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: seniorPatient,
        onClose: () => {},
      })
    );
    expect(seniorMarkup).toContain('Senior &amp; PWD priority selected automatically.');
    expect(seniorMarkup).toContain('Senior &amp; PWD Priority');
    expect(seniorMarkup).not.toContain('SQ-001');

    // Markup for young patient defaults to Regular without pre-submission queue number
    const youngMarkup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: youngPatient,
        onClose: () => {},
      })
    );
    expect(youngMarkup).toContain('Regular');
    expect(youngMarkup).not.toContain('Q-001');
    expect(youngMarkup).not.toContain('Senior &amp; PWD priority selected automatically.');
  });

  test('24. resolveTicketPrefix and formatQueueTicketNumber produce accurate regular and priority ticket numbers', () => {
    expect(resolveTicketPrefix('Doctor Consultation', false)).toBe('Q');
    expect(resolveTicketPrefix('Doctor Consultation', true)).toBe('SQ');

    expect(resolveTicketPrefix('Vitals Check', false)).toBe('V');
    expect(resolveTicketPrefix('Vitals Check', true)).toBe('SV');

    expect(resolveTicketPrefix('Clinical Procedure', false)).toBe('P');
    expect(resolveTicketPrefix('Clinical Procedure', true)).toBe('SP');

    expect(resolveTicketPrefix('Administrative & Clearance', false)).toBe('A');
    expect(resolveTicketPrefix('Administrative & Clearance', true)).toBe('SA');

    expect(formatQueueTicketNumber('Q', 1)).toBe('Q-001');
    expect(formatQueueTicketNumber('SQ', 42)).toBe('SQ-042');
    expect(formatQueueTicketNumber('SV', 9)).toBe('SV-009');
    expect(formatQueueTicketNumber('P', 105)).toBe('P-105');
  });

  test('25. Patients.screen.tsx wires onQueuePatient, onSelectService and mounts ServiceCheckInModal', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // Imports ServiceCheckInModal
    expect(screenCode).toContain("import ServiceCheckInModal");

    // Declares serviceModalPatient state
    expect(screenCode).toContain('const [serviceModalPatient, setServiceModalPatient] = useState<ClinicPatient | null>(null)');

    // Declares selectedServiceIntent state
    expect(screenCode).toContain('const [selectedServiceIntent, setSelectedServiceIntent] = useState<ClinicalServiceType>');

    // Wires onQueuePatient and onSelectService
    expect(screenCode).toContain('onQueuePatient={handleQueueCheckIn}');
    expect(screenCode).toContain('onSelectService={handleSelectService}');

    // Mounts ServiceCheckInModal
    expect(screenCode).toContain('<ServiceCheckInModal');
    expect(screenCode).toContain('visible={!!serviceModalPatient}');
    expect(screenCode).toContain('patient={serviceModalPatient}');
    expect(screenCode).toContain('initialService={selectedServiceIntent}');
    expect(screenCode).toContain('onClose={() => setServiceModalPatient(null)}');
    expect(screenCode).toContain('onConfirm={handleConfirmServiceCheckIn}');
  });

  test('26. ServiceCheckInModal displays priority selection without speculative pre-submission queue numbers or series badge', () => {
    const patientWithActive: ClinicPatient = {
      ...basePatient,
      activeQueueTicket: 'P-001',
      activeQueueItemId: 'q-item-123',
    };

    const markup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: patientWithActive,
        onClose: () => {},
      })
    );

    // Initial render displays clean priority choices without speculative queue numbers or series badge
    expect(markup).toContain('Regular');
    expect(markup).toContain('Senior &amp; PWD Priority');
    expect(markup).not.toContain('Preview: P-001');
    expect(markup).not.toContain('Preview: Q-001');
    expect(markup).not.toContain('Regular Series');
  });

  test('27. buildThermalQueueTicketHtml generates compliant POS 80mm roll HTML with prominent queue number', async () => {
    const { buildThermalQueueTicketHtml } = await import('../utils/receiptHtml');
    const html = buildThermalQueueTicketHtml(
      {
        queueNumber: 'Q-002',
        patientName: 'Agcaoili, Banahaw V.',
        serviceType: 'Doctor Consultation',
        patientCode: 'PAT-2026-00454',
        demographics: '56 yrs, 2 mos, 1 wk, 6 days • Male • Married • Blood type ABPositive',
        priorityLabel: 'Regular Queue Series',
        issuedAt: 'Nov 1, 2026 • 6:30 PM',
      },
      {
        header: 'METRO MANILA WELLNESS CLINIC',
        subHeader: 'Outpatient Clinical Department',
        address: '45 J.P. Laurel Ave, Manila',
      }
    );

    // Thermal roll standard styles
    expect(html).toContain('@page');
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('width: 72mm');
    expect(html).toContain('QUEUE TICKET');

    // Content verification
    expect(html).toContain('METRO MANILA WELLNESS CLINIC');
    expect(html).toContain('45 J.P. Laurel Ave, Manila');
    expect(html).toContain('Q-002');
    expect(html).toContain('Agcaoili, Banahaw V.');
    expect(html).toContain('PAT-2026-00454');
    expect(html).toContain('Doctor Consultation');
    expect(html).toContain('Regular Queue Series');
    expect(html).toContain('Nov 1, 2026 • 6:30 PM');
    expect(html).toContain('Please wait for your number to be called.');
  });

  test('28. ServiceCheckInModal includes an icon-only thermal paper print button on post-queue dialog', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const componentCode = readFileSync(join(__dirname, '../components/patient/ServiceCheckInModal.tsx'), 'utf-8');

    // Verifies printThermalQueueTicket is imported
    expect(componentCode).toContain('printThermalQueueTicket');

    // Verifies the icon-only print button in postQueueActions
    expect(componentCode).toContain('testID="post-queue-print-button"');
    expect(componentCode).toContain('icon="print"');
    expect(componentCode).toContain('iconOnly={true}');
    expect(componentCode).toContain('accessibilityLabel="Print thermal queue ticket"');
  });

  test('29. ScheduleVisitModal uses ValidatedDateInput with calendar picker icon and boundary validation', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const componentCode = readFileSync(join(__dirname, '../components/patient/ScheduleVisitModal.tsx'), 'utf-8');

    // Verifies ValidatedDateInput is imported and used
    expect(componentCode).toContain('ValidatedDateInput');
    expect(componentCode).toContain('<ValidatedDateInput');
    expect(componentCode).toContain('label="Scheduled Date (YYYY-MM-DD)"');
    expect(componentCode).toContain('boundaryMode="futureOrToday"');
    expect(componentCode).toContain('testID="schedule-visit-date-input"');
  });

  test('30. buildPatientOverflowMenuItems supports direct clinical action handlers and Yakap FPE profiling when accredited', () => {
    let consultationTriggered = false;
    let profilingTriggered = false;
    let vitalsTriggered = false;
    let procedureTriggered = false;
    let clearanceTriggered = false;

    const items = buildPatientOverflowMenuItems(basePatient, {
      hasPhilHealthAccreditation: true,
      onStartConsultation: () => { consultationTriggered = true; },
      onStartProfiling: () => { profilingTriggered = true; },
      onRecordVitals: () => { vitalsTriggered = true; },
      onPerformProcedure: () => { procedureTriggered = true; },
      onIssueClearance: () => { clearanceTriggered = true; },
    });

    const labels = items.map((i) => i.label);
    expect(labels).toContain('Consult');
    expect(labels).toContain('Health screening');
    expect(labels).toContain('Vitals');
    expect(labels).toContain('Start procedure');
    expect(labels).toContain('Medical certificate');
    expect(items.every((i) => i.hint === undefined)).toBe(true);

    items.find((i) => i.id === 'service-consultation')!.onPress();
    expect(consultationTriggered).toBe(true);

    items.find((i) => i.id === 'start-profiling')!.onPress();
    expect(profilingTriggered).toBe(true);

    items.find((i) => i.id === 'service-vitals')!.onPress();
    expect(vitalsTriggered).toBe(true);

    items.find((i) => i.id === 'service-procedure')!.onPress();
    expect(procedureTriggered).toBe(true);

    items.find((i) => i.id === 'service-administrative')!.onPress();
    expect(clearanceTriggered).toBe(true);
  });

  test('31. buildPatientOverflowMenuItems omits Yakap FPE profiling when clinic is not accredited and patient has no PIN', () => {
    const unaccreditedPatient = { ...basePatient, philHealthNumber: null };
    const items = buildPatientOverflowMenuItems(unaccreditedPatient, {
      hasPhilHealthAccreditation: false,
      onStartConsultation: () => {},
      onStartProfiling: () => {},
      onRecordVitals: () => {},
      onPerformProcedure: () => {},
      onIssueClearance: () => {},
    });

    const labels = items.map((i) => i.label);
    expect(labels).toContain('Consult');
    expect(labels).not.toContain('Health screening');
  });

  test('32. ConsultationTypeModal renders concise patient subtitle and plain-language choice cards without demographic banner or jargon', async () => {
    const { default: ConsultationTypeModal } = await import('../components/patient/ConsultationTypeModal');
    let selectedProgram: string | null = null;
    let closed = false;

    const patientWithPin = {
      ...basePatient,
      philHealthNumber: '11-578958036-9',
    };

    const markup = renderToStaticMarkup(
      React.createElement(ConsultationTypeModal, {
        visible: true,
        patient: patientWithPin,
        onClose: () => { closed = true; },
        onSelectType: (type) => { selectedProgram = type; },
      })
    );

    expect(markup).toContain('Start Consultation');
    expect(markup).toContain(patientWithPin.fullName);
    expect(markup).toContain('Which consultation would the patient like to avail?');
    expect(markup).not.toContain('PAT-20261013-3EFFEA');
    expect(markup).not.toContain('PhilHealth PIN: 11-578958036-9');
    expect(markup).not.toContain('Standard Care');
    expect(markup).not.toContain('statutory');
    expect(markup).not.toContain('SOAP');
    expect(markup).toContain('Regular Consultation');
    expect(markup).toContain('PhilHealth Yakap Consultation');
    expect(markup).toContain('Cancel');
  });

  test('33. Patients.screen.tsx integrates direct clinical actions, ConsultationTypeModal, and RecordVitalsModal', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const code = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // Handlers and headless encounter tracking for clinic census
    expect(code).toContain('ensureEncounterQueueItem');
    expect(code).toContain('handleStartConsultationAction');
    expect(code).toContain('handleStartProfilingAction');
    expect(code).toContain('handleRecordVitalsAction');
    expect(code).toContain('handlePerformProcedureAction');
    expect(code).toContain('handleIssueClearanceAction');
    expect(code).toContain('handleVitalsRecorded');

    // Accreditation gating
    expect(code).toContain('accreditationNumber');
    expect(code).toContain('hasPhilHealthAccreditation');

    // Modals rendered
    expect(code).toContain('<ConsultationTypeModal');
    expect(code).toContain('<RecordVitalsModal');
  });

  test('34. Patients.screen.tsx strictly uses canonical VisitType enum values in headless check-in', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const code = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // ensureEncounterQueueItem parameter is strongly typed to VisitType
    expect(code).toContain('visitType: VisitType;');

    // Direct actions strictly use backend-supported VisitType enum strings
    expect(code).toContain("const visitType: VisitType = 'Consultation';");
    expect(code).toContain("visitType: 'VitalsCheckOnly'");
    expect(code).toContain("visitType: 'StandaloneProcedure'");
    expect(code).toContain("visitType: 'AdministrativeDocument'");

    // Must not use unmapped domain names as visitType
    expect(code).not.toContain("visitType: 'WalkInConsultation'");
    expect(code).not.toContain("visitType = 'WalkInConsultation'");
    expect(code).not.toContain("visitType: 'PhilHealthKonsulta'");
    expect(code).not.toContain("visitType: 'VitalsCheck'");
    expect(code).not.toContain("visitType: 'ClinicalProcedure'");
    expect(code).not.toContain("visitType: 'Administrative'");
  });

  test('35. ServiceCheckInModal forces allowDuplicateActive=true on conflict confirmation', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const modalCode = readFileSync(join(__dirname, '../components/patient/ServiceCheckInModal.tsx'), 'utf-8');

    // Verifies that basePayload from overridePayload preserves allowDuplicate parameter
    expect(modalCode).toContain('const basePayload = overridePayload ||');
    expect(modalCode).toContain('allowDuplicateActive: allowDuplicate');
    expect(modalCode).toContain('handleConfirm(conflictWarning.payload, true)');

    // Ensure Patients.screen.tsx forwards allowDuplicateActive in handleConfirmServiceCheckIn
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');
    expect(screenCode).toContain('handleConfirmServiceCheckIn = async (payload: ServiceCheckInPayload)');
    expect(screenCode).toContain('...payload');
  });

  test('36. PatientDirectoryCard displays multi-ticket indicator on badge and CTA when multiple tickets active', () => {
    const multiTicketPatient: ClinicPatient = {
      ...basePatient,
      activeQueueTicket: 'Q-001',
      activeQueueTickets: [
        { queueNumber: 'Q-001', status: 'Waiting', visitType: 'Consultation' },
        { queueNumber: 'Q-004', status: 'Waiting', visitType: 'Consultation' },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientDirectoryCard, {
        patient: multiTicketPatient,
        mode: 'card',
        onOpenChart: () => {},
        onQueuePatient: () => {},
        onScheduleVisit: () => {},
      })
    );

    // Redundant queue badge removed because primary action button already shows ticket status
    expect(markup).not.toContain('In Queue • Q-001 (+1)');

    // Multi-ticket primary action button indicator (+1)
    expect(markup).toContain('Queued (Q-001 +1)');
  });

  test('37. ServiceCheckInModal renders restyled active queue dialog with human-readable statuses, non-redundant details, and request summary', () => {
    const conflictPatient: ClinicPatient = {
      ...basePatient,
      activeQueueTicket: 'Q-001',
    };

    const markup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: conflictPatient,
        onClose: () => {},
        onSuccess: () => {},
        initialConflictWarning: {
          queueNumber: 'Q-001',
          status: 'InConsultation',
          patientName: conflictPatient.fullName,
          activeTickets: [
            { queueNumber: 'Q-001', status: 'InConsultation', visitType: 'Consultation', chiefComplaint: 'Doctor Consultation' },
            { queueNumber: 'Q-004', status: 'Waiting', visitType: 'Consultation', chiefComplaint: 'Fever and cough' },
          ],
          payload: {
            patientId: conflictPatient.id,
            patientName: conflictPatient.fullName,
            visitType: 'Consultation',
            priority: 'Routine',
            chiefComplaint: 'Doctor Consultation',
            seriesPrefix: 'Q',
          },
        },
      })
    );

    expect(markup).toContain('Patient Already in Queue');
    expect(markup).toContain('This patient already has 2 active tickets today.');
    expect(markup).toContain('Do you want to continue and add a new Doctor Consultation ticket?');
    expect(markup).toContain('conflict-tickets-list');
    expect(markup).toContain('Q-001');
    expect(markup).toContain('Q-004');
    // Human-readable clinical status badge instead of raw PascalCase InConsultation
    expect(markup).toContain('In Consultation');
    expect(markup).not.toContain('InConsultation');
    expect(markup).toContain('With doctor');
    expect(markup).toContain('Fever and cough');
    // Direct question-driven confirmation CTA without series code badge or duplicate box
    expect(markup).not.toContain('Regular (Q)');
    expect(markup).toContain('Yes, add new ticket');
    expect(markup).toContain('Go back');
  });

  test('38. QueueTicketPickerModal renders concise patient subtitle, active ticket list, and action buttons without demographic banner', () => {
    let selectedTicket: any = null;
    let newTicketClicked = false;
    let closed = false;

    const tickets = [
      { id: 'item-1', queueNumber: 'Q-001', status: 'InConsultation', visitType: 'Consultation', chiefComplaint: 'Cough and colds' },
      { id: 'item-2', queueNumber: 'Q-004', status: 'Waiting', visitType: 'Consultation', chiefComplaint: 'Hypertension follow-up' },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(QueueTicketPickerModal, {
        visible: true,
        patient: basePatient,
        tickets,
        serviceTitle: 'Doctor Consultation',
        onSelectTicket: (t: any) => { selectedTicket = t; },
        onCreateNewTicket: () => { newTicketClicked = true; },
        onClose: () => { closed = true; },
      })
    );

    expect(markup).toContain('Select Queue Ticket');
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).not.toContain('PAT-20261013-3EFFEA');
    expect(markup).toContain('This patient has 2 active tickets. Which ticket would you like to use?');
    expect(markup).toContain('Q-001');
    expect(markup).toContain('Q-004');
    expect(markup).toContain('In Consultation');
    expect(markup).not.toContain('InConsultation');
    expect(markup).toContain('Cough and colds');
    expect(markup).toContain('Hypertension follow-up');
    expect(markup).toContain('Add new ticket');
    expect(markup).toContain('Cancel');
  });

  test('39. Patients.screen.tsx integrates QueueTicketPickerModal for encounter selection when ≥2 tickets active', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const code = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // Component import and modal state
    expect(code).toContain('import QueueTicketPickerModal');
    expect(code).toContain('ticketPickerState');
    expect(code).toContain('<QueueTicketPickerModal');

    // Matching items filtering logic
    expect(code).toContain('matchingItems.length >= 2');
    expect(code).toContain('multipleOptions: matchingItems');

    // Action handlers using picker for ≥2 tickets
    expect(code).toContain('startConsultationWithQueueItem');
    expect(code).toContain('setTicketPickerState');
  });

  test('40. formatQueueStatusMeta, formatVisitTypeMeta, and formatTicketSubtext eliminate raw enums and redundant labels', () => {
    expect(formatQueueStatusMeta('InConsultation')).toEqual({
      label: 'In Consultation',
      variant: 'info',
      icon: 'stethoscope',
    });
    expect(formatQueueStatusMeta('Waiting')).toEqual({
      label: 'Waiting',
      variant: 'routine',
      icon: 'clock',
    });
    expect(formatQueueStatusMeta('InTriage').label).toBe('In Triage');

    expect(formatVisitTypeMeta('Consultation').label).toBe('Doctor Consultation');
    expect(formatVisitTypeMeta('VitalsCheckOnly').label).toBe('Vitals Check');
    expect(formatVisitTypeMeta('StandaloneProcedure').label).toBe('Clinical Procedure');
    expect(formatVisitTypeMeta('AdministrativeDocument').label).toBe('Administrative & Clearance');

    // Deduplicates generic service label stored in chiefComplaint
    expect(
      formatTicketSubtext(
        { visitType: 'Consultation', chiefComplaint: 'Doctor Consultation', status: 'InConsultation' },
        'Doctor Consultation'
      )
    ).toBe('With doctor');

    // Preserves distinct clinical chief complaint and assigned clinician
    expect(
      formatTicketSubtext(
        { visitType: 'Consultation', chiefComplaint: 'Acute migraine', doctorName: 'Maria Santos', status: 'Waiting' },
        'Doctor Consultation'
      )
    ).toBe('Acute migraine • Dr. Maria Santos');
  });

  test('41. Compact Table header and rows enforce strict zero-basis flex columns and fixed-width actions column for exact column alignment', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cardSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/patient/PatientDirectoryCard.tsx'),
      'utf8'
    );
    // Data columns 1-4 must use flexBasis: 0 and minWidth: 0 so intrinsic content never shifts column boundaries
    expect(cardSrc).toMatch(/tableColIdentity:\s*\{[\s\S]*?flexBasis:\s*0[\s\S]*?minWidth:\s*0/);
    expect(cardSrc).toMatch(/tableColDemographics:\s*\{[\s\S]*?flexBasis:\s*0[\s\S]*?minWidth:\s*0/);
    expect(cardSrc).toMatch(/tableColContact:\s*\{[\s\S]*?flexBasis:\s*0[\s\S]*?minWidth:\s*0/);
    expect(cardSrc).toMatch(/tableColAlerts:\s*\{[\s\S]*?flexBasis:\s*0[\s\S]*?minWidth:\s*0/);
    // Actions column must use identical fixed width in header and rows
    expect(cardSrc).toMatch(/tableColActions:\s*\{[\s\S]*?width:\s*396[\s\S]*?flexGrow:\s*0[\s\S]*?flexShrink:\s*0/);
  });

  test('42. Patient Directory toolbar keeps single-row no-wrap scrollable filter tabs and icon-only Cards/Table switcher', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { default: SegmentedControl } = await import('../components/ui/SegmentedControl');

    const screenSrc = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx'),
      'utf8'
    );
    const segmentedSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/ui/SegmentedControl.tsx'),
      'utf8'
    );

    // Toolbar row must never wrap view toggle below tabs; tabs container shrinks & scrolls horizontally
    expect(screenSrc).toMatch(/toolbarRow:\s*\{[\s\S]*?flexWrap:\s*'nowrap'[\s\S]*?minWidth:\s*0/);
    expect(screenSrc).toMatch(/toolbarTabs:\s*\{[\s\S]*?flex:\s*1[\s\S]*?minWidth:\s*0/);
    expect(screenSrc).toMatch(/toolbarRight:\s*\{[\s\S]*?flexShrink:\s*0/);

    // SegmentedControl scroll + group + segment enforce no-wrap horizontal overflow
    expect(segmentedSrc).toMatch(/scroll:\s*\{[\s\S]*?flexShrink:\s*1[\s\S]*?minWidth:\s*0[\s\S]*?maxWidth:\s*'100%'/);
    expect(segmentedSrc).toMatch(/group:\s*\{[\s\S]*?flexWrap:\s*'nowrap'[\s\S]*?flexShrink:\s*0/);
    expect(segmentedSrc).toMatch(/segment:\s*\{[\s\S]*?flexWrap:\s*'nowrap'[\s\S]*?flexShrink:\s*0/);

    // View mode switcher uses icon-only options (grid & list) without visible text labels
    expect(screenSrc).toMatch(/value:\s*'cards',\s*label:\s*'Cards view',\s*icon:\s*'grid',\s*iconOnly:\s*true/);
    expect(screenSrc).toMatch(/value:\s*'table',\s*label:\s*'Compact table view',\s*icon:\s*'list',\s*iconOnly:\s*true/);
    expect(screenSrc).not.toContain("{ value: 'table', label: 'Compact Table' }");

    // SSR markup renders SVG icons & accessible labels while omitting visible label text when iconOnly is true
    const toggleMarkup = renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        value: 'table',
        onChange: () => {},
        options: [
          { value: 'cards', label: 'Cards view', icon: 'grid', iconOnly: true },
          { value: 'table', label: 'Compact table view', icon: 'list', iconOnly: true },
        ],
      })
    );
    expect(toggleMarkup).toContain('lucide-layout-grid');
    expect(toggleMarkup).toContain('lucide-list');
    expect(toggleMarkup).toContain('aria-label="Cards view"');
    expect(toggleMarkup).toContain('aria-label="Compact table view"');
    expect(toggleMarkup).not.toContain('>Cards view<');
    expect(toggleMarkup).not.toContain('>Compact table view<');
  });
});

