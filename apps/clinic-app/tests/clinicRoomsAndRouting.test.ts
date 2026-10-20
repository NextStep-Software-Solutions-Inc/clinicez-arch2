// token-guard:ignore-file
// @ts-ignore
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClinicRoom } from '../services/clinicService';

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
const {
  clinicService,
  computeScopedStations,
  isPatientVisibleToStaff,
  resolveCallToRoom,
  getOtherRoomCoverageText,
  resolveWalkInDoctorRoomSelection,
} = await import('../services/clinicService');
const { ClinicRoomsSettingsCard } = await import('../components/settings/ClinicRoomsSettingsCard');
const { getDeviceItem, setDeviceItem } = await import('../utils/deviceStorage');

describe('ClinicRoom Domain Entity & Multi-Room Routing — Frontend Suite', () => {
  test('1. clinicService.getRooms calls GET /rooms with activeOnly query param', async () => {
    const origGet = clinicApiClient.get;
    let calledUrl = '';
    clinicApiClient.get = (async (url: string) => {
      calledUrl = url;
      return [
        [
          {
            id: 'room-1',
            name: 'Room 1',
            code: 'RM-1',
            type: 'Consultation',
            sortOrder: 1,
            isActive: true,
          },
          {
            id: 'room-tx',
            name: 'Treatment Room',
            code: 'TX-1',
            type: 'Treatment',
            sortOrder: 4,
            isActive: true,
          },
        ],
        null,
      ];
    }) as any;

    try {
      const [rooms, err] = await clinicService.getRooms(true);
      expect(err).toBeNull();
      expect(calledUrl).toBe('/rooms?activeOnly=true');
      expect(rooms).toHaveLength(2);
      expect(rooms?.[0].name).toBe('Room 1');
      expect(rooms?.[1].type).toBe('Treatment');
    } finally {
      clinicApiClient.get = origGet;
    }
  });

  test('2. clinicService.createRoom, updateRoom, and deleteRoom call the /rooms REST endpoints', async () => {
    const origPost = clinicApiClient.post;
    const origPut = clinicApiClient.put;
    const origDel = clinicApiClient.delete;
    const calls: { method: string; url: string; body?: any }[] = [];

    clinicApiClient.post = (async (url: string, body: any) => {
      calls.push({ method: 'POST', url, body });
      return [{ id: 'room-3', ...body, isActive: true }, null];
    }) as any;
    clinicApiClient.put = (async (url: string, body: any) => {
      calls.push({ method: 'PUT', url, body });
      return [{ id: 'room-3', ...body }, null];
    }) as any;
    clinicApiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return [{ deleted: true }, null];
    }) as any;

    try {
      const [created] = await clinicService.createRoom({
        name: 'Room 3 - Dental Suite',
        code: 'RM-3',
        type: 'Consultation',
        sortOrder: 5,
      });
      expect(created?.name).toBe('Room 3 - Dental Suite');

      await clinicService.updateRoom('room-3', {
        name: 'Room 3 - Dental & ENT',
        code: 'RM-3',
        type: 'Consultation',
        sortOrder: 5,
        isActive: true,
      });

      await clinicService.deleteRoom('room-3');

      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual({
        method: 'POST',
        url: '/rooms',
        body: {
          name: 'Room 3 - Dental Suite',
          code: 'RM-3',
          type: 'Consultation',
          sortOrder: 5,
        },
      });
      expect(calls[1].method).toBe('PUT');
      expect(calls[1].url).toBe('/rooms/room-3');
      expect(calls[2]).toEqual({
        method: 'DELETE',
        url: '/rooms/room-3',
      });
    } finally {
      clinicApiClient.post = origPost;
      clinicApiClient.put = origPut;
      clinicApiClient.delete = origDel;
    }
  });

  test('3. clinicService.checkInPatient transmits roomId and assignedDoctorId in payload', async () => {
    const origPost = clinicApiClient.post;
    let capturedBody: any = null;
    clinicApiClient.post = (async (_url: string, body: any) => {
      capturedBody = body;
      return [
        {
          id: 'q-101',
          ticketNumber: 'A-101',
          patientId: 'pat-1',
          patientName: 'Juan Dela Cruz',
          priority: 'Urgent',
          status: 'Waiting',
          roomId: 'room-2',
          roomOrStation: 'Room 2',
          assignedDoctorId: 'doc-2',
          assignedDoctorName: 'Dr. Reyes',
          waitTimeMinutes: 0,
          checkedInAt: new Date().toISOString(),
        },
        null,
      ];
    }) as any;

    try {
      const [item, err] = await clinicService.checkInPatient({
        patientId: 'pat-1',
        priority: 'Urgent',
        chiefComplaint: 'Chest tightness',
        assignedDoctorId: 'doc-2',
        roomId: 'room-2',
        roomOrStation: 'Room 2',
      });
      expect(err).toBeNull();
      expect(capturedBody.roomId).toBe('room-2');
      expect(capturedBody.assignedDoctorId).toBe('doc-2');
      expect(item?.roomOrStation).toBe('Room 2');
    } finally {
      clinicApiClient.post = origPost;
    }
  });

  test('4. ClinicRoomsSettingsCard renders title, description, and Add Room action', () => {
    const markup = renderToStaticMarkup(React.createElement(ClinicRoomsSettingsCard));
    expect(markup).toContain('Clinic Rooms &amp; Stations');
    expect(markup).toContain('Add Room');
  });

  test('5. clinicService.reorderRooms calls POST /rooms/reorder with orderedIds', async () => {
    const origPost = clinicApiClient.post;
    let calledUrl = '';
    let calledBody: any = null;
    clinicApiClient.post = (async (url: string, body: any) => {
      calledUrl = url;
      calledBody = body;
      return [true, null];
    }) as any;

    try {
      const [ok, err] = await clinicService.reorderRooms(['room-2', 'room-1', 'room-tx']);
      expect(err).toBeNull();
      expect(ok).toBe(true);
      expect(calledUrl).toBe('/rooms/reorder');
      expect(calledBody).toEqual({ orderedIds: ['room-2', 'room-1', 'room-tx'] });
    } finally {
      clinicApiClient.post = origPost;
    }
  });

  test('6. Scoped station visibility for Single-Room Doctor restricts to assigned + shared stations', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 0, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-tx', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 4, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const singleRoomDoc = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Maria',
      lastName: 'Santos',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1'],
      assignedRoomNames: ['Room 1'],
      isActive: true,
      createdAt: '',
    };

    const config = computeScopedStations(activeRooms, singleRoomDoc);
    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-1');
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-triage', 'room-tx']);
    expect(config.visibleRooms.some((r) => r.id === 'room-2')).toBe(false);
  });

  test('7. Scoped station visibility for Multi-Room Doctor restricts to assigned rooms + shared stations', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-3', name: 'Room 3', type: 'Consultation', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 0, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 4, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-tx', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 5, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const multiRoomDoc = {
      id: 'doc-multi',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Alice',
      lastName: 'Cruz',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1', 'room-2'],
      assignedRoomNames: ['Room 1', 'Room 2'],
      isActive: true,
      createdAt: '',
    };

    const config = computeScopedStations(activeRooms, multiRoomDoc);
    expect(config.allPillLabel).toBe('All My Stations');
    expect(config.defaultStationId).toBe('room-1');
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-2', 'room-triage', 'room-tx']);
    expect(config.visibleRooms.some((r) => r.id === 'room-3')).toBe(false);
  });

  test('8. Scoped station visibility for Nurse with assigned room defaults to assigned room', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-tx', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const nurse = {
      id: 'nurse-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Nancy',
      lastName: 'Reyes',
      role: 'Nurse' as const,
      assignedRoomIds: ['room-tx'],
      assignedRoomNames: ['Treatment Room'],
      isActive: true,
      createdAt: '',
    };

    const config = computeScopedStations(activeRooms, nurse);
    expect(config.allPillLabel).toBe('All Stations');
    expect(config.defaultStationId).toBe('room-tx');
    expect(config.visibleRooms.map((r) => r.id)).toEqual(['room-triage', 'room-tx']);
    expect(config.visibleRooms.some((r) => r.id === 'room-1')).toBe(false);
  });

  test('9. Scoped station visibility for Floating Staff, Receptionist and Admin shows all active rooms', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 0, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const floatingDoc = {
      id: 'doc-float',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Float',
      lastName: 'Doc',
      role: 'Doctor' as const,
      assignedRoomIds: [],
      assignedRoomNames: [],
      isActive: true,
      createdAt: '',
    };
    const receptionist = {
      id: 'rec-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Rachel',
      lastName: 'Front',
      role: 'Receptionist' as const,
      assignedRoomIds: [],
      assignedRoomNames: [],
      isActive: true,
      createdAt: '',
    };

    const docConfig = computeScopedStations(activeRooms, floatingDoc);
    expect(docConfig.allPillLabel).toBe('All Stations');
    expect(docConfig.visibleRooms).toHaveLength(3);

    const recConfig = computeScopedStations(activeRooms, receptionist);
    expect(recConfig.allPillLabel).toBe('All Stations');
    expect(recConfig.visibleRooms).toHaveLength(3);
  });

  test('10. 4-Step Call-to-Room Resolution respects priority steps 1 through 4', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-3', name: 'Room 3', type: 'Consultation', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 0, createdAt: '' },
    ];
    const visibleRooms = activeRooms;
    const multiDoc = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Doc',
      lastName: 'One',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1', 'room-2'],
      assignedRoomNames: ['Room 1', 'Room 2'],
      isActive: true,
      createdAt: '',
    };
    const floatingDoc = {
      id: 'doc-f',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Float',
      lastName: 'Doc',
      role: 'Doctor' as const,
      assignedRoomIds: [],
      assignedRoomNames: [],
      isActive: true,
      createdAt: '',
    };

    // Step 1: Active station pill selected (not ALL and matches visible room)
    const step1 = resolveCallToRoom({
      ticket: { id: 't1', patientId: 'p1', patientName: 'P1', ticketNumber: 'A1', status: 'Triaged', queueNumber: 'A1', waitTimeMinutes: 0 } as any,
      selectedStation: 'Room 2',
      currentStaff: multiDoc,
      activeRooms,
      visibleRooms,
    });
    expect(step1.roomName).toBe('Room 2');
    expect(step1.roomId).toBe('room-2');

    // Step 2: Ticket check-in room matches doctor's assigned room
    const step2 = resolveCallToRoom({
      ticket: { id: 't2', patientId: 'p2', patientName: 'P2', ticketNumber: 'A2', status: 'Triaged', queueNumber: 'A2', waitTimeMinutes: 0, roomId: 'room-2', roomOrStation: 'Room 2' } as any,
      selectedStation: 'ALL',
      currentStaff: multiDoc,
      activeRooms,
      visibleRooms,
    });
    expect(step2.roomName).toBe('Room 2');
    expect(step2.roomId).toBe('room-2');

    // Step 3: Clinician's primary assigned room
    const step3 = resolveCallToRoom({
      ticket: { id: 't3', patientId: 'p3', patientName: 'P3', ticketNumber: 'A3', status: 'Triaged', queueNumber: 'A3', waitTimeMinutes: 0, roomId: 'room-3', roomOrStation: 'Room 3' } as any,
      selectedStation: 'ALL',
      currentStaff: multiDoc,
      activeRooms,
      visibleRooms,
    });
    expect(step3.roomName).toBe('Room 1');
    expect(step3.roomId).toBe('room-1');

    // Step 4: Floating doctor fallback to first consultation room
    const step4 = resolveCallToRoom({
      ticket: { id: 't4', patientId: 'p4', patientName: 'P4', ticketNumber: 'A4', status: 'Triaged', queueNumber: 'A4', waitTimeMinutes: 0 } as any,
      selectedStation: 'ALL',
      currentStaff: floatingDoc,
      activeRooms,
      visibleRooms,
    });
    expect(step4.roomName).toBe('Room 1');
    expect(step4.roomId).toBe('room-1');
  });

  test('11. isPatientVisibleToStaff filters queue for doctor rooms', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const doctor = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Dr',
      lastName: 'One',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1'],
      assignedRoomNames: ['Room 1'],
      isActive: true,
      createdAt: '',
    };

    // Patient in doctor's assigned room is visible
    expect(isPatientVisibleToStaff({ id: 'q1', roomId: 'room-1', patientId: 'p1', patientName: 'P1', ticketNumber: 'A1', status: 'Triaged', queueNumber: 'A1', waitTimeMinutes: 0 } as any, doctor, activeRooms)).toBe(true);

    // Patient in triage is visible
    expect(isPatientVisibleToStaff({ id: 'q2', roomId: 'room-triage', patientId: 'p2', patientName: 'P2', ticketNumber: 'A2', status: 'Waiting', queueNumber: 'A2', waitTimeMinutes: 0 } as any, doctor, activeRooms)).toBe(true);

    // Patient in another doctor's consultation room is hidden unless assigned to doctor
    expect(isPatientVisibleToStaff({ id: 'q3', roomId: 'room-2', patientId: 'p3', patientName: 'P3', ticketNumber: 'A3', status: 'Triaged', queueNumber: 'A3', waitTimeMinutes: 0 } as any, doctor, activeRooms)).toBe(false);

    // Patient in another doctor's consultation room assigned to this doctor is visible
    expect(isPatientVisibleToStaff({ id: 'q4', roomId: 'room-2', doctorId: 'doc-1', patientId: 'p4', patientName: 'P4', ticketNumber: 'A4', status: 'Triaged', queueNumber: 'A4', waitTimeMinutes: 0 } as any, doctor, activeRooms)).toBe(true);
  });

  test('12. getOtherRoomCoverageText renders additive coverage phrasing', () => {
    const sortedRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const staff = {
      id: 's1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Maria',
      lastName: 'Santos',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1'],
      assignedRoomNames: ['Room 1'],
      isActive: true,
      createdAt: '',
    };

    // Selected in Room 2 while already in Room 1 -> "Also in Room 1 · Will cover both"
    expect(getOtherRoomCoverageText(staff, 'room-2', sortedRooms, true)).toBe('Also in Room 1 · Will cover both');
    // Not selected in Room 2 while already in Room 1 -> "Currently in Room 1"
    expect(getOtherRoomCoverageText(staff, 'room-2', sortedRooms, false)).toBe('Currently in Room 1');
  });

  test('13. resolveWalkInDoctorRoomSelection preselects primary doctor room', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const doctor = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Alice',
      lastName: 'Cruz',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-2', 'room-1'],
      assignedRoomNames: ['Room 2', 'Room 1'],
      isActive: true,
      createdAt: '',
    };

    const res = resolveWalkInDoctorRoomSelection(doctor, activeRooms);
    expect(res.preselectedRoomId).toBe('room-2');
    expect(res.doctorRoomIds).toEqual(['room-2', 'room-1']);
  });

  test('14. computeScopedStations with activeView scopes stations dynamically', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-2', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-triage', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 3, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-tx', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 4, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const doctor = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Alice',
      lastName: 'Cruz',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1'],
      assignedRoomNames: ['Room 1'],
      isActive: true,
      createdAt: '',
    };

    // MyRoom view scopes to doctor's assigned consult rooms
    const myRoomScope = computeScopedStations(activeRooms, doctor, 'MyRoom');
    expect(myRoomScope.allPillLabel).toBe('All My Rooms');
    expect(myRoomScope.visibleRooms.map((r) => r.id)).toEqual(['room-1']);

    // PendingProcedure view scopes to Treatment/Procedure rooms
    const procScope = computeScopedStations(activeRooms, doctor, 'PendingProcedure');
    expect(procScope.allPillLabel).toBe('All Procedure Stations');
    expect(procScope.visibleRooms.map((r) => r.id)).toEqual(['room-tx']);

    // Triage view scopes to Triage rooms
    const triageScope = computeScopedStations(activeRooms, doctor, 'Triage');
    expect(triageScope.allPillLabel).toBe('All Triage Stations');
    expect(triageScope.visibleRooms.map((r) => r.id)).toEqual(['room-triage']);

    // All view includes assigned consult rooms + shared stations
    const allScope = computeScopedStations(activeRooms, doctor, 'All');
    expect(allScope.allPillLabel).toBe('All My Stations');
    expect(allScope.visibleRooms.map((r) => r.id)).toEqual(['room-1', 'room-triage', 'room-tx']);
  });

  test('15. Station reset logic resets invalid station when switching views', () => {
    const activeRooms: ClinicRoom[] = [
      { id: 'room-1', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
      { id: 'room-tx', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 2, tenantId: 't1', clinicId: 'c1', assignedStaffCount: 1, createdAt: '' },
    ];
    const doctor = {
      id: 'doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Bob',
      lastName: 'Ong',
      role: 'Doctor' as const,
      assignedRoomIds: ['room-1'],
      assignedRoomNames: ['Room 1'],
      isActive: true,
      createdAt: '',
    };

    // Helper imitating screen station validation on view change
    const checkStationValid = (currentStation: string, view: any) => {
      const scope = computeScopedStations(activeRooms, doctor, view);
      if (currentStation === 'ALL') return true;
      return scope.visibleRooms.some((r) => r.name === currentStation || r.id === currentStation);
    };

    // In 'All' view, Treatment Room is valid
    expect(checkStationValid('Treatment Room', 'All')).toBe(true);

    // Switching to 'MyRoom', Treatment Room is no longer valid (should reset to 'ALL')
    expect(checkStationValid('Treatment Room', 'MyRoom')).toBe(false);

    // In 'MyRoom', Room 1 is valid
    expect(checkStationValid('Room 1', 'MyRoom')).toBe(true);

    // Switching to 'PendingProcedure', Room 1 is no longer valid (should reset to 'ALL')
    expect(checkStationValid('Room 1', 'PendingProcedure')).toBe(false);
  });

  test('16. Active queue filters exclude Completed, Cancelled, and NoShow encounters, and Completed view isolates completed encounters', () => {
    const mockQueue = [
      { id: 'q1', status: 'Triaged', patientName: 'Ready Patient' },
      { id: 'q2', status: 'InConsultation', patientName: 'Consult Patient' },
      { id: 'q3', status: 'PendingProcedure', patientName: 'Procedure Patient' },
      { id: 'q4', status: 'ReEvaluation', patientName: 'Re-eval Patient' },
      { id: 'q5', status: 'Completed', patientName: 'Completed Patient' },
      { id: 'q6', status: 'Cancelled', patientName: 'Cancelled Patient' },
      { id: 'q7', status: 'NoShow', patientName: 'NoShow Patient' },
    ];

    // Helper imitating screen's displayedPatients logic
    const getDisplayed = (queueView: string) => {
      if (queueView === 'Completed') {
        return mockQueue.filter((p) => p.status === 'Completed');
      }
      if (queueView === 'All') {
        return mockQueue.filter((p) => p.status !== 'Cancelled' && p.status !== 'NoShow');
      }
      return mockQueue.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled' && p.status !== 'NoShow');
    };

    // Active workflow views (WaitingForDoctor, MyRoom, PendingProcedure)
    const activePatients = getDisplayed('WaitingForDoctor');
    expect(activePatients.map((p) => p.id)).toEqual(['q1', 'q2', 'q3', 'q4']);

    // Completed tab view
    const completedPatients = getDisplayed('Completed');
    expect(completedPatients.map((p) => p.id)).toEqual(['q5']);

    // All Queue view
    const allPatients = getDisplayed('All');
    expect(allPatients.map((p) => p.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);

    // Retirement on finalize encounter
    let currentActive = [...activePatients];
    const encounterSignedPatientId = 'q2';
    currentActive = currentActive.filter((p) => p.id !== encounterSignedPatientId);
    expect(currentActive.map((p) => p.id)).toEqual(['q1', 'q3', 'q4']);
  });

  test('17. Device storage persistence saves and restores workstation view and station filters including Completed view', () => {
    const staffId = 'staff-persistent-test-123';
    const viewKey = `clinicez:consultations:${staffId}:queueView`;
    const stationKey = `clinicez:consultations:${staffId}:station`;

    setDeviceItem(viewKey, 'Completed');
    setDeviceItem(stationKey, 'Room 1');

    expect(getDeviceItem(viewKey)).toBe('Completed');
    expect(getDeviceItem(stationKey)).toBe('Room 1');
  });
});

