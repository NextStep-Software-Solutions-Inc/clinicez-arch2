// token-guard:ignore-file
// @ts-ignore
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import type {
  ClinicRoom,
  StaffMember,
  PatientQueueItem,
  ScopedStationConfig,
} from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children,
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  computeScopedStations,
  isPatientVisibleToStaff,
  resolveCallToRoom,
  getOtherRoomCoverageText,
  resolveWalkInDoctorRoomSelection,
} = await import('../services/clinicService');

// ============================================================================
// Test Fixtures & Factories
// ============================================================================

function createRoom(overrides: Partial<ClinicRoom> & { id: string; name: string }): ClinicRoom {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? 'Consultation',
    isActive: overrides.isActive ?? true,
    displayOrder: overrides.displayOrder ?? 1,
    tenantId: overrides.tenantId ?? 'tenant-test',
    clinicId: overrides.clinicId ?? 'clinic-test',
    assignedStaffCount: overrides.assignedStaffCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

function createStaff(overrides: Partial<StaffMember> & { id: string; role: StaffMember['role'] }): StaffMember {
  return {
    id: overrides.id,
    tenantId: overrides.tenantId ?? 'tenant-test',
    clinicId: overrides.clinicId ?? 'clinic-test',
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'Staff',
    role: overrides.role,
    assignedRoomIds: overrides.assignedRoomIds ?? [],
    assignedRoomNames: overrides.assignedRoomNames ?? [],
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createQueueTicket(overrides: Partial<PatientQueueItem> & { id: string }): PatientQueueItem {
  return {
    id: overrides.id,
    ticketNumber: overrides.ticketNumber ?? 'Q-001',
    queueNumber: overrides.queueNumber ?? 'Q-001',
    patientId: overrides.patientId ?? 'pat-001',
    patientName: overrides.patientName ?? 'Juan Dela Cruz',
    priority: overrides.priority ?? 'Normal',
    status: overrides.status ?? 'Waiting',
    waitTimeMinutes: overrides.waitTimeMinutes ?? 5,
    checkedInAt: overrides.checkedInAt ?? '2026-10-14T08:00:00Z',
    ...overrides,
  };
}

/**
 * Computes station pill display label identical to Queue.screen.tsx:257 & Consultations.screen.tsx:3124
 */
function getStationPillLabel(room: ClinicRoom, staff: StaffMember | null): string {
  const assignedIds = staff?.assignedRoomIds ?? (staff?.assignedRoomId ? [staff.assignedRoomId] : []);
  const isMine = assignedIds.includes(room.id);
  return isMine ? `${room.name} (Mine)` : room.name;
}

// Standard Clinic Room Setup:
// Room 1 (Consultation), Room 2 (Consultation), Room 3 (Consultation)
// Triage Station (Triage), Treatment Room (Treatment)
const standardRooms: ClinicRoom[] = [
  createRoom({ id: 'room-1', name: 'Room 1', type: 'Consultation', displayOrder: 1 }),
  createRoom({ id: 'room-2', name: 'Room 2', type: 'Consultation', displayOrder: 2 }),
  createRoom({ id: 'room-3', name: 'Room 3', type: 'Consultation', displayOrder: 3 }),
  createRoom({ id: 'room-triage', name: 'Triage Station', type: 'Triage', displayOrder: 4 }),
  createRoom({ id: 'room-tx', name: 'Treatment Room', type: 'Treatment', displayOrder: 5 }),
];

// ============================================================================
// Test Suite 1: Single-Room Doctor Scoping & UI Pill Labels
// ============================================================================

describe('Milestone 2 Challenge 1: Single-Room Doctor Scoping', () => {
  const doctor1 = createStaff({
    id: 'doc-1',
    firstName: 'Maria',
    lastName: 'Santos',
    role: 'Doctor',
    assignedRoomIds: ['room-1'],
    assignedRoomNames: ['Room 1'],
  });

  test('Single-room doctor sees Room 1, Triage, and Treatment, but Room 2 and Room 3 are hidden', () => {
    const config = computeScopedStations(standardRooms, doctor1);

    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-1');
    expect(config.defaultStationName).toBe('Room 1');

    const visibleIds = config.visibleRooms.map((r) => r.id);
    expect(visibleIds).toEqual(['room-1', 'room-triage', 'room-tx']);
    expect(visibleIds.includes('room-2')).toBe(false);
    expect(visibleIds.includes('room-3')).toBe(false);
  });

  test('Single-room doctor UI pill label formatting: Room 1 has (Mine), shared stations do not', () => {
    const config = computeScopedStations(standardRooms, doctor1);
    const pillLabels = config.visibleRooms.map((r) => getStationPillLabel(r, doctor1));

    expect(pillLabels).toEqual([
      'Room 1 (Mine)',
      'Triage Station',
      'Treatment Room',
    ]);
  });

  test('Legacy assignedRoomId (string) behaves identically to assignedRoomIds (array)', () => {
    const legacyDoc = createStaff({
      id: 'doc-legacy',
      role: 'Doctor',
      assignedRoomId: 'room-1',
      assignedRoomIds: undefined,
    });

    const config = computeScopedStations(standardRooms, legacyDoc);
    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-1');
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-triage', 'room-tx']);

    const pillLabels = config.visibleRooms.map((r) => getStationPillLabel(r, legacyDoc));
    expect(pillLabels[0]).toBe('Room 1 (Mine)');
  });

  test('Doctor assigned to non-existent roomId only sees shared stations without phantom rooms', () => {
    const docGhost = createStaff({
      id: 'doc-ghost',
      role: 'Doctor',
      assignedRoomIds: ['room-phantom-999'],
    });

    const config = computeScopedStations(standardRooms, docGhost);
    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-phantom-999');
    expect(config.defaultStationName).toBeUndefined(); // Cannot find name in activeRooms
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-triage', 'room-tx']);
    expect(config.visibleRooms.some((r) => r.id === 'room-phantom-999')).toBe(false);
  });
});

// ============================================================================
// Test Suite 2: Multi-Room Doctor Scoping & UI Pill Labels
// ============================================================================

describe('Milestone 2 Challenge 2: Multi-Room Doctor Scoping', () => {
  const multiDoc = createStaff({
    id: 'doc-multi',
    firstName: 'Alice',
    lastName: 'Cruz',
    role: 'Doctor',
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomNames: ['Room 1', 'Room 2'],
  });

  test('Multi-room doctor sees [Room 1, Room 2, Triage, Treatment] with "All My Stations"; Room 3 is hidden', () => {
    const config = computeScopedStations(standardRooms, multiDoc);

    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-1');
    expect(config.defaultStationName).toBe('Room 1');

    const visibleIds = config.visibleRooms.map((r) => r.id);
    expect(visibleIds).toEqual(['room-1', 'room-2', 'room-triage', 'room-tx']);
    expect(visibleIds.includes('room-3')).toBe(false);
  });

  test('Multi-room doctor renders both assigned rooms with (Mine) while shared stations remain clean', () => {
    const config = computeScopedStations(standardRooms, multiDoc);
    const pillLabels = config.visibleRooms.map((r) => getStationPillLabel(r, multiDoc));

    expect(pillLabels).toEqual([
      'Room 1 (Mine)',
      'Room 2 (Mine)',
      'Triage Station',
      'Treatment Room',
    ]);
  });

  test('Doctor assigned to all consultation rooms in clinic (Room 1, 2, 3) marks all as (Mine)', () => {
    const fullClinicDoc = createStaff({
      id: 'doc-full',
      role: 'Doctor',
      assignedRoomIds: ['room-1', 'room-2', 'room-3'],
      assignedRoomNames: ['Room 1', 'Room 2', 'Room 3'],
    });

    const config = computeScopedStations(standardRooms, fullClinicDoc);
    expect(config.visibleRooms).toHaveLength(5);
    const labels = config.visibleRooms.map((r) => getStationPillLabel(r, fullClinicDoc));
    expect(labels).toEqual([
      'Room 1 (Mine)',
      'Room 2 (Mine)',
      'Room 3 (Mine)',
      'Triage Station',
      'Treatment Room',
    ]);
  });

  test('Multi-room coverage description text accurately summarizes coverage in Room Settings', () => {
    const coverageForRoom1 = getOtherRoomCoverageText(multiDoc, 'room-1', standardRooms, true);
    expect(coverageForRoom1).toBe('Also in Room 2 · Will cover both');

    const coverageForRoom2 = getOtherRoomCoverageText(multiDoc, 'room-2', standardRooms, true);
    expect(coverageForRoom2).toBe('Also in Room 1 · Will cover both');

    const coverageUnselectedRoom3 = getOtherRoomCoverageText(multiDoc, 'room-3', standardRooms, false);
    expect(coverageUnselectedRoom3).toBe('Currently in Room 1, Room 2');
  });
});

// ============================================================================
// Test Suite 3: Assigned Nurse Default to Room[0] & Station Visibility
// ============================================================================

describe('Milestone 2 Challenge 3: Assigned Nurse Scoping & Default on Load', () => {
  const nurseNancy = createStaff({
    id: 'nurse-1',
    firstName: 'Nancy',
    lastName: 'Reyes',
    role: 'Nurse',
    assignedRoomIds: ['room-2'],
    assignedRoomNames: ['Room 2'],
  });

  test('Nurse assigned to Room 2 only sees Room 2 and shared stations, with All Stations pill label', () => {
    const config = computeScopedStations(standardRooms, nurseNancy);

    expect(config.allPillLabel).toBe('All Stations'); // Domain rule: Nurses use "All Stations"
    expect(config.defaultStationId).toBe('room-2');
    expect(config.defaultStationName).toBe('Room 2');

    const visibleIds = config.visibleRooms.map((r) => r.id);
    expect(visibleIds).toEqual(['room-2', 'room-triage', 'room-tx']);
    expect(visibleIds.includes('room-1')).toBe(false);
    expect(visibleIds.includes('room-3')).toBe(false);
  });

  test('Nurse assigned to Room 2 renders Room 2 with (Mine)', () => {
    const config = computeScopedStations(standardRooms, nurseNancy);
    const pillLabels = config.visibleRooms.map((r) => getStationPillLabel(r, nurseNancy));

    expect(pillLabels).toEqual([
      'Room 2 (Mine)',
      'Triage Station',
      'Treatment Room',
    ]);
  });

  test('Nurse defaults to assigned room[0] on initial workstation load (Consultations lifecycle logic)', () => {
    // Simulating component mount logic from Consultations.screen.tsx:322-330
    const activeRooms = standardRooms;
    const current = nurseNancy;

    let selectedStationFilter = 'ALL';
    let queueViewFilter = 'WaitingForDoctor';

    const assignedIds = current.assignedRoomIds ?? (current.assignedRoomId ? [current.assignedRoomId] : []);
    if (current.role === 'Nurse' && assignedIds.length > 0) {
      const assignedRoom = activeRooms.find((r) => r.id === assignedIds[0]);
      if (assignedRoom) {
        selectedStationFilter = assignedRoom.name;
        if (assignedRoom.type === 'Treatment') {
          queueViewFilter = 'PendingProcedure';
        }
      }
    }

    expect(selectedStationFilter).toBe('Room 2');
    expect(queueViewFilter).toBe('WaitingForDoctor');
  });

  test('Nurse assigned to Treatment Room defaults to Treatment Room and switches view to PendingProcedure', () => {
    const procedureNurse = createStaff({
      id: 'nurse-proc',
      role: 'Nurse',
      assignedRoomIds: ['room-tx'],
      assignedRoomNames: ['Treatment Room'],
    });

    const activeRooms = standardRooms;
    const current = procedureNurse;

    let selectedStationFilter = 'ALL';
    let queueViewFilter = 'WaitingForDoctor';

    const assignedIds = current.assignedRoomIds ?? [];
    if (current.role === 'Nurse' && assignedIds.length > 0) {
      const assignedRoom = activeRooms.find((r) => r.id === assignedIds[0]);
      if (assignedRoom) {
        selectedStationFilter = assignedRoom.name;
        if (assignedRoom.type === 'Treatment') {
          queueViewFilter = 'PendingProcedure';
        }
      }
    }

    expect(selectedStationFilter).toBe('Treatment Room');
    expect(queueViewFilter).toBe('PendingProcedure');
  });

  test('Nurse assigned to multiple rooms defaults to room[0]', () => {
    const multiNurse = createStaff({
      id: 'nurse-multi',
      role: 'Nurse',
      assignedRoomIds: ['room-2', 'room-3'],
      assignedRoomNames: ['Room 2', 'Room 3'],
    });

    const config = computeScopedStations(standardRooms, multiNurse);
    expect(config.defaultStationId).toBe('room-2');
    expect(config.defaultStationName).toBe('Room 2');
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-2', 'room-3', 'room-triage', 'room-tx']);
  });
});

// ============================================================================
// Test Suite 4: Floating Staff (0 Assigned Rooms)
// ============================================================================

describe('Milestone 2 Challenge 4: Floating Staff Visibility', () => {
  const floatingDoctor = createStaff({
    id: 'doc-float',
    role: 'Doctor',
    assignedRoomIds: [],
    assignedRoomNames: [],
  });

  const floatingNurse = createStaff({
    id: 'nurse-float',
    role: 'Nurse',
    assignedRoomIds: [],
    assignedRoomNames: [],
  });

  test('Floating doctor sees All Stations and all active rooms with no defaultStationId', () => {
    const config = computeScopedStations(standardRooms, floatingDoctor);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.defaultStationId).toBeUndefined();
    expect(config.defaultStationName).toBeUndefined();
    expect(config.visibleRooms).toHaveLength(5);
    expect(config.visibleRooms.map((r) => r.id)).toEqual([
      'room-1',
      'room-2',
      'room-3',
      'room-triage',
      'room-tx',
    ]);
  });

  test('Floating doctor renders all station pills without (Mine) suffix', () => {
    const config = computeScopedStations(standardRooms, floatingDoctor);
    const labels = config.visibleRooms.map((r) => getStationPillLabel(r, floatingDoctor));

    expect(labels.every((l) => !l.includes('(Mine)'))).toBe(true);
    expect(labels).toEqual([
      'Room 1',
      'Room 2',
      'Room 3',
      'Triage Station',
      'Treatment Room',
    ]);
  });

  test('Floating nurse sees All Stations and all active rooms without (Mine)', () => {
    const config = computeScopedStations(standardRooms, floatingNurse);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.defaultStationId).toBeUndefined();
    expect(config.visibleRooms).toHaveLength(5);

    const labels = config.visibleRooms.map((r) => getStationPillLabel(r, floatingNurse));
    expect(labels.every((l) => !l.includes('(Mine)'))).toBe(true);
  });

  test('Null staff (unauthenticated or guest context) safely falls back to All Stations and all active rooms', () => {
    const config = computeScopedStations(standardRooms, null);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.defaultStationId).toBeUndefined();
    expect(config.visibleRooms).toHaveLength(5);
  });
});

