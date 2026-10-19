// token-guard:ignore-file
// @ts-ignore
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClinicRoom, StaffMember, PatientQueueItem } from '../services/clinicService';

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
  clinicService,
  computeScopedStations,
  isPatientVisibleToStaff,
  resolveCallToRoom,
  getOtherRoomCoverageText,
  resolveWalkInDoctorRoomSelection,
} = await import('../services/clinicService');
const { ClinicRoomsSettingsCard } = await import('../components/settings/ClinicRoomsSettingsCard');

describe('Empirical Challenger: Milestone 2 Call Resolution, Doctor Preselection & Additive Coverage', () => {
  // Test fixture setup
  const mockRooms: ClinicRoom[] = [
    {
      id: 'room-1',
      name: 'Room 1 - Pediatrics',
      code: 'PED-1',
      type: 'Consultation',
      isActive: true,
      displayOrder: 1,
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      assignedStaffCount: 1,
      createdAt: '2026-01-01',
    },
    {
      id: 'room-2',
      name: 'Room 2 - Internal Medicine',
      code: 'IM-1',
      type: 'Consultation',
      isActive: true,
      displayOrder: 2,
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      assignedStaffCount: 2,
      createdAt: '2026-01-01',
    },
    {
      id: 'room-3',
      name: 'Room 3 - General Surgery',
      code: 'SURG-1',
      type: 'Consultation',
      isActive: true,
      displayOrder: 3,
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      assignedStaffCount: 1,
      createdAt: '2026-01-01',
    },
    {
      id: 'room-triage',
      name: 'Triage Station Alpha',
      code: 'TR-1',
      type: 'Triage',
      isActive: true,
      displayOrder: 4,
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      assignedStaffCount: 1,
      createdAt: '2026-01-01',
    },
    {
      id: 'room-tx',
      name: 'Treatment Room Beta',
      code: 'TX-1',
      type: 'Treatment',
      isActive: true,
      displayOrder: 5,
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      assignedStaffCount: 1,
      createdAt: '2026-01-01',
    },
  ];

  const multiRoomDoctor: StaffMember = {
    id: 'doc-multi',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Clarissa',
    lastName: 'Reyes',
    role: 'Doctor',
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomNames: ['Room 1 - Pediatrics', 'Room 2 - Internal Medicine'],
    isActive: true,
    createdAt: '2026-01-01',
  };

  const singleRoomDoctor: StaffMember = {
    id: 'doc-single',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Bernardo',
    lastName: 'Santos',
    role: 'Doctor',
    assignedRoomIds: ['room-3'],
    assignedRoomNames: ['Room 3 - General Surgery'],
    isActive: true,
    createdAt: '2026-01-01',
  };

  const floatingDoctor: StaffMember = {
    id: 'doc-floating',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Fernando',
    lastName: 'Gomez',
    role: 'Doctor',
    assignedRoomIds: [],
    assignedRoomNames: [],
    isActive: true,
    createdAt: '2026-01-01',
  };

  const assignedNurse: StaffMember = {
    id: 'nurse-triage',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Elena',
    lastName: 'Bautista',
    role: 'Nurse',
    assignedRoomIds: ['room-triage'],
    assignedRoomNames: ['Triage Station Alpha'],
    isActive: true,
    createdAt: '2026-01-01',
  };

  const baseTicket: PatientQueueItem = {
    id: 'ticket-101',
    ticketNumber: 'A-101',
    queueNumber: 'A-101',
    patientId: 'patient-99',
    patientName: 'Eduardo Manalo',
    priority: 'Urgent',
    status: 'Triaged',
    waitTimeMinutes: 12,
  };

  // ============================================================================
  // SECTION 1: 4-STEP PRIORITY HIERARCHY ADVERSARIAL STRESS TESTS
  // ============================================================================
  describe('1. 4-Step Call Resolution Priority Hierarchy', () => {
    test('Priority 1: Active station pill matches active room by exact ID -> Priority 1 selected regardless of ticket or doctor rooms', () => {
      // Setup: Multi-room doctor is in Room 1 and Room 2. Ticket was checked in for Room 1.
      // But user has clicked station pill "room-tx" (Treatment Room).
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-1', roomOrStation: 'Room 1 - Pediatrics' },
        selectedStation: 'room-tx',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      expect(resolved.roomId).toBe('room-tx');
      expect(resolved.roomName).toBe('Treatment Room Beta');
    });

    test('Priority 1: Active station pill matches active room by exact name (case-insensitive) -> Priority 1 selected', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-1', roomOrStation: 'Room 1 - Pediatrics' },
        selectedStation: 'room 2 - internal medicine', // lower-case
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 1 bypass: When selectedStation is "ALL", Step 1 is bypassed', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-2', roomOrStation: 'Room 2 - Internal Medicine' },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // Resolves to Step 2 (ticket room)
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 1 bypass: When selectedStation does NOT exist in visibleRooms, falls through to Step 2/3', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-2', roomOrStation: 'Room 2 - Internal Medicine' },
        selectedStation: 'non-existent-station-id',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // Falls through to Step 2 matching ticket room
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 1 bypass: When selectedStation is in activeRooms but HIDDEN from visibleRooms, falls through', () => {
      // Room 3 is hidden from multiRoomDoctor's visibleRooms
      const scopedConfig = computeScopedStations(mockRooms, multiRoomDoctor);
      expect(scopedConfig.visibleRooms.some((r) => r.id === 'room-3')).toBe(false);

      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-2' },
        selectedStation: 'room-3', // hidden room
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: scopedConfig.visibleRooms,
      });

      // Step 1 fails because room-3 is not in visibleRooms; Step 2 matches ticket roomId 'room-2'
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 2: Active station pill is ALL, ticket check-in room matches doctor secondary assigned room -> selected', () => {
      // Doctor's primary room is room-1, secondary is room-2.
      // Ticket is checked into room-2.
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-2' },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // Must select room-2 (secondary), NOT primary room-1!
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 2: Matching by ticket.roomOrStation string (case-insensitive) when ticket.roomId is omitted', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined, roomOrStation: 'room 2 - internal medicine' },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 2 bypass: When ticket check-in room is assigned to ANOTHER doctor, Step 2 is rejected', () => {
      // Ticket is checked into Room 3 (Dr. Santos's room).
      // Multi-room doctor (Dr. Reyes, assigned to Room 1 & 2) calls the ticket.
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-3', roomOrStation: 'Room 3 - General Surgery' },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // Doctor is not assigned to Room 3, so Step 2 does NOT select Room 3.
      // Priority 3 activates: clinician's primary assigned room ('room-1') is selected!
      expect(resolved.roomId).toBe('room-1');
      expect(resolved.roomName).toBe('Room 1 - Pediatrics');
    });

    test('Priority 2 bypass: When ticket room is in doctor assigned rooms but room is DEACTIVATED in activeRooms -> falls through to Step 3', () => {
      const activeWithoutRoom2 = mockRooms.filter((r) => r.id !== 'room-2');
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: 'room-2' },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: activeWithoutRoom2,
        visibleRooms: activeWithoutRoom2,
      });

      // Room 2 is not active, so Step 2 falls through to Step 3 (primary room-1)
      expect(resolved.roomId).toBe('room-1');
      expect(resolved.roomName).toBe('Room 1 - Pediatrics');
    });

    test('Priority 3: Ticket check-in room not in clinician assigned rooms -> clinician primary assigned room (assignedRoomIds[0]) selected', () => {
      // Ticket has no room at all
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined, roomOrStation: undefined },
        selectedStation: 'ALL',
        currentStaff: multiRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // Primary assigned room is assignedRoomIds[0] ('room-1')
      expect(resolved.roomId).toBe('room-1');
      expect(resolved.roomName).toBe('Room 1 - Pediatrics');
    });

    test('Priority 3: Single-room doctor calling unassigned ticket resolves to single assigned room', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: singleRoomDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      expect(resolved.roomId).toBe('room-3');
      expect(resolved.roomName).toBe('Room 3 - General Surgery');
    });

    test('Priority 3 fallback: If clinician primary room is deactivated / missing from activeRooms -> falls through to Step 4', () => {
      // Primary room-1 is deactivated
      const activeWithoutRoom1 = mockRooms.filter((r) => r.id !== 'room-1');
      const doctorWithInactivePrimary: StaffMember = {
        ...multiRoomDoctor,
        assignedRoomIds: ['room-1'], // only assigned to inactive room
      };

      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: doctorWithInactivePrimary,
        activeRooms: activeWithoutRoom1,
        visibleRooms: activeWithoutRoom1,
      });

      // Step 3 primary lookup returns undefined -> falls through to Step 4 (first available consultation room: room-2)
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 4: Clinician is floating (0 assigned rooms) -> first available active consultation room selected', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: floatingDoctor,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      // First consultation room in mockRooms is 'room-1'
      expect(resolved.roomId).toBe('room-1');
      expect(resolved.roomName).toBe('Room 1 - Pediatrics');
    });

    test('Priority 4: Correctly skips Triage and Treatment rooms to pick first Consultation room', () => {
      // Rooms sorted with Triage first, Treatment second, Consultation third
      const rearrangedRooms: ClinicRoom[] = [
        mockRooms[3], // Triage
        mockRooms[4], // Treatment
        mockRooms[1], // Room 2 (Consultation)
        mockRooms[0], // Room 1 (Consultation)
      ];

      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: floatingDoctor,
        activeRooms: rearrangedRooms,
        visibleRooms: rearrangedRooms,
      });

      // Must NOT pick Triage or Treatment; must pick first Consultation room (Room 2)
      expect(resolved.roomId).toBe('room-2');
      expect(resolved.roomName).toBe('Room 2 - Internal Medicine');
    });

    test('Priority 4: Staff with null or undefined assignedRoomIds behaves as floating clinician', () => {
      const legacyStaff: StaffMember = {
        ...floatingDoctor,
        assignedRoomIds: undefined as any,
        assignedRoomId: undefined as any,
      };

      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: legacyStaff,
        activeRooms: mockRooms,
        visibleRooms: mockRooms,
      });

      expect(resolved.roomId).toBe('room-1');
      expect(resolved.roomName).toBe('Room 1 - Pediatrics');
    });

    test('Priority 5 fallback: No consultation rooms exist in clinic -> first active room selected', () => {
      const nonConsultRooms: ClinicRoom[] = [
        mockRooms[3], // Triage
        mockRooms[4], // Treatment
      ];

      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: floatingDoctor,
        activeRooms: nonConsultRooms,
        visibleRooms: nonConsultRooms,
      });

      // No consultation rooms, fallback to activeRooms[0] (Triage)
      expect(resolved.roomId).toBe('room-triage');
      expect(resolved.roomName).toBe('Triage Station Alpha');
    });

    test('Priority 5 fallback: Zero active rooms in clinic -> returns graceful fallback without throwing', () => {
      const resolved = resolveCallToRoom({
        ticket: { ...baseTicket, roomId: undefined },
        selectedStation: 'ALL',
        currentStaff: floatingDoctor,
        activeRooms: [],
        visibleRooms: [],
      });

      expect(resolved.roomName).toBe('Room 1');
      expect(resolved.roomId).toBeUndefined();
    });
  });

  // ============================================================================
  // SECTION 2: WALK-IN CHECK-IN ATTENDING DOCTOR PRESELECTION & BADGES
  // ============================================================================
  describe('2. Walk-In Check-In Attending Doctor Selection & Badges', () => {
    test('Pre-selection: Selecting a multi-room doctor pre-selects doctor.assignedRoomIds[0]', () => {
      const result = resolveWalkInDoctorRoomSelection(multiRoomDoctor, mockRooms);
      expect(result.preselectedRoomId).toBe('room-1');
      expect(result.doctorRoomIds).toEqual(['room-1', 'room-2']);
    });

    test('Pre-selection: Doctor with custom primary room (room-2 first) pre-selects room-2', () => {
      const docReordered: StaffMember = {
        ...multiRoomDoctor,
        assignedRoomIds: ['room-2', 'room-1'],
      };
      const result = resolveWalkInDoctorRoomSelection(docReordered, mockRooms);
      expect(result.preselectedRoomId).toBe('room-2');
      expect(result.doctorRoomIds).toEqual(['room-2', 'room-1']);
    });

    test('Pre-selection: Doctor whose primary room is inactive pre-selects the first ACTIVE assigned room', () => {
      const activeWithoutRoom1 = mockRooms.filter((r) => r.id !== 'room-1');
      const result = resolveWalkInDoctorRoomSelection(multiRoomDoctor, activeWithoutRoom1);

      // room-1 is inactive, so validRooms is ['room-2']
      expect(result.preselectedRoomId).toBe('room-2');
      expect(result.doctorRoomIds).toEqual(['room-2']);
    });

    test('Pre-selection: Doctor with 0 assigned rooms returns undefined preselection and empty doctorRoomIds', () => {
      const result = resolveWalkInDoctorRoomSelection(floatingDoctor, mockRooms);
      expect(result.preselectedRoomId).toBeUndefined();
      expect(result.doctorRoomIds).toEqual([]);
    });

    test('Pre-selection: Null doctor ("Any Available Doctor") returns undefined preselection and empty doctorRoomIds', () => {
      const result = resolveWalkInDoctorRoomSelection(null, mockRooms);
      expect(result.preselectedRoomId).toBeUndefined();
      expect(result.doctorRoomIds).toEqual([]);
    });

    test('Badging: Badges all rooms in doctor.assignedRoomIds with "(Doctor\'s Room)" and leaves other rooms unbadged', () => {
      // Logic from Patients.screen.tsx lines 2453-2476:
      const selectedDoctor = multiRoomDoctor;
      const selectedDocRooms = selectedDoctor?.assignedRoomIds ?? [];

      const renderedLabels = mockRooms.map((room) => {
        const isDocRoom = selectedDocRooms.includes(room.id);
        return isDocRoom ? `${room.name} (Doctor's Room)` : room.name;
      });

      // Room 1 (in assignedRoomIds) -> badged
      expect(renderedLabels[0]).toBe("Room 1 - Pediatrics (Doctor's Room)");
      // Room 2 (in assignedRoomIds) -> badged
      expect(renderedLabels[1]).toBe("Room 2 - Internal Medicine (Doctor's Room)");
      // Room 3 (NOT in assignedRoomIds) -> unbadged
      expect(renderedLabels[2]).toBe('Room 3 - General Surgery');
      // Triage (NOT in assignedRoomIds) -> unbadged
      expect(renderedLabels[3]).toBe('Triage Station Alpha');
      // Treatment (NOT in assignedRoomIds) -> unbadged
      expect(renderedLabels[4]).toBe('Treatment Room Beta');
    });

    test('Badging: When "Any Available Doctor" is chosen, ZERO rooms receive the "(Doctor\'s Room)" badge', () => {
      const selectedDoctor = null;
      const selectedDocRooms = (selectedDoctor as any)?.assignedRoomIds ?? [];

      const renderedLabels = mockRooms.map((room) => {
        const isDocRoom = selectedDocRooms.includes(room.id);
        return isDocRoom ? `${room.name} (Doctor's Room)` : room.name;
      });

      expect(renderedLabels.every((label) => !label.includes("(Doctor's Room)"))).toBe(true);
    });

    test('Badging: When a floating doctor is chosen, ZERO rooms receive the "(Doctor\'s Room)" badge', () => {
      const selectedDoctor = floatingDoctor;
      const selectedDocRooms = selectedDoctor?.assignedRoomIds ?? [];

      const renderedLabels = mockRooms.map((room) => {
        const isDocRoom = selectedDocRooms.includes(room.id);
        return isDocRoom ? `${room.name} (Doctor's Room)` : room.name;
      });

      expect(renderedLabels.every((label) => !label.includes("(Doctor's Room)"))).toBe(true);
    });

    test('UI Simulation: Switching doctors updates room pre-selection and badging reactively', () => {
      // Simulate doctor selection state machine in Patients.screen.tsx
      let currentDoctorId = '';
      let currentRoomId = '';

      const handleSelectCheckInDoctor = (docId: string, doctors: StaffMember[]) => {
        currentDoctorId = docId;
        if (!docId) return;
        const doc = doctors.find((d) => d.id === docId);
        const docRooms = doc?.assignedRoomIds ?? [];
        if (docRooms.length > 0) {
          currentRoomId = docRooms[0];
        }
      };

      const doctors = [multiRoomDoctor, singleRoomDoctor, floatingDoctor];

      // 1. Initially unassigned
      expect(currentDoctorId).toBe('');
      expect(currentRoomId).toBe('');

      // 2. Select Dr. Reyes (multi-room: room-1, room-2)
      handleSelectCheckInDoctor(multiRoomDoctor.id, doctors);
      expect(currentDoctorId).toBe('doc-multi');
      expect(currentRoomId).toBe('room-1');

      // 3. Switch to Dr. Santos (single-room: room-3)
      handleSelectCheckInDoctor(singleRoomDoctor.id, doctors);
      expect(currentDoctorId).toBe('doc-single');
      expect(currentRoomId).toBe('room-3');

      // 4. Switch to Dr. Gomez (floating) -> does NOT overwrite room with non-existent id
      handleSelectCheckInDoctor(floatingDoctor.id, doctors);
      expect(currentDoctorId).toBe('doc-floating');
      expect(currentRoomId).toBe('room-3'); // remains room-3 or manual choice

      // 5. Switch back to "Any Available Doctor" ('')
      handleSelectCheckInDoctor('', doctors);
      expect(currentDoctorId).toBe('');
    });
  });

  // ============================================================================
  // SECTION 3: ROOM SETTINGS ADDITIVE COVERAGE PHRASING & EDGE CASES
  // ============================================================================
  describe('3. Room Settings Additive Coverage Phrasing', () => {
    test('When staff is in 1 other room and selected for target room -> shows "Also in <Room> · Will cover both"', () => {
      // Staff member Bernardo is currently assigned to room-3. Target room is room-1.
      const text = getOtherRoomCoverageText(singleRoomDoctor, 'room-1', mockRooms, true);
      expect(text).toBe('Also in Room 3 - General Surgery · Will cover both');
    });

    test('When staff is in 1 other room and NOT selected for target room -> shows "Currently in <Room>"', () => {
      const text = getOtherRoomCoverageText(singleRoomDoctor, 'room-1', mockRooms, false);
      expect(text).toBe('Currently in Room 3 - General Surgery');
    });

    test('When staff is in multiple other rooms (2+) and selected -> lists all other rooms cleanly with "Also in ... · Will cover both"', () => {
      // Staff member Clarissa is assigned to room-1 and room-2. Target room is room-3.
      const text = getOtherRoomCoverageText(multiRoomDoctor, 'room-3', mockRooms, true);
      expect(text).toBe('Also in Room 1 - Pediatrics, Room 2 - Internal Medicine · Will cover both');
    });

    test('When staff is in multiple other rooms (2+) and NOT selected -> lists all other rooms with "Currently in ..."', () => {
      const text = getOtherRoomCoverageText(multiRoomDoctor, 'room-3', mockRooms, false);
      expect(text).toBe('Currently in Room 1 - Pediatrics, Room 2 - Internal Medicine');
    });

    test('When staff is already assigned to target room and has NO other rooms -> shows "Assigned to this room" when selected', () => {
      // Single-room doctor is in room-3. Target room IS room-3.
      // Other rooms should be empty!
      const text = getOtherRoomCoverageText(singleRoomDoctor, 'room-3', mockRooms, true);
      expect(text).toBe('Assigned to this room');
    });

    test('When staff is already assigned to target room and has NO other rooms -> shows "Unassigned / Floating" when unselected', () => {
      // Unchecking staff from their only assigned room
      const text = getOtherRoomCoverageText(singleRoomDoctor, 'room-3', mockRooms, false);
      expect(text).toBe('Unassigned / Floating');
    });

    test('When staff has NO assigned rooms at all (floating) -> shows clean unassigned state', () => {
      const textUnselected = getOtherRoomCoverageText(floatingDoctor, 'room-1', mockRooms, false);
      expect(textUnselected).toBe('Unassigned / Floating');

      const textSelected = getOtherRoomCoverageText(floatingDoctor, 'room-1', mockRooms, true);
      expect(textSelected).toBe('Assigned to this room');
    });

    test('When staff has undefined/null assignedRoomIds -> gracefully defaults to unassigned without crashing', () => {
      const staffWithoutIds: StaffMember = {
        ...floatingDoctor,
        assignedRoomIds: undefined as any,
        assignedRoomId: undefined as any,
      };

      expect(getOtherRoomCoverageText(staffWithoutIds, 'room-1', mockRooms, false)).toBe('Unassigned / Floating');
      expect(getOtherRoomCoverageText(staffWithoutIds, 'room-1', mockRooms, true)).toBe('Assigned to this room');
    });

    test('Target room exclusion: Target room is NEVER included in otherRoomNames list', () => {
      // Multi-room doctor is in room-1 and room-2. Target is room-1.
      // Other rooms must ONLY be room-2, NOT room-1!
      const textSelected = getOtherRoomCoverageText(multiRoomDoctor, 'room-1', mockRooms, true);
      expect(textSelected).toBe('Also in Room 2 - Internal Medicine · Will cover both');
      expect(textSelected.includes('Room 1 - Pediatrics')).toBe(false);

      const textUnselected = getOtherRoomCoverageText(multiRoomDoctor, 'room-1', mockRooms, false);
      expect(textUnselected).toBe('Currently in Room 2 - Internal Medicine');
      expect(textUnselected.includes('Room 1 - Pediatrics')).toBe(false);
    });

    test('Deleted / inactive room filter: Staff with ghost room ID in assignedRoomIds does not render ghost name or empty commas', () => {
      const staffWithGhost: StaffMember = {
        ...singleRoomDoctor,
        assignedRoomIds: ['room-3', 'deleted-ghost-room-99'],
      };

      // deleted-ghost-room-99 is not in mockRooms
      const text = getOtherRoomCoverageText(staffWithGhost, 'room-1', mockRooms, true);
      expect(text).toBe('Also in Room 3 - General Surgery · Will cover both');
      expect(text.includes('deleted')).toBe(false);
      expect(text.includes(', ,')).toBe(false);
    });

    test('Target room undefined (e.g. creating brand new room before GUID assignment)', () => {
      const text = getOtherRoomCoverageText(multiRoomDoctor, undefined, mockRooms, true);
      expect(text).toBe('Also in Room 1 - Pediatrics, Room 2 - Internal Medicine · Will cover both');
    });
  });

  // ============================================================================
  // SECTION 4: CLINICAL INTEGRATION & HIGH-DENSITY WORKSTATION SIMULATION
  // ============================================================================
  describe('4. Full Workstation Clinical Simulation & Invariants', () => {
    test('High-Volume Morning Queue: 10 concurrent patients correctly resolve to respective clinic rooms', () => {
      const patients: { ticket: PatientQueueItem; expectedRoom: string; clinician: StaffMember }[] = [
        // P1: Doctor in Room 1 has station pill 'Room 1 - Pediatrics' selected
        {
          ticket: { ...baseTicket, id: 'q1', ticketNumber: 'A1', roomId: undefined },
          clinician: multiRoomDoctor,
          expectedRoom: 'Room 1 - Pediatrics',
        },
        // P2: Doctor in Room 2 has station pill 'ALL', ticket was triaged for Room 2
        {
          ticket: { ...baseTicket, id: 'q2', ticketNumber: 'A2', roomId: 'room-2' },
          clinician: multiRoomDoctor,
          expectedRoom: 'Room 2 - Internal Medicine',
        },
        // P3: Doctor in Room 1 & 2 has station pill 'ALL', ticket checked in for Room 3 (Surgery) -> routes to Dr. Reyes primary (Room 1)
        {
          ticket: { ...baseTicket, id: 'q3', ticketNumber: 'A3', roomId: 'room-3' },
          clinician: multiRoomDoctor,
          expectedRoom: 'Room 1 - Pediatrics',
        },
        // P4: Floating doctor with pill 'ALL' calling unassigned ticket -> routes to first Consultation room (Room 1)
        {
          ticket: { ...baseTicket, id: 'q4', ticketNumber: 'A4', roomId: undefined },
          clinician: floatingDoctor,
          expectedRoom: 'Room 1 - Pediatrics',
        },
        // P5: Nurse stationed in Triage calling patient from Treatment room
        {
          ticket: { ...baseTicket, id: 'q5', ticketNumber: 'A5', roomId: 'room-tx' },
          clinician: assignedNurse,
          expectedRoom: 'Triage Station Alpha', // nurse primary room
        },
      ];

      for (const item of patients) {
        const resolved = resolveCallToRoom({
          ticket: item.ticket,
          selectedStation: item.ticket.id === 'q1' ? 'Room 1 - Pediatrics' : 'ALL',
          currentStaff: item.clinician,
          activeRooms: mockRooms,
          visibleRooms: mockRooms,
        });

        expect(resolved.roomName).toBe(item.expectedRoom);
      }
    });

    test('Queue Visibility: isPatientVisibleToStaff ensures cross-doctor privacy isolation', () => {
      // Patient sitting in Dr. Santos's Room 3
      const patientInRoom3: PatientQueueItem = {
        ...baseTicket,
        roomId: 'room-3',
        roomOrStation: 'Room 3 - General Surgery',
      };

      // Hidden from Dr. Reyes (assigned only to Room 1 & Room 2)
      expect(isPatientVisibleToStaff(patientInRoom3, multiRoomDoctor, mockRooms)).toBe(false);

      // Visible to Dr. Santos (assigned to Room 3)
      expect(isPatientVisibleToStaff(patientInRoom3, singleRoomDoctor, mockRooms)).toBe(true);

      // Visible to Dr. Reyes if patient was specifically assigned to Dr. Reyes
      const assignedToReyes: PatientQueueItem = {
        ...patientInRoom3,
        doctorId: multiRoomDoctor.id,
      };
      expect(isPatientVisibleToStaff(assignedToReyes, multiRoomDoctor, mockRooms)).toBe(true);

      // Visible to Floating Doctor (all rooms visible)
      expect(isPatientVisibleToStaff(patientInRoom3, floatingDoctor, mockRooms)).toBe(true);

      // Visible to Receptionist/Nurse (role !== Doctor)
      expect(isPatientVisibleToStaff(patientInRoom3, assignedNurse, mockRooms)).toBe(true);
    });

    test('Scoped Stations: computeScopedStations guarantees shared stations (Triage/Treatment) are always accessible', () => {
      const doctorConfig = computeScopedStations(mockRooms, multiRoomDoctor);
      const visibleIds = doctorConfig.visibleRooms.map((r) => r.id);

      // Must include assigned rooms
      expect(visibleIds).toContain('room-1');
      expect(visibleIds).toContain('room-2');
      // Must include shared stations
      expect(visibleIds).toContain('room-triage');
      expect(visibleIds).toContain('room-tx');
      // Must EXCLUDE unassigned consultation room
      expect(visibleIds).not.toContain('room-3');

      // Default station must be primary room
      expect(doctorConfig.defaultStationId).toBe('room-1');
      expect(doctorConfig.allPillLabel).toBe('All My Stations');
    });

    test('Component Render: ClinicRoomsSettingsCard static markup mounts with design tokens', () => {
      const markup = renderToStaticMarkup(React.createElement(ClinicRoomsSettingsCard));
      expect(markup).toContain('Clinic Rooms &amp; Stations');
      expect(markup).toContain('Add Room');
    });
  });
});
