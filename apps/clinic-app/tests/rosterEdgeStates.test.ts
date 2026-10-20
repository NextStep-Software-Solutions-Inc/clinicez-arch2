import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AvailableSlotItem, DoctorAvailabilityData, StaffMember } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    visible,
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
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
  RefreshControl: createMockComponent('RefreshControl'),
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
  NativeEventEmitter: class {},
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

const {
  DoctorRosterCalendarModal,
  resolveRosterEmptyStateProps,
  resolveSelectedDoctorId,
} = await import('../components/roster/DoctorRosterCalendarModal');

const { resolveSettingsRouteIntent } = await import('../components/settings/types');

describe('Roster and Slot Edge States', () => {
  test('Doctor has no template configured: returns off-duty state and empty slots', () => {
    const rawAvailability: DoctorAvailabilityData = {
      doctorId: 'doc-123',
      doctorName: 'Dr. Santos',
      date: '2026-10-12',
      isOnDuty: false,
      nonAvailabilityReason: 'No scheduled shift on this day',
      slots: [],
    };

    expect(rawAvailability.isOnDuty).toBe(false);
    expect(rawAvailability.nonAvailabilityReason).toBe('No scheduled shift on this day');
    expect(rawAvailability.slots).toHaveLength(0);
  });

  test('Doctor on approved leave: returns non-availability reason', () => {
    const rawAvailability: DoctorAvailabilityData = {
      doctorId: 'doc-123',
      doctorName: 'Dr. Santos',
      date: '2026-10-12',
      isOnDuty: false,
      nonAvailabilityReason: 'Annual Medical Conference',
      slots: [],
    };

    expect(rawAvailability.isOnDuty).toBe(false);
    expect(rawAvailability.nonAvailabilityReason).toBe('Annual Medical Conference');
    expect(rawAvailability.slots).toHaveLength(0);
  });

  test('All slots are booked (slots full): all items have isAvailable false and Booked status', () => {
    const slots: AvailableSlotItem[] = [
      {
        startTime: '09:00',
        endTime: '09:30',
        slotStartUtc: '2026-10-12T01:00:00Z',
        slotEndUtc: '2026-10-12T01:30:00Z',
        isAvailable: false,
        status: 'Booked',
        existingAppointmentId: 'appt-1',
        patientName: 'Juan Dela Cruz',
      },
      {
        startTime: '09:30',
        endTime: '10:00',
        slotStartUtc: '2026-10-12T01:30:00Z',
        slotEndUtc: '2026-10-12T02:00:00Z',
        isAvailable: false,
        status: 'Booked',
        existingAppointmentId: 'appt-2',
        patientName: 'Maria Santos',
      },
    ];

    const availableSlots = slots.filter((s) => s.isAvailable);
    expect(availableSlots).toHaveLength(0);

    const bookedSlots = slots.filter((s) => s.status === 'Booked');
    expect(bookedSlots).toHaveLength(2);
  });

  test('Break and Leave slots are marked unavailable with correct statuses', () => {
    const slots: AvailableSlotItem[] = [
      {
        startTime: '12:00',
        endTime: '12:30',
        slotStartUtc: '2026-10-12T04:00:00Z',
        slotEndUtc: '2026-10-12T04:30:00Z',
        isAvailable: false,
        status: 'Break',
        notes: 'Lunch Recess',
      },
      {
        startTime: '13:00',
        endTime: '13:30',
        slotStartUtc: '2026-10-12T05:00:00Z',
        slotEndUtc: '2026-10-12T05:30:00Z',
        isAvailable: false,
        status: 'OnLeave',
        notes: 'Partial Day Leave',
      },
      {
        startTime: '14:00',
        endTime: '14:30',
        slotStartUtc: '2026-10-12T06:00:00Z',
        slotEndUtc: '2026-10-12T06:30:00Z',
        isAvailable: true,
        status: 'Available',
      },
    ];

    expect(slots[0].isAvailable).toBe(false);
    expect(slots[0].status).toBe('Break');
    expect(slots[0].notes).toBe('Lunch Recess');

    expect(slots[1].isAvailable).toBe(false);
    expect(slots[1].status).toBe('OnLeave');

    expect(slots[2].isAvailable).toBe(true);
    expect(slots[2].status).toBe('Available');
  });

  test('Slot time formatter handles 12-hour AM/PM rollover cleanly', () => {
    function formatSlotTime(timeStr: string): string {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
        return `${formattedHours}:${minutes} ${ampm}`;
      }
      return timeStr;
    }

    expect(formatSlotTime('00:00')).toBe('12:00 AM');
    expect(formatSlotTime('09:00')).toBe('9:00 AM');
    expect(formatSlotTime('12:00')).toBe('12:00 PM');
    expect(formatSlotTime('13:30')).toBe('1:30 PM');
    expect(formatSlotTime('23:45')).toBe('11:45 PM');
  });

  test('DoctorRosterCalendarModal renders EmptyState with Add physician / staff CTA when doctors array is empty', () => {
    let addStaffClicked = false;
    const handleAddStaff = () => {
      addStaffClicked = true;
    };

    const emptyProps = resolveRosterEmptyStateProps(handleAddStaff);
    expect(emptyProps.icon).toBe('staff');
    expect(emptyProps.title).toBe('No physicians registered yet');
    expect(emptyProps.actionTitle).toBe('Add physician / staff');
    emptyProps.onAction?.();
    expect(addStaffClicked).toBe(true);

    const markup = renderToStaticMarkup(
      React.createElement(DoctorRosterCalendarModal, {
        visible: true,
        onClose: () => {},
        doctors: [],
        onAddStaff: handleAddStaff,
      })
    );

    expect(markup).toContain('No physicians registered yet');
    expect(markup).toContain(
      'Add a doctor or clinical staff member to configure weekly shift templates, slot intervals, and blackout dates.'
    );
    expect(markup).toContain('Add physician / staff');

    // Schedule form and physician selector must be hidden when no doctors exist
    expect(markup).not.toContain('Select Physician:');
    expect(markup).not.toContain('Weekly Templates');
    expect(markup).not.toContain('Leaves &amp; Blackout Dates');
    expect(markup).not.toContain('Save Template');
  });

  test('DoctorRosterCalendarModal renders physician selector and schedule form when doctors exist', () => {
    const sampleDoctors: StaffMember[] = [
      {
        id: 'doc-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Maria',
        lastName: 'Santos',
        role: 'Doctor',
        isActive: true,
        createdAt: '2026-10-14T00:00:00Z',
      },
    ];

    expect(resolveSelectedDoctorId([], '', undefined)).toBe('');
    expect(resolveSelectedDoctorId(sampleDoctors, '', undefined)).toBe('doc-1');

    const markup = renderToStaticMarkup(
      React.createElement(DoctorRosterCalendarModal, {
        visible: true,
        onClose: () => {},
        doctors: sampleDoctors,
      })
    );

    expect(markup).toContain('Select Physician:');
    expect(markup).toContain('Dr. Maria Santos');
    expect(markup).toContain('Weekly Templates');
    expect(markup).toContain('Save Template');
    expect(markup).not.toContain('No physicians registered yet');
  });

  test('Issue #23: resolveSelectedDoctorId preserves switched physician and does not reset to initialDoctorId', () => {
    const multiDoctors: StaffMember[] = [
      {
        id: 'doc-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Maria',
        lastName: 'Santos',
        role: 'Doctor',
        isActive: true,
        createdAt: '2026-10-14T00:00:00Z',
      },
      {
        id: 'doc-2',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Juan',
        lastName: 'Reyes',
        role: 'Doctor',
        isActive: true,
        createdAt: '2026-10-14T00:00:00Z',
      },
    ];

    // When user switches to doc-2, currentSelectedId is doc-2 even though initialDoctorId was doc-1.
    // Must NOT reset back to doc-1:
    expect(resolveSelectedDoctorId(multiDoctors, 'doc-2', 'doc-1')).toBe('doc-2');

    // When modal first opens and no physician has been selected yet, initialDoctorId is honored:
    expect(resolveSelectedDoctorId(multiDoctors, '', 'doc-2')).toBe('doc-2');
    expect(resolveSelectedDoctorId(multiDoctors, undefined, 'doc-2')).toBe('doc-2');

    // If current selected doctor was deleted/removed from staff, gracefully fallback to initialDoctorId:
    expect(resolveSelectedDoctorId(multiDoctors, 'deleted-doc', 'doc-2')).toBe('doc-2');

    // If both current selection and initialDoctorId are absent/invalid, fallback to first doctor:
    expect(resolveSelectedDoctorId(multiDoctors, 'deleted-doc', 'deleted-init')).toBe('doc-1');
    expect(resolveSelectedDoctorId(multiDoctors, '', undefined)).toBe('doc-1');

    // Empty doctors array returns empty string safely:
    expect(resolveSelectedDoctorId([], 'doc-2', 'doc-1')).toBe('');
  });

  test('Issue #23: DoctorRosterCalendarModal renders physician pills with accessibility roles and labels for multi-doctor clinics', () => {
    const multiDoctors: StaffMember[] = [
      {
        id: 'doc-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Maria',
        lastName: 'Santos',
        role: 'Doctor',
        isActive: true,
        createdAt: '2026-10-14T00:00:00Z',
      },
      {
        id: 'doc-2',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Juan',
        lastName: 'Reyes',
        role: 'Doctor',
        isActive: true,
        createdAt: '2026-10-14T00:00:00Z',
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(DoctorRosterCalendarModal, {
        visible: true,
        onClose: () => {},
        doctors: multiDoctors,
        initialDoctorId: 'doc-2',
      })
    );

    expect(markup).toContain('Select Physician:');
    expect(markup).toContain('Dr. Maria Santos');
    expect(markup).toContain('Dr. Juan Reyes');
    expect(markup).toContain('aria-label="Select Dr. Maria Santos"');
    expect(markup).toContain('aria-label="Select Dr. Juan Reyes"');
  });

  test('resolveSettingsRouteIntent routes openAddStaff to the staff tab and opens the Add Staff modal', () => {
    expect(resolveSettingsRouteIntent(undefined)).toEqual({
      targetTab: null,
      shouldOpenAddStaff: false,
    });

    expect(resolveSettingsRouteIntent({ tab: 'staff', openAddStaff: true })).toEqual({
      targetTab: 'staff',
      shouldOpenAddStaff: true,
    });

    expect(resolveSettingsRouteIntent({ openAddStaff: true })).toEqual({
      targetTab: 'staff',
      shouldOpenAddStaff: true,
    });

    expect(resolveSettingsRouteIntent({ tab: 'services' })).toEqual({
      targetTab: 'services',
      shouldOpenAddStaff: false,
    });
  });
});