// ============================================================================
// Test Suite 5: Clinic Admin & Receptionist Scoped Visibility
// ============================================================================

describe('Milestone 2 Challenge 5: Clinic Admin & Receptionist Station Scoping', () => {
  const admin = createStaff({
    id: 'staff-admin',
    firstName: 'Admin',
    lastName: 'User',
    role: 'Admin',
    assignedRoomIds: [],
  });

  const receptionist = createStaff({
    id: 'staff-rec',
    firstName: 'Rachel',
    lastName: 'Front',
    role: 'Receptionist',
    assignedRoomIds: [],
  });

  const adminWithRoom = createStaff({
    id: 'staff-admin-room',
    role: 'Admin',
    assignedRoomIds: ['room-1'], // Even if mistakenly assigned a room ID
  });

  test('Clinic Admin sees All Stations and all active rooms', () => {
    const config = computeScopedStations(standardRooms, admin);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.visibleRooms).toHaveLength(5);
  });

  test('Receptionist sees All Stations and all active rooms', () => {
    const config = computeScopedStations(standardRooms, receptionist);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.visibleRooms).toHaveLength(5);
  });

  test('Admin with assignedRoomId is not constrained to scoped rooms (role bypasses doctor/nurse scoping)', () => {
    const config = computeScopedStations(standardRooms, adminWithRoom);

    expect(config.allPillLabel).toBe('All Stations');
    expect(config.visibleRooms).toHaveLength(5);
  });

  test('Ancillary roles (Pharmacist, Lab Tech, Cashier) see All Stations and all active rooms', () => {
    const roles: StaffMember['role'][] = ['Pharmacist', 'LaboratoryTechnician', 'Cashier'];
    for (const role of roles) {
      const staff = createStaff({ id: `staff-${role}`, role });
      const config = computeScopedStations(standardRooms, staff);
      expect(config.allPillLabel).toBe('All Stations');
      expect(config.visibleRooms).toHaveLength(5);
    }
  });
});

