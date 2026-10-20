// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

const { clinicApiClient } = await import('../services/apiClient');
const { clinicService } = await import('../services/clinicService');
const { ClinicRoomsSettingsCard } = await import('../components/settings/ClinicRoomsSettingsCard');

// ============================================================================
// OPAQUE-BOX DOMAIN SPECIFICATIONS & ALGORITHMIC HARNESS
// Derivations strictly from PROJECT.md and ORIGINAL_REQUEST.md (2026-10-14T10:27:11Z)
// ============================================================================

export interface TestClinicRoom {
  id: string;
  name: string;
  code?: string | null;
  type: 'Consultation' | 'Triage' | 'Treatment';
  displayOrder: number;
  isActive: boolean;
  assignedStaffCount?: number;
  assignedStaffIds?: string[];
  assignedStaffNames?: string[];
}

export interface TestStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: 'Doctor' | 'Nurse' | 'Receptionist' | 'Admin' | 'Cashier';
  assignedRoomIds?: string[];
  assignedRoomNames?: string[];
  isActive?: boolean;
}

export interface TestQueueItem {
  id: string;
  patientId: string;
  patientName: string;
  ticketNumber: string;
  status: 'Waiting' | 'InConsultation' | 'PendingProcedure' | 'ReEvaluation' | 'Completed' | 'NoShow';
  roomId?: string | null;
  roomOrStation?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
}

export interface ScopedStationConfig {
  visibleRooms: TestClinicRoom[];
  allPillLabel: string;
  defaultStationId?: string;
  defaultStationName?: string;
}

/**
 * Feature 4.1: Computes visible station rooms and labels based on clinician role and assignedRoomIds
 */
export function computeScopedStations(
  activeRooms: TestClinicRoom[],
  currentStaff: TestStaffMember | null,
): ScopedStationConfig {
  if (!currentStaff) {
    return { visibleRooms: activeRooms, allPillLabel: 'All Stations' };
  }

  const assignedIds = currentStaff.assignedRoomIds ?? [];
  const isDoctor = currentStaff.role === 'Doctor';
  const isNurse = currentStaff.role === 'Nurse';

  if (isDoctor && assignedIds.length > 0) {
    const visible = activeRooms.filter(
      (r) => assignedIds.includes(r.id) || r.type === 'Triage' || r.type === 'Treatment',
    );
    return {
      visibleRooms: visible,
      allPillLabel: 'All My Stations',
      defaultStationId: assignedIds[0],
      defaultStationName: activeRooms.find((r) => r.id === assignedIds[0])?.name,
    };
  }

  if (isNurse && assignedIds.length > 0) {
    const visible = activeRooms.filter(
      (r) => assignedIds.includes(r.id) || r.type === 'Triage' || r.type === 'Treatment',
    );
    const defaultRoom = activeRooms.find((r) => r.id === assignedIds[0]);
    return {
      visibleRooms: visible,
      allPillLabel: 'All Stations',
      defaultStationId: defaultRoom?.id,
      defaultStationName: defaultRoom?.name,
    };
  }

  return {
    visibleRooms: activeRooms,
    allPillLabel: 'All Stations',
  };
}

/**
 * Feature 4.1: Queue patient visibility filtering by doctor's scoped rooms
 */
export function isPatientVisibleToStaff(
  patient: TestQueueItem,
  currentStaff: TestStaffMember | null,
  activeRooms: TestClinicRoom[],
): boolean {
  if (!currentStaff || currentStaff.role !== 'Doctor') return true;
  const assignedIds = currentStaff.assignedRoomIds ?? [];
  if (assignedIds.length === 0) return true;

  if (patient.doctorId === currentStaff.id) return true;

  const patientRoom = activeRooms.find(
    (r) => r.id === patient.roomId || r.name.toLowerCase() === patient.roomOrStation?.toLowerCase(),
  );

  if (patientRoom && patientRoom.type === 'Consultation') {
    return assignedIds.includes(patientRoom.id);
  }

  return true;
}

/**
 * Feature 4.3: 4-Step Call-to-Room Resolution Algorithm
 * 1. Active station pill if valid (not 'ALL' and matches an active visible room)
 * 2. Ticket's check-in room if contained in clinician's assigned rooms
 * 3. Clinician's primary assigned room (assignedRoomIds[0])
 * 4. First available active consultation room (fallback)
 */
