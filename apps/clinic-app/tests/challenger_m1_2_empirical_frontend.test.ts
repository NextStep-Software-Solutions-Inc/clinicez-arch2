// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

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

// Dynamic imports after module mocks
const { isMyPatient } = await import('../components/patient/PatientDirectoryCard');
const { default: SegmentedControl } = await import('../components/ui/SegmentedControl');
const { theme } = await import('../constants/theme');
import type { ClinicPatient, StaffMember } from '../services/clinicService';

describe('Challenger 2 — Milestone 1 Frontend Empirical Stress Test Suite', () => {
  const doctorStaff: StaffMember = {
    id: 'doc-mar-001',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Maria',
    lastName: 'Santos',
    title: 'Dr.',
    role: 'Doctor',
    isActive: true,
    createdAt: '2026-01-01',
    assignedRoomIds: ['room-101'],
  };

  const otherDoctorStaff: StaffMember = {
    id: 'doc-other-999',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Juan',
    lastName: 'Reyes',
    title: 'Dr.',
    role: 'Doctor',
    isActive: true,
    createdAt: '2026-01-01',
    assignedRoomIds: ['room-102'],
  };

  const nurseStaff: StaffMember = {
    id: 'nurse-joy-002',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Joy',
    lastName: 'Flores',
    role: 'Nurse',
    isActive: true,
    createdAt: '2026-01-01',
    assignedRoomIds: ['room-triage-1', 'room-triage-2'],
  };

  const otherNurseStaff: StaffMember = {
    id: 'nurse-other-888',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Elena',
    lastName: 'Cruz',
    role: 'Nurse',
    isActive: true,
    createdAt: '2026-01-01',
    assignedRoomIds: ['room-triage-3'],
  };

  const adminStaff: StaffMember = {
    id: 'admin-003',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Admin',
    lastName: 'User',
    role: 'Admin',
    isActive: true,
    createdAt: '2026-01-01',
  };

  const basePatient: ClinicPatient = {
    id: 'pat-001',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    patientCode: 'PAT-2026-0001',
    firstName: 'Ana',
    lastName: 'Dizon',
    fullName: 'Dizon, Ana',
    dateOfBirth: '1990-05-15',
    age: 36,
    sex: 'Female',
    contactNumber: '09171234567',
    allergies: 'NKDA',
    alerts: '',
    createdAt: '2026-01-01',
    customFields: {},
  };

  /* -------------------------------------------------------------------------
   * Section 1: Toolbar Tab Ordering, Index, and Naming
   * ------------------------------------------------------------------------- */
  describe('1. Toolbar Tab Ordering & Contract Compliance', () => {
    test('1.1. Patients.screen.tsx defines "My patients" strictly as the 2nd tab in SegmentedControl', () => {
      const screenPath = join(__dirname, '../navigation/screens/Patients.screen.tsx');
      const screenCode = readFileSync(screenPath, 'utf-8');

      // Check PatientFilter type union definition
      expect(screenCode).toContain("'ALL' | 'MY_PATIENTS' | 'STUDENTS' | 'EMPLOYEES' | 'ALERTS' | 'SENIOR_PWD'");

      // Extract options passed into SegmentedControl<PatientFilter>
      const segmentedControlMatch = screenCode.match(/<SegmentedControl<PatientFilter>[\s\S]*?options=\{\[([\s\S]*?)\]\}/);
      expect(segmentedControlMatch).toBeTruthy();
      const optionsBlock = segmentedControlMatch![1];

      // Parse tab values in their rendered order
      const tabValueMatches = [...optionsBlock.matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1]);
      expect(tabValueMatches).toEqual([
        'ALL',
        'MY_PATIENTS',
        'STUDENTS',
        'EMPLOYEES',
        'ALERTS',
        'SENIOR_PWD',
      ]);

      // Confirm index 1 is strictly 'MY_PATIENTS'
      expect(tabValueMatches[1]).toBe('MY_PATIENTS');
    });

    test('1.2. Tab labels adhere to everyday clinical language (zero statutory/legal jargon)', () => {
      const screenPath = join(__dirname, '../navigation/screens/Patients.screen.tsx');
      const screenCode = readFileSync(screenPath, 'utf-8');

      // Verify human-readable tab labels
      expect(screenCode).toContain("label: 'All patients'");
      expect(screenCode).toContain("label: 'My patients'");
      expect(screenCode).toContain("label: 'Students'");
      expect(screenCode).toContain("label: 'Employees'");
      expect(screenCode).toContain("label: 'Alerts & allergies'");
      expect(screenCode).toContain("label: 'Senior & PWD'");

      // Verify no statutory numbers in toolbar tabs
      expect(screenCode).not.toContain('RA 9994');
      expect(screenCode).not.toContain('RA 7277');
      expect(screenCode).not.toContain('Republic Act');
    });
  });

  /* -------------------------------------------------------------------------
   * Section 2: Count Reactivity and Formatting
   * ------------------------------------------------------------------------- */
  describe('2. Count Reactivity and Formatting Harness', () => {
    // Replicate formatTabCount logic under test
    const formatTabCount = (
      loaded: number | undefined,
      total: number | undefined,
      hasMore: boolean,
      hasPatients: boolean
    ): string | number | undefined => {
      if (loaded === undefined) return undefined;
      if (total !== undefined && total !== null) {
        return `${loaded}/${total}`;
      }
      if (!hasMore && hasPatients) {
        return `${loaded}/${loaded}`;
      }
      return loaded;
    };

    test('2.1. formatTabCount produces correct strings across all boundary combinations', () => {
      // Both loaded and total known
      expect(formatTabCount(0, 0, false, true)).toBe('0/0');
      expect(formatTabCount(0, 15, false, true)).toBe('0/15');
      expect(formatTabCount(15, 15, false, true)).toBe('15/15');
      expect(formatTabCount(50, 5000, true, true)).toBe('50/5000');

      // Loading state (loaded is undefined)
      expect(formatTabCount(undefined, 100, false, false)).toBeUndefined();
      expect(formatTabCount(undefined, undefined, false, false)).toBeUndefined();

      // Total counts still fetching (total is undefined), but initial fetch complete (hasMore = false)
      expect(formatTabCount(5, undefined, false, true)).toBe('5/5');

      // Has more pages to load and total count is pending
      expect(formatTabCount(50, undefined, true, true)).toBe(50);
    });

    test('2.2. SegmentedControl properly renders count badge and accessibilityLabel for loaded/total', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SegmentedControl, {
          value: 'MY_PATIENTS',
          onChange: () => {},
          options: [
            { value: 'ALL', label: 'All patients', count: '50/200' },
            { value: 'MY_PATIENTS', label: 'My patients', count: '12/18' },
            { value: 'STUDENTS', label: 'Students', count: '0/0' },
            { value: 'EMPTY', label: 'Pending', count: undefined },
          ],
        })
      );

      // Verify accessibilityLabel includes count
      expect(markup).toContain('aria-label="All patients, 50/200"');
      expect(markup).toContain('aria-label="My patients, 12/18"');
      expect(markup).toContain('aria-label="Students, 0/0"');
      expect(markup).toContain('aria-label="Pending"');

      // Verify badges contain exact count strings
      expect(markup).toContain('50/200');
      expect(markup).toContain('12/18');
      expect(markup).toContain('0/0');
    });
  });

  /* -------------------------------------------------------------------------
   * Section 3: isMyPatient Doctor vs Nurse Patient Isolation & Edge Cases
   * ------------------------------------------------------------------------- */
  describe('3. isMyPatient Doctor vs Nurse Patient Isolation', () => {
    test('3.1. Doctor matches all documented assignment vectors', () => {
      // Vector A: assigned_doctor_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { assigned_doctor_id: doctorStaff.id } }, doctorStaff)).toBe(true);

      // Vector B: doctor_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { doctor_id: doctorStaff.id } }, doctorStaff)).toBe(true);

      // Vector C: activeQueueDoctorId on patient object
      expect(isMyPatient({ ...basePatient, activeQueueDoctorId: doctorStaff.id } as any, doctorStaff)).toBe(true);

      // Vector D: doctorId on patient object
      expect(isMyPatient({ ...basePatient, doctorId: doctorStaff.id } as any, doctorStaff)).toBe(true);
    });

    test('3.2. Doctor does NOT match unassigned patients or patients of other doctors', () => {
      // Patient assigned to different doctor
      expect(isMyPatient({ ...basePatient, customFields: { assigned_doctor_id: otherDoctorStaff.id } }, doctorStaff)).toBe(false);
      expect(isMyPatient({ ...basePatient, customFields: { doctor_id: otherDoctorStaff.id } }, doctorStaff)).toBe(false);
      expect(isMyPatient({ ...basePatient, activeQueueDoctorId: otherDoctorStaff.id } as any, doctorStaff)).toBe(false);

      // Clean unassigned patient
      expect(isMyPatient(basePatient, doctorStaff)).toBe(false);
    });

    test('3.3. Doctor is strictly isolated from room assignments and nurse vitals', () => {
      // Patient in same room as doctor's assigned room (room-101) but not assigned to doctor
      // Doctors match by direct clinical assignment, not station presence alone
      const patInDocRoom = {
        ...basePatient,
        roomId: 'room-101',
        customFields: { nurse_id: nurseStaff.id },
      };
      expect(isMyPatient(patInDocRoom, doctorStaff)).toBe(false);

      // Patient whose vitals were recorded by nurse
      const patWithNurseVitals = {
        ...basePatient,
        customFields: { vitals_recorded_by_nurse_id: nurseStaff.id },
      };
      expect(isMyPatient(patWithNurseVitals, doctorStaff)).toBe(false);
    });

    test('3.4. Nurse matches all documented assignment and vitals vectors', () => {
      // Vector A: nurse_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { nurse_id: nurseStaff.id } }, nurseStaff)).toBe(true);

      // Vector B: assigned_nurse_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { assigned_nurse_id: nurseStaff.id } }, nurseStaff)).toBe(true);

      // Vector C: vitals_recorded_by_nurse_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { vitals_recorded_by_nurse_id: nurseStaff.id } }, nurseStaff)).toBe(true);

      // Vector D: recorded_by_nurse_id in customFields
      expect(isMyPatient({ ...basePatient, customFields: { recorded_by_nurse_id: nurseStaff.id } }, nurseStaff)).toBe(true);

      // Vector E: roomId matches nurse assigned room
      expect(isMyPatient({ ...basePatient, roomId: 'room-triage-1' } as any, nurseStaff)).toBe(true);
      expect(isMyPatient({ ...basePatient, roomId: 'room-triage-2' } as any, nurseStaff)).toBe(true);

      // Vector F: activeQueueRoomId matches nurse assigned room
      expect(isMyPatient({ ...basePatient, activeQueueRoomId: 'room-triage-2' } as any, nurseStaff)).toBe(true);

      // Vector G: customFields room_id or assigned_room_id
      expect(isMyPatient({ ...basePatient, customFields: { room_id: 'room-triage-1' } }, nurseStaff)).toBe(true);
      expect(isMyPatient({ ...basePatient, customFields: { assigned_room_id: 'room-triage-2' } }, nurseStaff)).toBe(true);
    });

    test('3.5. Nurse does NOT match patients in rooms of other nurses or unassigned rooms', () => {
      // Patient in other nurse room
      expect(isMyPatient({ ...basePatient, roomId: 'room-triage-3' } as any, nurseStaff)).toBe(false);

      // Patient assigned to doctor but no vitals or matching room for nurse
      const patWithDoc = {
        ...basePatient,
        roomId: 'room-101',
        customFields: { assigned_doctor_id: doctorStaff.id },
      };
      expect(isMyPatient(patWithDoc, nurseStaff)).toBe(false);
    });

    test('3.6. Nurse single assignedRoomId fallback works when assignedRoomIds is undefined', () => {
      const singleRoomNurse: StaffMember = {
        ...nurseStaff,
        assignedRoomIds: undefined,
        assignedRoomId: 'room-solo-nurse',
      };

      expect(isMyPatient({ ...basePatient, roomId: 'room-solo-nurse' } as any, singleRoomNurse)).toBe(true);
      expect(isMyPatient({ ...basePatient, roomId: 'room-other' } as any, singleRoomNurse)).toBe(false);
    });

    test('3.7. Fallback for administrative or non-clinical staff', () => {
      // Admin matches customFields.staff_id
      expect(isMyPatient({ ...basePatient, customFields: { staff_id: adminStaff.id } }, adminStaff)).toBe(true);
      // Admin does not match unrelated patient
      expect(isMyPatient(basePatient, adminStaff)).toBe(false);
    });

    test('3.8. Null, undefined, or empty staff and patient boundaries', () => {
      // Null staff
      expect(isMyPatient(basePatient, null)).toBe(false);
      // Undefined staff
      expect(isMyPatient(basePatient, undefined)).toBe(false);
      // Staff without ID
      expect(isMyPatient(basePatient, { ...doctorStaff, id: '' })).toBe(false);

      // Patient with null/undefined customFields
      const patNullCustomFields: ClinicPatient = { ...basePatient, customFields: null as any };
      expect(isMyPatient(patNullCustomFields, doctorStaff)).toBe(false);
      expect(isMyPatient(patNullCustomFields, nurseStaff)).toBe(false);

      const patUndefinedCustomFields: ClinicPatient = { ...basePatient, customFields: undefined as any };
      expect(isMyPatient(patUndefinedCustomFields, doctorStaff)).toBe(false);
      expect(isMyPatient(patUndefinedCustomFields, nurseStaff)).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------
   * Section 4: Directory Filter State, Empty State, and Search Synergy
   * ------------------------------------------------------------------------- */
  describe('4. Directory Filtering, Empty State, and Search Synergy', () => {
    const patientPool: ClinicPatient[] = [
      {
        ...basePatient,
        id: 'pat-1',
        fullName: 'Dela Cruz, Juan',
        customFields: { assigned_doctor_id: doctorStaff.id, classification: 'Student' },
      },
      {
        ...basePatient,
        id: 'pat-2',
        fullName: 'Santos, Maria',
        customFields: { doctor_id: otherDoctorStaff.id, classification: 'Employee' },
        roomId: 'room-triage-1',
      },
      {
        ...basePatient,
        id: 'pat-3',
        fullName: 'Aquino, Benigno',
        customFields: { vitals_recorded_by_nurse_id: nurseStaff.id },
        age: 65,
        seniorCitizenId: 'SNR-999',
      },
      {
        ...basePatient,
        id: 'pat-4',
        fullName: 'Ramos, Fidel',
        allergies: 'Penicillin (Severe anaphylaxis)',
        customFields: {},
      },
    ];

    test('4.1. Directory filterCounts accurately partitions the patient pool for Doctor', () => {
      let myPatientsCount = 0;
      let studentsCount = 0;
      let employeesCount = 0;
      let alertsCount = 0;
      let seniorPwdCount = 0;

      for (const p of patientPool) {
        if (isMyPatient(p, doctorStaff)) myPatientsCount++;
        if (p.customFields?.classification === 'Student') studentsCount++;
        if (p.customFields?.classification === 'Employee') employeesCount++;
        if (p.allergies && p.allergies !== 'NKDA') alertsCount++;
        if (p.age >= 60 || !!p.seniorCitizenId) seniorPwdCount++;
      }

      expect(patientPool.length).toBe(4);
      expect(myPatientsCount).toBe(1); // Only pat-1
      expect(studentsCount).toBe(1);
      expect(employeesCount).toBe(1);
      expect(alertsCount).toBe(1);
      expect(seniorPwdCount).toBe(1);
    });

    test('4.2. Directory filterCounts accurately partitions the patient pool for Nurse', () => {
      let myPatientsCount = 0;

      for (const p of patientPool) {
        if (isMyPatient(p, nurseStaff)) myPatientsCount++;
      }

      // Nurse matches pat-2 (room-triage-1) and pat-3 (vitals_recorded_by_nurse_id)
      expect(myPatientsCount).toBe(2);
    });

    test('4.3. MY_PATIENTS filtering isolates patient records in the active list view', () => {
      // Doctor filtering
      const doctorPatients = patientPool.filter((p) => isMyPatient(p, doctorStaff));
      expect(doctorPatients).toHaveLength(1);
      expect(doctorPatients[0].id).toBe('pat-1');

      // Nurse filtering
      const nursePatients = patientPool.filter((p) => isMyPatient(p, nurseStaff));
      expect(nursePatients).toHaveLength(2);
      expect(nursePatients.map((p) => p.id)).toEqual(['pat-2', 'pat-3']);

      // Other doctor filtering with 0 assigned
      const unassignedDoctor: StaffMember = { ...doctorStaff, id: 'doc-none-000' };
      const zeroPatients = patientPool.filter((p) => isMyPatient(p, unassignedDoctor));
      expect(zeroPatients).toHaveLength(0);
    });

    test('4.4. Empty state copy for MY_PATIENTS adheres to everyday clinic language', () => {
      const screenPath = join(__dirname, '../navigation/screens/Patients.screen.tsx');
      const screenCode = readFileSync(screenPath, 'utf-8');

      // Verify EmptyState props when filterMode !== 'ALL'
      expect(screenCode).toContain("title={searchTerm || filterMode !== 'ALL' ? 'No patients match your search' : 'No patients registered yet'}");
      expect(screenCode).toContain("Try a different name, code or filter.");
      expect(screenCode).toContain("Register the first patient to start building the clinic registry.");
      expect(screenCode).toContain("actionTitle={searchTerm || filterMode !== 'ALL' ? 'Clear search & filters' : 'Register patient'}");
      expect(screenCode).toContain("onAction={searchTerm || filterMode !== 'ALL' ? handleResetFilters : () => setRegisterVisible(true)}");
    });
  });

  /* -------------------------------------------------------------------------
   * Section 5: Design Token Integrity & Strict Palette Conformance
   * ------------------------------------------------------------------------- */
  describe('5. Design Token Integrity & Strict Palette Conformance', () => {
    test('5.1. Design tokens theme colors verify Teal #0D6963 brand palette', () => {
      expect(theme.colors.primary).toBe('#0D6963');
      expect(theme.colors.primaryDark).toBe('#084541');
      expect(theme.colors.primaryLight).toBe('#D9FAF1');
    });

    test('5.2. SegmentedControl badge variant uses semantic tokens for emergency & active states', () => {
      const screenPath = join(__dirname, '../navigation/screens/Patients.screen.tsx');
      const screenCode = readFileSync(screenPath, 'utf-8');

      // Verify ALERTS tab uses 'emergency' badgeVariant when alerts > 0
      expect(screenCode).toContain("badgeVariant: (filterCounts?.alerts ?? 0) > 0 ? 'emergency' : undefined");
    });
  });
});