// ============================================================================
// Test Suite 6: Patient Queue Visibility Filtering (isPatientVisibleToStaff)
// ============================================================================

describe('Milestone 2 Challenge 6: Patient Queue Filtering', () => {
  const doctor1 = createStaff({
    id: 'doc-1',
    role: 'Doctor',
    assignedRoomIds: ['room-1'],
    assignedRoomNames: ['Room 1'],
  });

  const doctor2 = createStaff({
    id: 'doc-2',
    role: 'Doctor',
    assignedRoomIds: ['room-2'],
    assignedRoomNames: ['Room 2'],
  });

  test('Patient checked into hidden Room 3 is EXCLUDED from Doctor 1 queue when unassigned', () => {
    const patientRoom3 = createQueueTicket({
      id: 'q-rm3',
      roomId: 'room-3',
      roomOrStation: 'Room 3',
      patientName: 'Unassigned Patient',
      doctorId: undefined,
    });

    const isVisible = isPatientVisibleToStaff(patientRoom3, doctor1, standardRooms);
    expect(isVisible).toBe(false);
  });

  test('Patient checked into hidden Room 3 is EXCLUDED from Doctor 1 queue when assigned to Doctor 2', () => {
    const patientDoc2 = createQueueTicket({
      id: 'q-rm3-doc2',
      roomId: 'room-3',
      roomOrStation: 'Room 3',
      doctorId: 'doc-2',
      doctorName: 'Dr. Two',
    });

    const isVisible = isPatientVisibleToStaff(patientDoc2, doctor1, standardRooms);
    expect(isVisible).toBe(false);
  });

  test('Patient checked into hidden Room 3 is VISIBLE to Doctor 1 when explicitly assigned to Doctor 1', () => {
    const patientAssignedDoc1 = createQueueTicket({
      id: 'q-rm3-doc1',
      roomId: 'room-3',
      roomOrStation: 'Room 3',
      doctorId: 'doc-1',
      doctorName: 'Dr. Maria Santos',
    });

    const isVisible = isPatientVisibleToStaff(patientAssignedDoc1, doctor1, standardRooms);
    expect(isVisible).toBe(true);
  });

  test('Doctor 1 sees patients checked into Room 1 (assigned room)', () => {
    const patientRoom1 = createQueueTicket({
      id: 'q-rm1',
      roomId: 'room-1',
      roomOrStation: 'Room 1',
    });

    expect(isPatientVisibleToStaff(patientRoom1, doctor1, standardRooms)).toBe(true);
  });

  test('Doctor 1 sees patients checked into shared stations (Triage and Treatment)', () => {
    const patientTriage = createQueueTicket({
      id: 'q-triage',
      roomId: 'room-triage',
      roomOrStation: 'Triage Station',
      status: 'Waiting',
    });
    const patientTx = createQueueTicket({
      id: 'q-tx',
      roomId: 'room-tx',
      roomOrStation: 'Treatment Room',
      status: 'PendingProcedure',
    });

    expect(isPatientVisibleToStaff(patientTriage, doctor1, standardRooms)).toBe(true);
    expect(isPatientVisibleToStaff(patientTx, doctor1, standardRooms)).toBe(true);
  });

  test('Queue matching works case-insensitively when roomId is missing and roomOrStation string is used', () => {
    const ticketByNameLowercase = createQueueTicket({
      id: 'q-lower',
      roomId: undefined,
      roomOrStation: 'room 1', // lowercase
    });

    expect(isPatientVisibleToStaff(ticketByNameLowercase, doctor1, standardRooms)).toBe(true);

    const ticketByNameRoom2 = createQueueTicket({
      id: 'q-lower-rm2',
      roomId: undefined,
      roomOrStation: 'room 2',
    });
    expect(isPatientVisibleToStaff(ticketByNameRoom2, doctor1, standardRooms)).toBe(false);
  });

  test('Unallocated intake patient (no roomId and no roomOrStation) is visible to doctors in general queue', () => {
    const intakePatient = createQueueTicket({
      id: 'q-intake',
      roomId: undefined,
      roomOrStation: undefined,
      status: 'Waiting',
    });

    expect(isPatientVisibleToStaff(intakePatient, doctor1, standardRooms)).toBe(true);
  });

  test('All queue patients are visible to Nurse, Receptionist, Admin, and Floating Doctor', () => {
    const nurse = createStaff({ id: 'nurse-1', role: 'Nurse', assignedRoomIds: ['room-1'] });
    const rec = createStaff({ id: 'rec-1', role: 'Receptionist' });
    const admin = createStaff({ id: 'admin-1', role: 'Admin' });
    const floatDoc = createStaff({ id: 'doc-f', role: 'Doctor', assignedRoomIds: [] });

    const patientRoom3 = createQueueTicket({ id: 'q-3', roomId: 'room-3', roomOrStation: 'Room 3' });

    expect(isPatientVisibleToStaff(patientRoom3, nurse, standardRooms)).toBe(true);
    expect(isPatientVisibleToStaff(patientRoom3, rec, standardRooms)).toBe(true);
    expect(isPatientVisibleToStaff(patientRoom3, admin, standardRooms)).toBe(true);
    expect(isPatientVisibleToStaff(patientRoom3, floatDoc, standardRooms)).toBe(true);
    expect(isPatientVisibleToStaff(patientRoom3, null, standardRooms)).toBe(true);
  });
});