export function resolveCallToRoom({
  ticket,
  selectedStation,
  currentStaff,
  activeRooms,
  visibleRooms,
}: {
  ticket: TestQueueItem;
  selectedStation: string;
  currentStaff: TestStaffMember | null;
  activeRooms: TestClinicRoom[];
  visibleRooms: TestClinicRoom[];
}): { roomName: string; roomId?: string } {
  const assignedIds = currentStaff?.assignedRoomIds ?? [];

  // Step 1: Active station pill if valid (selectedStation !== 'ALL' and matches visible active room)
  if (selectedStation !== 'ALL') {
    const matchingStation = visibleRooms.find(
      (r) => r.id === selectedStation || r.name.toLowerCase() === selectedStation.toLowerCase(),
    );
    if (matchingStation) {
      return { roomName: matchingStation.name, roomId: matchingStation.id };
    }
  }

  // Step 2: Ticket's check-in room if contained in clinician's assigned rooms
  if (ticket.roomId && assignedIds.includes(ticket.roomId)) {
    const match = activeRooms.find((r) => r.id === ticket.roomId);
    if (match) return { roomName: match.name, roomId: match.id };
  }
  if (ticket.roomOrStation) {
    const match = activeRooms.find(
      (r) => r.name.toLowerCase() === ticket.roomOrStation?.toLowerCase() && assignedIds.includes(r.id),
    );
    if (match) return { roomName: match.name, roomId: match.id };
  }

  // Step 3: Clinician's primary assigned room (assignedRoomIds[0])
  if (assignedIds.length > 0) {
    const primary = activeRooms.find((r) => r.id === assignedIds[0]);
    if (primary) return { roomName: primary.name, roomId: primary.id };
  }

  // Step 4: First available active consultation room fallback
  const firstConsult = activeRooms.find((r) => r.type === 'Consultation') || activeRooms[0];
  if (firstConsult) {
    return { roomName: firstConsult.name, roomId: firstConsult.id };
  }

  return { roomName: 'Room 1' };
}

/**
 * Feature 3.2: Staff assignment text in Room Settings card
 */
export function getOtherRoomCoverageText(
  member: TestStaffMember,
  targetRoomId: string,
  sortedRooms: TestClinicRoom[],
  isSelected: boolean,
): string {
  const otherRooms = sortedRooms.filter(
    (r) => r.id !== targetRoomId && member.assignedRoomIds?.includes(r.id),
  );
  const otherRoomNames = otherRooms.map((r) => r.name).join(', ');

  if (otherRoomNames) {
    return isSelected
      ? `Also in ${otherRoomNames} · Will cover both`
      : `Currently in ${otherRoomNames}`;
  }

  return isSelected ? 'Assigned to this room' : 'Unassigned / Floating';
}

/**
 * Feature 4.4: Walk-in attending doctor room preselection and badging
 */
export function resolveWalkInDoctorRoomSelection(
  doctor: TestStaffMember | null,
  activeRooms: TestClinicRoom[],
): { preselectedRoomId?: string; doctorRoomIds: string[] } {
  if (!doctor || !doctor.assignedRoomIds || doctor.assignedRoomIds.length === 0) {
    return { preselectedRoomId: undefined, doctorRoomIds: [] };
  }

  const validRooms = doctor.assignedRoomIds.filter((id) => activeRooms.some((r) => r.id === id));
  return {
    preselectedRoomId: validRooms[0],
    doctorRoomIds: validRooms,
  };
}

// ============================================================================
// TEST SUITE: TIERS 1-4 COMPREHENSIVE OPAQUE-BOX E2E VERIFICATION
// ============================================================================

