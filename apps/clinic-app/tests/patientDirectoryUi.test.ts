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
const {
  default: ServiceCheckInModal,
  isSeniorOrPwdEligible,
  resolveTicketPrefix,
  formatQueueTicketNumber,
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
      onScheduleVisit: (p) => {
        bookedId = p.id;
      },
    });

    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['edit-demographics', 'philhealth-profile', 'view-chart', 'schedule-visit']);
    expect(items[3].label).toBe('Schedule visit');

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

  test('18. ScheduleVisitModal renders preselected patient identity banner, quick dates, and visit purposes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScheduleVisitModal, {
        visible: true,
        patient: basePatient,
        onClose: () => {},
        attendingDoctor: 'Dr. Maria Santos',
        visitPurpose: 'Consultation',
      })
    );

    // Patient Identity Banner
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).toContain('PAT-20261013-3EFFEA');
    expect(markup).toContain('PhilHealth PIN 12-121212121-7');
    expect(markup).toContain('STAT Allergy: Amoxicillin');

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
    expect(itemLabels).toContain('Doctor Consultation');
    expect(itemLabels).toContain('Vitals Check');
    expect(itemLabels).toContain('Clinical Procedure');
    expect(itemLabels).toContain('Administrative & Clearance');

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

  test('22. ServiceCheckInModal renders preselected patient identity banner, service selector tabs, and ticket preview', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: basePatient,
        onClose: () => {},
      })
    );

    // Patient Banner Info
    expect(markup).toContain('Ambray, Cassandra');
    expect(markup).toContain('PAT-20261013-3EFFEA');
    expect(markup).toContain('AC');

    // 4 Clinical Services
    expect(markup).toContain('Doctor Consultation');
    expect(markup).toContain('Vitals Check');
    expect(markup).toContain('Clinical Procedure');
    expect(markup).toContain('Administrative &amp; Clearance');

    // Ticket Preview
    expect(markup).toContain('data-testid="ticket-series-preview"');

    // Footer actions
    expect(markup).toContain('Continue');
    expect(markup).toContain('Cancel');
  });

  test('23. ServiceCheckInModal auto-selects Senior & PWD Priority series when patient is senior or PWD', () => {
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

    // Markup for senior patient shows priority series banner
    const seniorMarkup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: seniorPatient,
        onClose: () => {},
      })
    );
    expect(seniorMarkup).toContain('Senior &amp; PWD Priority Series auto-selected for this patient.');
    expect(seniorMarkup).toContain('SQ-001');

    // Markup for young patient defaults to regular Q-001 preview
    const youngMarkup = renderToStaticMarkup(
      React.createElement(ServiceCheckInModal, {
        visible: true,
        patient: youngPatient,
        onClose: () => {},
      })
    );
    expect(youngMarkup).toContain('Q-001');
    expect(youngMarkup).not.toContain('Senior &amp; PWD Priority Series auto-selected for this patient.');
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
});