// ============================================================================
// Test Suite 7: Dynamic Room Updates (Deactivation, Reactivation & Deletion)
// ============================================================================

describe('Milestone 2 Challenge 7: Dynamic Room Updates & Lifecycle Transitions', () => {
  const multiDoc = createStaff({
    id: 'doc-multi',
    role: 'Doctor',
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomNames: ['Room 1', 'Room 2'],
  });

  const nurseRoom2 = createStaff({
    id: 'nurse-rm2',
    role: 'Nurse',
    assignedRoomIds: ['room-2'],
    assignedRoomNames: ['Room 2'],
  });

  test('Deactivating Room 2 removes it from activeRooms and purges it from visible stations', () => {
    // Admin toggles Room 2 isActive to false
    const roomsAfterDeactivation = standardRooms.map((r) =>
      r.id === 'room-2' ? { ...r, isActive: false } : r,
    );
    const activeRooms = roomsAfterDeactivation.filter((r) => r.isActive);

    expect(activeRooms.map((r) => r.id)).toEqual(['room-1', 'room-3', 'room-triage', 'room-tx']);

    // Multi-room doctor visible rooms dynamically updates
    const docConfig = computeScopedStations(activeRooms, multiDoc);
    expect(docConfig.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-triage', 'room-tx']);
    expect(docConfig.visibleRooms.some((r) => r.id === 'room-2')).toBe(false);

    // Nurse assigned solely to Room 2 now only has shared stations
    const nurseConfig = computeScopedStations(activeRooms, nurseRoom2);
    expect(nurseConfig.visibleRooms.map((r) => r.id)).toEqual(['room-triage', 'room-tx']);
    expect(nurseConfig.defaultStationName).toBeUndefined(); // Room 2 is not active
  });

  test('Reactivating Room 2 restores it to visible stations with (Mine) label', () => {
    // Room 2 reactivated
    const roomsReactivated = standardRooms.map((r) =>
      r.id === 'room-2' ? { ...r, isActive: true } : r,
    );
    const activeRooms = roomsReactivated.filter((r) => r.isActive);

    const docConfig = computeScopedStations(activeRooms, multiDoc);
    expect(docConfig.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-2', 'room-triage', 'room-tx']);
    expect(getStationPillLabel(docConfig.visibleRooms[1], multiDoc)).toBe('Room 2 (Mine)');
  });

  test('Deactivating a shared station (Treatment Room) purges it from all clinicians', () => {
    const roomsNoTx = standardRooms.map((r) =>
      r.id === 'room-tx' ? { ...r, isActive: false } : r,
    );
    const activeRooms = roomsNoTx.filter((r) => r.isActive);

    const docConfig = computeScopedStations(activeRooms, multiDoc);
    expect(docConfig.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-2', 'room-triage']);
    expect(docConfig.visibleRooms.some((r) => r.id === 'room-tx')).toBe(false);
  });

  test('Deleting a room from the clinic array removes it without throwing errors', () => {
    const roomsDeleted = standardRooms.filter((r) => r.id !== 'room-1');
    const docConfig = computeScopedStations(roomsDeleted, multiDoc);

    // Room 1 deleted -> multiDoc only sees Room 2 + shared stations
    expect(docConfig.visibleRooms.map((r) => r.id)).toEqual(['room-2', 'room-triage', 'room-tx']);
    // defaultStationId was room-1, but defaultStationName should be undefined because room-1 no longer exists
    expect(docConfig.defaultStationName).toBeUndefined();
  });
});

// ============================================================================
// Test Suite 8: Call-to-Room 4-Step Resolution Algorithm Stress
// ============================================================================

describe('Milestone 2 Challenge 8: 4-Step Call-to-Room Resolution Stress', () => {
  const multiDoc = createStaff({
    id: 'doc-multi',
    role: 'Doctor',
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomNames: ['Room 1', 'Room 2'],
  });

  const floatingDoc = createStaff({
    id: 'doc-float',
    role: 'Doctor',
    assignedRoomIds: [],
  });

  const visibleRooms = computeScopedStations(standardRooms, multiDoc).visibleRooms;

  test('Step 1 Priority: Explicit station pill selected (e.g. Room 2) overrides ticket check-in room', () => {
    const ticketCheckedIntoRoom1 = createQueueTicket({
      id: 'q-step1',
      roomId: 'room-1',
      roomOrStation: 'Room 1',
    });

    const callResult = resolveCallToRoom({
      ticket: ticketCheckedIntoRoom1,
      selectedStation: 'Room 2',
      currentStaff: multiDoc,
      activeRooms: standardRooms,
      visibleRooms,
    });

    expect(callResult.roomName).toBe('Room 2');
    expect(callResult.roomId).toBe('room-2');
  });

  test('Step 2 Priority: Station is ALL and ticket check-in room matches doctor secondary assigned room', () => {
    const ticketCheckedIntoRoom2 = createQueueTicket({
      id: 'q-step2',
      roomId: 'room-2',
      roomOrStation: 'Room 2',
    });

    const callResult = resolveCallToRoom({
      ticket: ticketCheckedIntoRoom2,
      selectedStation: 'ALL',
      currentStaff: multiDoc,
      activeRooms: standardRooms,
      visibleRooms,
    });

    expect(callResult.roomName).toBe('Room 2');
    expect(callResult.roomId).toBe('room-2');
  });

  test('Step 3 Priority: Station is ALL and ticket check-in is unassigned or in hidden Room 3 -> doctor primary room', () => {
    const ticketInRoom3 = createQueueTicket({
      id: 'q-step3',
      roomId: 'room-3',
      roomOrStation: 'Room 3',
      doctorId: 'doc-multi', // Assigned to this doc, so visible
    });

    const callResult = resolveCallToRoom({
      ticket: ticketInRoom3,
      selectedStation: 'ALL',
      currentStaff: multiDoc,
      activeRooms: standardRooms,
      visibleRooms,
    });

    expect(callResult.roomName).toBe('Room 1');
    expect(callResult.roomId).toBe('room-1');
  });

  test('Step 4 Priority: Floating doctor with ALL selected falls back to first active consultation room', () => {
    const ticket = createQueueTicket({ id: 'q-step4' });

    const callResult = resolveCallToRoom({
      ticket,
      selectedStation: 'ALL',
      currentStaff: floatingDoc,
      activeRooms: standardRooms,
      visibleRooms: standardRooms,
    });

    expect(callResult.roomName).toBe('Room 1');
    expect(callResult.roomId).toBe('room-1');
  });

  test('Fallback when no consultation rooms exist (only Triage/Treatment) -> activeRooms[0]', () => {
    const onlySharedRooms = standardRooms.filter((r) => r.type !== 'Consultation');
    const ticket = createQueueTicket({ id: 'q-shared' });

    const callResult = resolveCallToRoom({
      ticket,
      selectedStation: 'ALL',
      currentStaff: floatingDoc,
      activeRooms: onlySharedRooms,
      visibleRooms: onlySharedRooms,
    });

    expect(callResult.roomName).toBe('Triage Station');
    expect(callResult.roomId).toBe('room-triage');
  });

  test('Fallback when activeRooms is empty array -> graceful fallback to Room 1', () => {
    const ticket = createQueueTicket({ id: 'q-empty' });

    const callResult = resolveCallToRoom({
      ticket,
      selectedStation: 'ALL',
      currentStaff: floatingDoc,
      activeRooms: [],
      visibleRooms: [],
    });

    expect(callResult.roomName).toBe('Room 1');
  });
});

// ============================================================================
// Test Suite 9: Walk-In Doctor Room Preselection & Coverage
// ============================================================================

describe('Milestone 2 Challenge 9: Walk-In Doctor Room Preselection', () => {
  test('Preselects primary room for multi-room doctor', () => {
    const doc = createStaff({
      id: 'doc-walkin',
      role: 'Doctor',
      assignedRoomIds: ['room-2', 'room-1'],
    });

    const selection = resolveWalkInDoctorRoomSelection(doc, standardRooms);
    expect(selection.preselectedRoomId).toBe('room-2');
    expect(selection.doctorRoomIds).toEqual(['room-2', 'room-1']);
  });

  test('Filters out deactivated rooms from doctorRoomIds in walk-in preselection', () => {
    const doc = createStaff({
      id: 'doc-walkin2',
      role: 'Doctor',
      assignedRoomIds: ['room-inactive', 'room-1'],
    });

    const activeRooms = standardRooms; // room-inactive is not in activeRooms
    const selection = resolveWalkInDoctorRoomSelection(doc, activeRooms);
    expect(selection.preselectedRoomId).toBe('room-1');
    expect(selection.doctorRoomIds).toEqual(['room-1']);
  });

  test('Returns undefined preselection for floating doctor or null doctor', () => {
    const floatDoc = createStaff({ id: 'doc-f', role: 'Doctor', assignedRoomIds: [] });
    expect(resolveWalkInDoctorRoomSelection(floatDoc, standardRooms).preselectedRoomId).toBeUndefined();
    expect(resolveWalkInDoctorRoomSelection(null, standardRooms).preselectedRoomId).toBeUndefined();
  });
});
