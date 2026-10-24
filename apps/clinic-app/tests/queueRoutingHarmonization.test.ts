// token-guard:ignore-file
// @ts-ignore
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClinicRoom, StaffMember } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));
mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));
mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, disabled, style }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(disabled ? { 'data-disabled': 'true' } : {}),
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
  RefreshControl: createMockComponent('RefreshControl'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Alert: { alert: () => {} },
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
    },
    timing: () => ({ start: (cb: any) => cb && cb() }),
    spring: () => ({ start: (cb: any) => cb && cb() }),
  },
}));

const { QueueRoutingSelector } = await import('../components/queue/QueueRoutingSelector');

const mockDoctors: StaffMember[] = [
  {
    id: 'doc-santos',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Maria',
    lastName: 'Santos',
    title: 'Dr.',
    role: 'Doctor',
    isActive: true,
    email: 'santos@clinic.local',
    contactNumber: '09171234567',
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomNames: ['Room 1', 'Room 2'],
    assignedRoomId: 'room-1',
    assignedRoomName: 'Room 1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'doc-reyes',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Juan',
    lastName: 'Reyes',
    title: 'Dr.',
    role: 'Doctor',
    isActive: true,
    email: 'reyes@clinic.local',
    contactNumber: '09171234568',
    assignedRoomIds: ['room-3'],
    assignedRoomNames: ['Room 3'],
    assignedRoomId: 'room-3',
    assignedRoomName: 'Room 3',
    createdAt: new Date().toISOString(),
  },
];

const mockRooms: ClinicRoom[] = [
  {
    id: 'room-1',
    clinicId: 'clinic-1',
    name: 'Room 1',
    category: 'Consultation',
    displayOrder: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'room-2',
    clinicId: 'clinic-1',
    name: 'Room 2',
    category: 'Consultation',
    displayOrder: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'room-3',
    clinicId: 'clinic-1',
    name: 'Room 3',
    category: 'Consultation',
    displayOrder: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

const formatStaffName = (staff: StaffMember) =>
  `${staff.title ? `${staff.title} ` : ''}${staff.firstName} ${staff.lastName}`.trim();

describe('QueueRoutingSelector Harmonization Tests', () => {
  test('1. Renders default "Any Available Doctor" and "Auto / Unassigned" as active', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QueueRoutingSelector, {
        selectedDoctorId: '',
        onSelectDoctor: () => {},
        selectedRoomId: '',
        onSelectRoom: () => {},
        activeDoctors: mockDoctors,
        activeRooms: mockRooms,
        formatStaffName,
      })
    );

    expect(markup).toContain('Attending Doctor (Optional)');
    expect(markup).toContain('Any Available Doctor');
    expect(markup).toContain('Dr. Maria Santos · Room 1, Room 2');
    expect(markup).toContain('Room / Station (Optional)');
    expect(markup).toContain('Auto / Unassigned');
  });

  test('2. Highlights selected doctor and marks primary room', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QueueRoutingSelector, {
        selectedDoctorId: 'doc-santos',
        onSelectDoctor: () => {},
        selectedRoomId: 'room-1',
        onSelectRoom: () => {},
        activeDoctors: mockDoctors,
        activeRooms: mockRooms,
        formatStaffName,
      })
    );

    expect(markup).toContain('Room 1 (Primary)');
    expect(markup).toContain('Room 2 (Doctor&#x27;s Room)');
    expect(markup).toContain('Room 3');
  });

  test('3. Handles doctor selection callback and auto-defaults to primary room', () => {
    let selectedDoctor = '';
    let selectedRoom = '';

    const selector = QueueRoutingSelector({
      selectedDoctorId: '',
      onSelectDoctor: (docId: string) => {
        selectedDoctor = docId;
      },
      selectedRoomId: '',
      onSelectRoom: (roomId: string) => {
        selectedRoom = roomId;
      },
      activeDoctors: mockDoctors,
      activeRooms: mockRooms,
      formatStaffName,
    });

    // Simulate clicking Dr. Santos
    const doctorPressable: any = (selector as any).props.children[0].props.children[1].props.children[1][0];
    doctorPressable.props.onPress();

    expect(selectedDoctor).toBe('doc-santos');
    expect(selectedRoom).toBe('room-1'); // Defaulted to Dr. Santos' primary room!
  });

  test('4. Switching back to "Any Available Doctor" resets room to Auto/Unassigned', () => {
    let selectedDoctor = 'doc-santos';
    let selectedRoom = 'room-1';

    const selector = QueueRoutingSelector({
      selectedDoctorId: 'doc-santos',
      onSelectDoctor: (docId: string) => {
        selectedDoctor = docId;
      },
      selectedRoomId: 'room-1',
      onSelectRoom: (roomId: string) => {
        selectedRoom = roomId;
      },
      activeDoctors: mockDoctors,
      activeRooms: mockRooms,
      formatStaffName,
    });

    // Simulate clicking Any Available Doctor
    const anyDocPressable: any = (selector as any).props.children[0].props.children[1].props.children[0];
    anyDocPressable.props.onPress();

    expect(selectedDoctor).toBe('');
    expect(selectedRoom).toBe(''); // Reset to Auto / Unassigned!
  });
});