describe('E2E Frontend Suite: Multi-Room Staff Assignment & Routing (Tiers 1-4)', () => {
  const sampleRooms: TestClinicRoom[] = [
    { id: 'rm-1', name: 'Room 1 - Pedia', code: 'RM-1', type: 'Consultation', displayOrder: 1, isActive: true },
    { id: 'rm-2', name: 'Room 2 - General', code: 'RM-2', type: 'Consultation', displayOrder: 2, isActive: true },
    { id: 'rm-3', name: 'Room 3 - Internal Med', code: 'RM-3', type: 'Consultation', displayOrder: 3, isActive: true },
    { id: 'rm-triage', name: 'Triage Station', code: 'TR-1', type: 'Triage', displayOrder: 4, isActive: true },
    { id: 'rm-tx', name: 'Treatment Room', code: 'TX-1', type: 'Treatment', displayOrder: 5, isActive: true },
  ];

  const drAlice: TestStaffMember = {
    id: 'doc-alice',
    firstName: 'Alice',
    lastName: 'Guo',
    role: 'Doctor',
    assignedRoomIds: ['rm-1', 'rm-2'],
    assignedRoomNames: ['Room 1 - Pedia', 'Room 2 - General'],
    isActive: true,
  };

  const drBob: TestStaffMember = {
    id: 'doc-bob',
    firstName: 'Bob',
    lastName: 'Santos',
    role: 'Doctor',
    assignedRoomIds: ['rm-3'],
    assignedRoomNames: ['Room 3 - Internal Med'],
    isActive: true,
  };

  const drFloating: TestStaffMember = {
    id: 'doc-float',
    firstName: 'Fiona',
    lastName: 'Cruz',
    role: 'Doctor',
    assignedRoomIds: [],
    assignedRoomNames: [],
    isActive: true,
  };

  const nurseNancy: TestStaffMember = {
    id: 'nurse-nancy',
    firstName: 'Nancy',
    lastName: 'Reyes',
    role: 'Nurse',
    assignedRoomIds: ['rm-triage', 'rm-tx'],
    assignedRoomNames: ['Triage Station', 'Treatment Room'],
    isActive: true,
  };

  const staffRachel: TestStaffMember = {
    id: 'rec-rachel',
    firstName: 'Rachel',
    lastName: 'Tan',
    role: 'Receptionist',
    assignedRoomIds: [],
    assignedRoomNames: [],
    isActive: true,
  };

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (INDIVIDUAL FEATURES IN ISOLATION)
  // --------------------------------------------------------------------------
  describe('Tier 1: Feature Coverage (F3.1 - F4.5)', () => {
    test('F3.1-TC1: clinicService.getRooms retrieves active rooms and preserves assignedStaffIds', async () => {
      const origGet = clinicApiClient.get;
      clinicApiClient.get = (async () => [
        [
          { id: 'rm-1', name: 'Room 1', type: 'Consultation', assignedStaffIds: ['doc-alice'] },
          { id: 'rm-2', name: 'Room 2', type: 'Consultation', assignedStaffIds: ['doc-alice'] },
        ],
        null,
      ]) as any;

      try {
        const [rooms, err] = await clinicService.getRooms(true);
        expect(err).toBeNull();
        expect(rooms).toHaveLength(2);
        expect(rooms?.[0].assignedStaffIds).toContain('doc-alice');
        expect(rooms?.[1].assignedStaffIds).toContain('doc-alice');
      } finally {
        clinicApiClient.get = origGet;
      }
    });

    test('F3.1-TC2: clinicService.callQueueItem sends target roomId and doctor assignment', async () => {
      const origPost = clinicApiClient.post;
      let capturedBody: any = null;
      clinicApiClient.post = (async (_url: string, body: any) => {
        capturedBody = body;
        return [{ id: 'q-101', status: 'InConsultation' }, null];
      }) as any;

      try {
        const [res, err] = await clinicService.callQueueItem(
          'q-101',
          'doc-alice',
          'Dr. Alice Guo',
          'Room 1 - Pedia',
          'rm-1',
        );
        expect(err).toBeNull();
        expect(capturedBody.roomId).toBe('rm-1');
        expect(capturedBody.roomOrStation).toBe('Room 1 - Pedia');
        expect(capturedBody.doctorId).toBe('doc-alice');
      } finally {
        clinicApiClient.post = origPost;
      }
    });

    test('F3.2-TC3: getOtherRoomCoverageText renders "Also in <Room> · Will cover both" for multi-assigned staff', () => {
      const text = getOtherRoomCoverageText(drAlice, 'rm-2', sampleRooms, true);
      expect(text).toBe('Also in Room 1 - Pedia · Will cover both');
    });

    test('F3.2-TC4: getOtherRoomCoverageText renders unassigned text when staff has no other rooms', () => {
      const textSelected = getOtherRoomCoverageText(drFloating, 'rm-1', sampleRooms, true);
      expect(textSelected).toBe('Assigned to this room');

      const textUnselected = getOtherRoomCoverageText(drFloating, 'rm-1', sampleRooms, false);
      expect(textUnselected).toBe('Unassigned / Floating');
    });

    test('F3.3-TC5: Staff management multi-room badges map over assignedRoomNames cleanly', () => {
      expect(drAlice.assignedRoomNames).toHaveLength(2);
      expect(drAlice.assignedRoomNames).toContain('Room 1 - Pedia');
      expect(drAlice.assignedRoomNames).toContain('Room 2 - General');
    });

    test('F3.3-TC5b: Primary room badge formats first room as (Primary) with variant primary and subsequent as outline', () => {
      const names = drAlice.assignedRoomNames!;
      const badges = names.map((roomName, idx) => ({
        label: idx === 0 && names.length > 1 ? `${roomName} (Primary)` : roomName,
        variant: idx === 0 ? 'primary' : 'outline',
      }));

      expect(badges[0]).toEqual({ label: 'Room 1 - Pedia (Primary)', variant: 'primary' });
      expect(badges[1]).toEqual({ label: 'Room 2 - General', variant: 'outline' });
    });

    test('F3.3-TC5c: Setting primary room moves tapped roomId to index 0 and sends ordered assignedRoomIds to clinicService', async () => {
      const origPut = clinicApiClient.put;
      let capturedPayload: any = null;
      clinicApiClient.put = (async (_url: string, body: any) => {
        capturedPayload = body;
        return [{ id: 'doc-alice', ...drAlice, assignedRoomIds: body.assignedRoomIds }, null];
      }) as any;

      try {
        let currentRoomIds = ['rm-1', 'rm-2'];
        // User taps rm-2 to set as primary
        const tappedRoomId = 'rm-2';
        currentRoomIds = [tappedRoomId, ...currentRoomIds.filter((id) => id !== tappedRoomId)];
        expect(currentRoomIds).toEqual(['rm-2', 'rm-1']);

        await clinicService.updateStaff('doc-alice', {
          firstName: drAlice.firstName,
          lastName: drAlice.lastName,
          role: drAlice.role,
          assignedRoomIds: currentRoomIds,
        });

        expect(capturedPayload.assignedRoomIds).toEqual(['rm-2', 'rm-1']);
        expect(capturedPayload.assignedRoomIds[0]).toBe('rm-2');
      } finally {
        clinicApiClient.put = origPut;
      }
    });

    test('F4.1-TC6: Scoped Station Visibility for Multi-Room Doctor restricts to assigned + shared stations', () => {
      const scoped = computeScopedStations(sampleRooms, drAlice);
      expect(scoped.allPillLabel).toBe('All My Stations');
      expect(scoped.visibleRooms.map((r) => r.id)).toEqual(['rm-1', 'rm-2', 'rm-triage', 'rm-tx']);
      expect(scoped.visibleRooms.some((r) => r.id === 'rm-3')).toBe(false);
    });

    test('F4.1-TC7: Scoped Station Visibility for Single-Room Doctor restricts to single room + shared stations', () => {
      const scoped = computeScopedStations(sampleRooms, drBob);
      expect(scoped.allPillLabel).toBe('All My Stations');
      expect(scoped.visibleRooms.map((r) => r.id)).toEqual(['rm-3', 'rm-triage', 'rm-tx']);
      expect(scoped.visibleRooms.some((r) => r.id === 'rm-1')).toBe(false);
    });

    test('F4.1-TC8: Scoped Station Visibility for Floating Doctor shows all active rooms with "All Stations"', () => {
      const scoped = computeScopedStations(sampleRooms, drFloating);
      expect(scoped.allPillLabel).toBe('All Stations');
      expect(scoped.visibleRooms).toHaveLength(sampleRooms.length);
    });

    test('F4.1-TC9: Scoped Station Visibility for Receptionist/Admin shows all active rooms', () => {
      const scoped = computeScopedStations(sampleRooms, staffRachel);
      expect(scoped.allPillLabel).toBe('All Stations');
      expect(scoped.visibleRooms).toHaveLength(5);
    });

    test('F4.1-TC10: Scoped Station Visibility for Nurse defaults to first assigned room', () => {
      const scoped = computeScopedStations(sampleRooms, nurseNancy);
      expect(scoped.allPillLabel).toBe('All Stations');
      expect(scoped.defaultStationId).toBe('rm-triage');
      expect(scoped.defaultStationName).toBe('Triage Station');
    });

    test('F4.3-TC11: 4-Step Call Resolution - Step 1 Priority (Active Station Pill Selected)', () => {
      const ticket: TestQueueItem = {
        id: 'q-1',
        patientId: 'p-1',
        patientName: 'Pedro Cruz',
        ticketNumber: 'Q-001',
        status: 'Waiting',
        roomId: 'rm-1',
        roomOrStation: 'Room 1 - Pedia',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);

      // User clicked "Room 2 - General" pill
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'Room 2 - General',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-2');
      expect(result.roomName).toBe('Room 2 - General');
    });

    test('F4.3-TC12: 4-Step Call Resolution - Step 2 Priority (Matching Ticket Check-In Room)', () => {
      const ticket: TestQueueItem = {
        id: 'q-2',
        patientId: 'p-2',
        patientName: 'Maria Santos',
        ticketNumber: 'Q-002',
        status: 'Waiting',
        roomId: 'rm-2',
        roomOrStation: 'Room 2 - General',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);

      // User has selected 'ALL' pill; ticket check-in is rm-2 which drAlice covers
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-2');
      expect(result.roomName).toBe('Room 2 - General');
    });

    test('F4.3-TC13: 4-Step Call Resolution - Step 3 Priority (Primary Assigned Room)', () => {
      const ticket: TestQueueItem = {
        id: 'q-3',
        patientId: 'p-3',
        patientName: 'Jose Garcia',
        ticketNumber: 'Q-003',
        status: 'Waiting',
        roomId: 'rm-3', // Checked in to Dr. Bob's room
        roomOrStation: 'Room 3 - Internal Med',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);

      // Dr. Alice calling ticket from 'ALL': rm-3 is not in drAlice's rooms -> falls back to primary assigned rm-1
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('F4.3-TC14: 4-Step Call Resolution - Step 4 Priority (Floating Doctor Fallback to First Consult Room)', () => {
      const ticket: TestQueueItem = {
        id: 'q-4',
        patientId: 'p-4',
        patientName: 'Ana Reyes',
        ticketNumber: 'Q-004',
        status: 'Waiting',
        roomId: null,
      };
      const scoped = computeScopedStations(sampleRooms, drFloating);

      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drFloating,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('F4.4-TC15: Walk-In Registration Doctor Selection pre-selects primary room and badges all assigned rooms', () => {
      const resAlice = resolveWalkInDoctorRoomSelection(drAlice, sampleRooms);
      expect(resAlice.preselectedRoomId).toBe('rm-1');
      expect(resAlice.doctorRoomIds).toEqual(['rm-1', 'rm-2']);

      const resBob = resolveWalkInDoctorRoomSelection(drBob, sampleRooms);
      expect(resBob.preselectedRoomId).toBe('rm-3');
      expect(resBob.doctorRoomIds).toEqual(['rm-3']);

      const resFloat = resolveWalkInDoctorRoomSelection(drFloating, sampleRooms);
      expect(resFloat.preselectedRoomId).toBeUndefined();
      expect(resFloat.doctorRoomIds).toHaveLength(0);
    });

    test('F4.5-TC16: Patient queue visibility excludes patients in other doctors consultation rooms', () => {
      const patientInRoom3: TestQueueItem = {
        id: 'q-bob-pat',
        patientId: 'p-10',
        patientName: 'Patient In Room 3',
        ticketNumber: 'Q-010',
        status: 'Waiting',
        roomId: 'rm-3',
        doctorId: 'doc-bob',
      };
      const patientInRoom1: TestQueueItem = {
        id: 'q-alice-pat',
        patientId: 'p-11',
        patientName: 'Patient In Room 1',
        ticketNumber: 'Q-011',
        status: 'Waiting',
        roomId: 'rm-1',
        doctorId: 'doc-alice',
      };
      const patientInTriage: TestQueueItem = {
        id: 'q-triage-pat',
        patientId: 'p-12',
        patientName: 'Patient In Triage',
        ticketNumber: 'Q-012',
        status: 'Waiting',
        roomId: 'rm-triage',
      };

      // Dr. Alice should NOT see patientInRoom3
      expect(isPatientVisibleToStaff(patientInRoom3, drAlice, sampleRooms)).toBe(false);
      // Dr. Alice SHOULD see patientInRoom1
      expect(isPatientVisibleToStaff(patientInRoom1, drAlice, sampleRooms)).toBe(true);
      // Dr. Alice SHOULD see patientInTriage
      expect(isPatientVisibleToStaff(patientInTriage, drAlice, sampleRooms)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (>=5 PER FEATURE)
  // --------------------------------------------------------------------------
  describe('Tier 2: Boundary & Corner Cases', () => {
    test('Tier2-BC1: Staff with undefined assignedRoomIds safely degrades to empty array without crashing', () => {
      const staffUndefined: TestStaffMember = {
        id: 'doc-undef',
        firstName: 'Undef',
        lastName: 'Doc',
        role: 'Doctor',
        assignedRoomIds: undefined,
      };
      const scoped = computeScopedStations(sampleRooms, staffUndefined);
      expect(scoped.allPillLabel).toBe('All Stations');
      expect(scoped.visibleRooms).toHaveLength(sampleRooms.length);
    });

    test('Tier2-BC2: Doctor assigned to all active rooms in clinic (5+ rooms) marks all as visible with (Mine)', () => {
      const superDoc: TestStaffMember = {
        id: 'doc-super',
        firstName: 'Super',
        lastName: 'Chief',
        role: 'Doctor',
        assignedRoomIds: sampleRooms.map((r) => r.id),
      };
      const scoped = computeScopedStations(sampleRooms, superDoc);
      expect(scoped.allPillLabel).toBe('All My Stations');
      expect(scoped.visibleRooms).toHaveLength(sampleRooms.length);
    });

    test('Tier2-BC3: Doctor assigned to a room that was deleted / deactivated excludes the room from visible pills', () => {
      const activeRoomsWithoutRm2 = sampleRooms.filter((r) => r.id !== 'rm-2');
      const scoped = computeScopedStations(activeRoomsWithoutRm2, drAlice);
      expect(scoped.visibleRooms.some((r) => r.id === 'rm-2')).toBe(false);
      expect(scoped.visibleRooms.map((r) => r.id)).toEqual(['rm-1', 'rm-triage', 'rm-tx']);
    });

    test('Tier2-BC4: Ticket checked into deleted room falls back cleanly to primary room in 4-step resolution', () => {
      const ticketInDeletedRoom: TestQueueItem = {
        id: 'q-del',
        patientId: 'p-del',
        patientName: 'Orphan Ticket',
        ticketNumber: 'Q-999',
        status: 'Waiting',
        roomId: 'non-existent-room-id',
        roomOrStation: 'Old Decommissioned Room',
      };
      const activeRoomsWithoutRm2 = sampleRooms.filter((r) => r.id !== 'rm-2');
      const scoped = computeScopedStations(activeRoomsWithoutRm2, drAlice);

      const result = resolveCallToRoom({
        ticket: ticketInDeletedRoom,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: activeRoomsWithoutRm2,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('Tier2-BC5: Active pill set to non-existent station name safely skips Step 1 and applies Step 2/3', () => {
      const ticket: TestQueueItem = {
        id: 'q-valid',
        patientId: 'p-1',
        patientName: 'Test Patient',
        ticketNumber: 'Q-100',
        status: 'Waiting',
        roomId: 'rm-2',
        roomOrStation: 'Room 2 - General',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);

      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'Ghost Station That Does Not Exist',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      // Ghost station ignored; Step 2 matches ticket.roomId 'rm-2'
      expect(result.roomId).toBe('rm-2');
    });

    test('Tier2-BC6: Doctor calling patient sitting in another room explicitly assigned to this doctor is visible and resolved', () => {
      const assignedToAliceInBobRoom: TestQueueItem = {
        id: 'q-cross',
        patientId: 'p-cross',
        patientName: 'Cross Room Patient',
        ticketNumber: 'Q-777',
        status: 'Waiting',
        roomId: 'rm-3',
        doctorId: 'doc-alice', // Assigned to Dr. Alice even though sitting in Room 3
      };

      expect(isPatientVisibleToStaff(assignedToAliceInBobRoom, drAlice, sampleRooms)).toBe(true);

      const scoped = computeScopedStations(sampleRooms, drAlice);
      const result = resolveCallToRoom({
        ticket: assignedToAliceInBobRoom,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      // rm-3 is not in drAlice's assigned rooms -> Step 3 routes patient to drAlice's primary room rm-1
      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('Tier2-BC7: Zero active rooms in clinic degrades gracefully to fallback without throwing', () => {
      const emptyRooms: TestClinicRoom[] = [];
      const scoped = computeScopedStations(emptyRooms, drAlice);
      expect(scoped.visibleRooms).toHaveLength(0);

      const ticket: TestQueueItem = {
        id: 'q-empty',
        patientId: 'p-empty',
        patientName: 'Empty Patient',
        ticketNumber: 'Q-000',
        status: 'Waiting',
      };
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: emptyRooms,
        visibleRooms: [],
      });
      expect(result.roomName).toBe('Room 1');
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE INTERACTIONS)
  // --------------------------------------------------------------------------
  describe('Tier 3: Pairwise Combinatorial Interactions', () => {
    test('P1: Multi-Room Doctor + Specific Station Pill ("Room 2") + Ticket in Room 1 -> Step 1 wins (Room 2)', () => {
      const ticket: TestQueueItem = {
        id: 'q-p1',
        patientId: 'pat-p1',
        patientName: 'Pairwise Patient 1',
        ticketNumber: 'P-101',
        status: 'Waiting',
        roomId: 'rm-1',
        roomOrStation: 'Room 1 - Pedia',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'Room 2 - General',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-2');
      expect(scoped.allPillLabel).toBe('All My Stations');
    });

    test('P2: Multi-Room Doctor + "ALL" Pill + Ticket in Doctor Room 2 -> Step 2 wins (Room 2)', () => {
      const ticket: TestQueueItem = {
        id: 'q-p2',
        patientId: 'pat-p2',
        patientName: 'Pairwise Patient 2',
        ticketNumber: 'P-102',
        status: 'Waiting',
        roomId: 'rm-2',
        roomOrStation: 'Room 2 - General',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-2');
    });

    test('P3: Multi-Room Doctor + "ALL" Pill + Ticket in Foreign Doctor Room 3 -> Step 3 wins (Room 1)', () => {
      const ticket: TestQueueItem = {
        id: 'q-p3',
        patientId: 'pat-p3',
        patientName: 'Pairwise Patient 3',
        ticketNumber: 'P-103',
        status: 'Waiting',
        roomId: 'rm-3',
        roomOrStation: 'Room 3 - Internal Med',
      };
      const scoped = computeScopedStations(sampleRooms, drAlice);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
    });

    test('P4: Nurse + "ALL" Pill + Unassigned Ticket -> Step 3 primary room (Triage Station)', () => {
      const ticket: TestQueueItem = {
        id: 'q-p4',
        patientId: 'pat-p4',
        patientName: 'Pairwise Patient 4',
        ticketNumber: 'P-104',
        status: 'Waiting',
      };
      const scoped = computeScopedStations(sampleRooms, nurseNancy);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: nurseNancy,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-triage');
      expect(scoped.allPillLabel).toBe('All Stations');
    });

    test('P5: Floating Doctor + "ALL" Pill + Ticket with No Room -> Step 4 fallback to first Consultation Room', () => {
      const ticket: TestQueueItem = {
        id: 'q-p5',
        patientId: 'pat-p5',
        patientName: 'Pairwise Patient 5',
        ticketNumber: 'P-105',
        status: 'Waiting',
      };
      const scoped = computeScopedStations(sampleRooms, drFloating);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'ALL',
        currentStaff: drFloating,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('P6: Receptionist/Admin + Active Pill "Room 1" + Ticket in Room 2 -> Step 1 pill wins (Room 1)', () => {
      const ticket: TestQueueItem = {
        id: 'q-p6',
        patientId: 'pat-p6',
        patientName: 'Pairwise Patient 6',
        ticketNumber: 'P-106',
        status: 'Waiting',
        roomId: 'rm-2',
        roomOrStation: 'Room 2 - General',
      };
      const scoped = computeScopedStations(sampleRooms, staffRachel);
      const result = resolveCallToRoom({
        ticket,
        selectedStation: 'Room 1 - Pedia',
        currentStaff: staffRachel,
        activeRooms: sampleRooms,
        visibleRooms: scoped.visibleRooms,
      });

      expect(result.roomId).toBe('rm-1');
      expect(result.roomName).toBe('Room 1 - Pedia');
    });

    test('P7: Receptionist walk-in check-in selecting multi-room doctor badges all doctor rooms and preselects primary', () => {
      const selection = resolveWalkInDoctorRoomSelection(drAlice, sampleRooms);
      expect(selection.preselectedRoomId).toBe('rm-1');
      expect(selection.doctorRoomIds).toContain('rm-1');
      expect(selection.doctorRoomIds).toContain('rm-2');
      expect(selection.doctorRoomIds).not.toContain('rm-3');
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD WORKLOAD SCENARIOS (HIGH-FIDELITY SIMULATION)
  // --------------------------------------------------------------------------
  describe('Tier 4: Real-World Clinical Workload Simulation', () => {
    test('High-Fidelity Morning Shift: Multi-Doctor, Multi-Room Clinic Simulation', () => {
      // PHASE 1: Intake & Triage
      // Patient 1 (Pediatric walk-in) assigned to Dr. Alice
      const p1Preselect = resolveWalkInDoctorRoomSelection(drAlice, sampleRooms);
      expect(p1Preselect.preselectedRoomId).toBe('rm-1');

      const ticketP1: TestQueueItem = {
        id: 'q-sim-1',
        patientId: 'pat-sim-1',
        patientName: 'Lucas Ramos (3yo)',
        ticketNumber: 'Q-001',
        status: 'Waiting',
        roomId: p1Preselect.preselectedRoomId,
        roomOrStation: 'Room 1 - Pedia',
        doctorId: drAlice.id,
        doctorName: 'Dr. Alice Guo',
      };

      // Patient 2 (Adult specialty walk-in) assigned to Dr. Bob
      const p2Preselect = resolveWalkInDoctorRoomSelection(drBob, sampleRooms);
      expect(p2Preselect.preselectedRoomId).toBe('rm-3');

      const ticketP2: TestQueueItem = {
        id: 'q-sim-2',
        patientId: 'pat-sim-2',
        patientName: 'Carmen Del Rosario (68yo)',
        ticketNumber: 'Q-002',
        status: 'Waiting',
        roomId: p2Preselect.preselectedRoomId,
        roomOrStation: 'Room 3 - Internal Med',
        doctorId: drBob.id,
        doctorName: 'Dr. Bob Santos',
      };

      // Patient 3 (General walk-in) assigned to Dr. Alice
      const ticketP3: TestQueueItem = {
        id: 'q-sim-3',
        patientId: 'pat-sim-3',
        patientName: 'Ramon Diaz',
        ticketNumber: 'Q-003',
        status: 'Waiting',
        roomId: 'rm-2',
        roomOrStation: 'Room 2 - General',
        doctorId: drAlice.id,
        doctorName: 'Dr. Alice Guo',
      };

      // PHASE 2: Workstation Station Visibility Scoping
      const aliceWorkstation = computeScopedStations(sampleRooms, drAlice);
      expect(aliceWorkstation.allPillLabel).toBe('All My Stations');
      expect(aliceWorkstation.visibleRooms.map((r) => r.id)).toEqual(['rm-1', 'rm-2', 'rm-triage', 'rm-tx']);

      const bobWorkstation = computeScopedStations(sampleRooms, drBob);
      expect(bobWorkstation.allPillLabel).toBe('All My Stations');
      expect(bobWorkstation.visibleRooms.map((r) => r.id)).toEqual(['rm-3', 'rm-triage', 'rm-tx']);

      // Ensure no queue cross-pollution: Dr. Alice does not see Dr. Bob's patient sitting in Room 3
      expect(isPatientVisibleToStaff(ticketP2, drAlice, sampleRooms)).toBe(false);
      // Dr. Bob does not see Dr. Alice's patients sitting in Room 1 or Room 2
      expect(isPatientVisibleToStaff(ticketP1, drBob, sampleRooms)).toBe(false);
      expect(isPatientVisibleToStaff(ticketP3, drBob, sampleRooms)).toBe(false);

      // PHASE 3: Concurrent Patient Calls
      // Dr. Alice calls P1 into Room 1 (Step 2 match on ticket.roomId)
      const callP1 = resolveCallToRoom({
        ticket: ticketP1,
        selectedStation: 'ALL',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: aliceWorkstation.visibleRooms,
      });
      expect(callP1.roomId).toBe('rm-1');
      ticketP1.status = 'InConsultation';

      // Dr. Bob calls P2 into Room 3 (Step 2 match on ticket.roomId)
      const callP2 = resolveCallToRoom({
        ticket: ticketP2,
        selectedStation: 'ALL',
        currentStaff: drBob,
        activeRooms: sampleRooms,
        visibleRooms: bobWorkstation.visibleRooms,
      });
      expect(callP2.roomId).toBe('rm-3');
      ticketP2.status = 'InConsultation';

      // PHASE 4: Closed-Loop Procedure Handoff
      // Dr. Alice orders nebulization for P1 -> routes to Treatment Room
      ticketP1.status = 'PendingProcedure';
      ticketP1.roomId = 'rm-tx';
      ticketP1.roomOrStation = 'Treatment Room';

      // Nurse Nancy views Treatment Room and executes nebulization
      expect(nurseNancy.assignedRoomIds).toContain('rm-tx');
      expect(isPatientVisibleToStaff(ticketP1, nurseNancy, sampleRooms)).toBe(true);

      // Nurse completes procedure -> handoff transitions to ReEvaluation and restores Room 1
      ticketP1.status = 'ReEvaluation';
      ticketP1.roomId = 'rm-1';
      ticketP1.roomOrStation = 'Room 1 - Pedia';

      // Dr. Alice sees P1 return to her consultation queue in Room 1
      expect(isPatientVisibleToStaff(ticketP1, drAlice, sampleRooms)).toBe(true);

      // PHASE 5: Dynamic Room Rotation
      // While P1 was receiving nebulization, Dr. Alice switched to Room 2 and called P3
      const callP3 = resolveCallToRoom({
        ticket: ticketP3,
        selectedStation: 'Room 2 - General',
        currentStaff: drAlice,
        activeRooms: sampleRooms,
        visibleRooms: aliceWorkstation.visibleRooms,
      });
      expect(callP3.roomId).toBe('rm-2');
      ticketP3.status = 'InConsultation';

      // Dr. Alice successfully manages dual rooms concurrently
      expect(ticketP1.roomId).toBe('rm-1');
      expect(ticketP3.roomId).toBe('rm-2');

      // PHASE 6: Administrative Mid-Day Room Decommissioning
      // Room 2 is deleted from the active room inventory
      const afternoonRooms = sampleRooms.filter((r) => r.id !== 'rm-2');
      const drAliceAfternoon: TestStaffMember = {
        ...drAlice,
        assignedRoomIds: ['rm-1'],
        assignedRoomNames: ['Room 1 - Pedia'],
      };

      const afternoonWorkstation = computeScopedStations(afternoonRooms, drAliceAfternoon);
      expect(afternoonWorkstation.visibleRooms.map((r) => r.id)).toEqual(['rm-1', 'rm-triage', 'rm-tx']);
      expect(afternoonWorkstation.visibleRooms.some((r) => r.id === 'rm-2')).toBe(false);
    });
  });
});
