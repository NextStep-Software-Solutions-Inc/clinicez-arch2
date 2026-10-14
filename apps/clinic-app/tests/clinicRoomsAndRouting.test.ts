// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicApiClient } = await import('../services/apiClient');
const { clinicService } = await import('../services/clinicService');
const { ClinicRoomsSettingsCard } = await import('../components/settings/ClinicRoomsSettingsCard');

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
});

