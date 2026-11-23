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
    timing: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    sequence: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    loop: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    spring: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
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
  LEAVE_TYPE_OPTIONS,
  formatLeaveTypeLabel,
  resolveRosterEmptyStateProps,
  resolveSelectedDoctorId,
} = await import('../components/roster/DoctorRosterCalendarModal');

const { clinicService } = await import('../services/clinicService');

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

  test('Issue 244: formatLeaveTypeLabel and LEAVE_TYPE_OPTIONS format SickLeave as "Sick Leave" while preserving API values', () => {
    const sickLeaveOpt = LEAVE_TYPE_OPTIONS.find((opt) => opt.value === 'SickLeave');
    expect(sickLeaveOpt).toEqual({ value: 'SickLeave', label: 'Sick Leave' });
    expect(LEAVE_TYPE_OPTIONS.map((opt) => opt.value)).toEqual([
      'Vacation',
      'SickLeave',
      'CME',
      'Emergency',
      'Holiday',
    ]);

    expect(formatLeaveTypeLabel('SickLeave')).toBe('Sick Leave');
    expect(formatLeaveTypeLabel('Vacation')).toBe('Vacation');
    expect(formatLeaveTypeLabel('CME')).toBe('CME');
    expect(formatLeaveTypeLabel('Emergency')).toBe('Emergency');
    expect(formatLeaveTypeLabel('Holiday')).toBe('Holiday');
    expect(formatLeaveTypeLabel('')).toBe('Leave');
    expect(formatLeaveTypeLabel('   ')).toBe('Leave');
    expect(formatLeaveTypeLabel(null)).toBe('Leave');
    expect(formatLeaveTypeLabel(undefined)).toBe('Leave');
    expect(formatLeaveTypeLabel('StudyLeave')).toBe('StudyLeave');
  });

  test('Issue 244: DoctorRosterCalendarModal renders "Sick Leave" in selector chips and badges while submitting "SickLeave"', async () => {
    const origGetTemplates = clinicService.getDoctorScheduleTemplates;
    const origGetLeaves = clinicService.getDoctorLeaves;
    const origCreateLeave = clinicService.createDoctorLeave;

    const createPayloads: any[] = [];
    const doctorLeaves = [
      {
        id: 'leave-1',
        doctorId: 'doc-1',
        doctorName: 'Maria Santos',
        startDate: '2026-11-24',
        endDate: '2026-11-24',
        leaveType: 'SickLeave',
        reason: 'Flu recovery',
        status: 'Approved',
        createdAt: '2026-11-20T00:00:00Z',
      },
    ];

    try {
      clinicService.getDoctorScheduleTemplates = (async () => [[], null]) as any;
      clinicService.getDoctorLeaves = (async () => [doctorLeaves, null]) as any;
      clinicService.createDoctorLeave = (async (_docId: string, payload: any) => {
        createPayloads.push(payload);
        return [{ id: 'leave-2', ...payload, status: 'Approved', createdAt: '2026-11-20T01:00:00Z' }, null];
      }) as any;

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

      const harness = createRosterHookHarness((props: any) => DoctorRosterCalendarModal(props), {
        visible: true,
        onClose: () => {},
        doctors: sampleDoctors,
        initialDoctorId: 'doc-1',
      });
      await flushMicrotasks();

      // Switch to Leaves & Blackout Dates tab
      const leavesTabBtn = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'roster-tab-leaves'
      );
      expect(leavesTabBtn).not.toBeNull();
      leavesTabBtn.props.onPress();
      await flushMicrotasks();

      // Verify SickLeave chip displays "Sick Leave" (not "SickLeave")
      const sickChip = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'leave-type-chip-SickLeave'
      );
      expect(sickChip).not.toBeNull();
      const chipText = collectTreeText(sickChip);
      expect(chipText).toContain('Sick Leave');
      expect(chipText).not.toContain('SickLeave');

      // Verify Scheduled Leaves badge displays "Sick Leave" (not "SickLeave")
      const leaveBadge = findTreeNode(
        harness.result.current,
        (el) => el?.props?.variant === 'emergency' && typeof el?.props?.label === 'string'
      );
      expect(leaveBadge).not.toBeNull();
      expect(leaveBadge.props.label).toBe('Sick Leave');

      // Select Sick Leave chip, enter dates, and submit
      sickChip.props.onPress();
      const startInput = findTreeNode(
        harness.result.current,
        (el) => el?.props?.label === 'Start Date' && typeof el?.props?.onChangeText === 'function'
      );
      const endInput = findTreeNode(
        harness.result.current,
        (el) => el?.props?.label === 'End Date' && typeof el?.props?.onChangeText === 'function'
      );
      expect(startInput).not.toBeNull();
      expect(endInput).not.toBeNull();
      startInput.props.onChangeText('2026-11-25');
      endInput.props.onChangeText('2026-11-26');

      const submitBtn = findTreeNode(
        harness.result.current,
        (el) => el?.props?.title === 'Submit Leave' && typeof el?.props?.onPress === 'function'
      );
      expect(submitBtn).not.toBeNull();
      await submitBtn.props.onPress();

      expect(createPayloads).toHaveLength(1);
      expect(createPayloads[0].leaveType).toBe('SickLeave');
      expect(createPayloads[0].startDate).toBe('2026-11-25');
      expect(createPayloads[0].endDate).toBe('2026-11-26');

      harness.unmount();
    } finally {
      clinicService.getDoctorScheduleTemplates = origGetTemplates;
      clinicService.getDoctorLeaves = origGetLeaves;
      clinicService.createDoctorLeave = origCreateLeave;
    }
  });

  test('Issue 244: DoctorRosterCalendarModal caches templates and leaves per doctorId for the open session, invalidates on mutations, and clears on close', async () => {
    const origGetTemplates = clinicService.getDoctorScheduleTemplates;
    const origGetLeaves = clinicService.getDoctorLeaves;
    const origUpsertTemplate = clinicService.upsertDoctorScheduleTemplate;
    const origDeleteLeave = clinicService.deleteDoctorLeave;

    const templateFetches: string[] = [];
    const leaveFetches: string[] = [];

    const templatesByDoc: Record<string, any[]> = {
      'doc-1': [
        {
          id: 'tpl-doc1-mon',
          doctorId: 'doc-1',
          dayOfWeek: 'Monday',
          startTime: '08:30:00',
          endTime: '16:30:00',
          isOvernightShift: false,
          slotDurationMinutes: 30,
          isActive: true,
          breaks: [],
        },
      ],
      'doc-2': [
        {
          id: 'tpl-doc2-mon',
          doctorId: 'doc-2',
          dayOfWeek: 'Monday',
          startTime: '10:00:00',
          endTime: '18:00:00',
          isOvernightShift: false,
          slotDurationMinutes: 15,
          isActive: true,
          breaks: [],
        },
      ],
    };
    const leavesByDoc: Record<string, any[]> = {
      'doc-1': [
        {
          id: 'leave-doc1-1',
          doctorId: 'doc-1',
          doctorName: 'Maria Santos',
          startDate: '2026-12-01',
          endDate: '2026-12-01',
          leaveType: 'SickLeave',
          status: 'Approved',
          createdAt: '2026-11-20T00:00:00Z',
        },
      ],
      'doc-2': [],
    };

    try {
      clinicService.getDoctorScheduleTemplates = (async (docId: string) => {
        templateFetches.push(docId);
        return [templatesByDoc[docId] || [], null];
      }) as any;
      clinicService.getDoctorLeaves = (async (docId: string) => {
        leaveFetches.push(docId);
        return [leavesByDoc[docId] || [], null];
      }) as any;
      clinicService.upsertDoctorScheduleTemplate = (async () => [{ id: 'tpl-doc1-mon' }, null]) as any;
      clinicService.deleteDoctorLeave = (async () => [true, null]) as any;

      const doctors: StaffMember[] = [
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

      const harness = createRosterHookHarness((props: any) => DoctorRosterCalendarModal(props), {
        visible: true,
        onClose: () => {},
        doctors,
        initialDoctorId: 'doc-1',
      });
      await flushMicrotasks();

      expect(templateFetches).toEqual(['doc-1']);
      expect(leaveFetches).toEqual([]);

      // Toggle to Leaves for doc-1 -> fetches leaves once
      findTreeNode(harness.result.current, (el) => el?.props?.testID === 'roster-tab-leaves').props.onPress();
      await flushMicrotasks();
      expect(leaveFetches).toEqual(['doc-1']);

      // Toggle back to Templates for doc-1 -> served from cache (no refetch)
      findTreeNode(harness.result.current, (el) => el?.props?.testID === 'roster-tab-templates').props.onPress();
      await flushMicrotasks();
      expect(templateFetches).toEqual(['doc-1']);

      // Switch to doc-2 -> fetches doc-2 templates once
      findTreeNode(
        harness.result.current,
        (el) => el?.props?.accessibilityLabel === 'Select Dr. Juan Reyes'
      ).props.onPress();
      await flushMicrotasks();
      expect(templateFetches).toEqual(['doc-1', 'doc-2']);

      const doc2StartInput = findTreeNode(
        harness.result.current,
        (el) => el?.props?.label === 'Shift Start Time'
      );
      expect(doc2StartInput.props.value).toBe('10:00');

      // Switch back to doc-1 -> instant cache hit, no extra network call, restores 08:30
      findTreeNode(
        harness.result.current,
        (el) => el?.props?.accessibilityLabel === 'Select Dr. Maria Santos'
      ).props.onPress();
      await flushMicrotasks();
      expect(templateFetches).toEqual(['doc-1', 'doc-2']);

      const doc1StartInput = findTreeNode(
        harness.result.current,
        (el) => el?.props?.label === 'Shift Start Time'
      );
      expect(doc1StartInput.props.value).toBe('08:30');

      // Save template for doc-1 -> invalidates cache and forces refresh
      const saveBtn = findTreeNode(
        harness.result.current,
        (el) => el?.props?.title === 'Save Template' && typeof el?.props?.onPress === 'function'
      );
      await saveBtn.props.onPress();
      expect(templateFetches).toEqual(['doc-1', 'doc-2', 'doc-1']);

      // Switch to Leaves for doc-1 -> still cached (no refetch yet)
      findTreeNode(harness.result.current, (el) => el?.props?.testID === 'roster-tab-leaves').props.onPress();
      await flushMicrotasks();
      expect(leaveFetches).toEqual(['doc-1']);

      // Delete leave for doc-1 -> invalidates leave cache and forces refresh
      const deleteLeaveBtn = findTreeNode(
        harness.result.current,
        (el) => typeof el?.props?.onPress === 'function' && el?.props?.children?.props?.name === 'trash'
      );
      expect(deleteLeaveBtn).not.toBeNull();
      await deleteLeaveBtn.props.onPress();
      expect(leaveFetches).toEqual(['doc-1', 'doc-1']);

      // Close and reopen modal -> clears session cache and fetches fresh data
      harness.rerender({
        visible: false,
        onClose: () => {},
        doctors,
        initialDoctorId: 'doc-1',
      });
      await flushMicrotasks();

      harness.rerender({
        visible: true,
        onClose: () => {},
        doctors,
        initialDoctorId: 'doc-1',
      });
      await flushMicrotasks();
      expect(leaveFetches).toEqual(['doc-1', 'doc-1', 'doc-1']);

      harness.unmount();
    } finally {
      clinicService.getDoctorScheduleTemplates = origGetTemplates;
      clinicService.getDoctorLeaves = origGetLeaves;
      clinicService.upsertDoctorScheduleTemplate = origUpsertTemplate;
      clinicService.deleteDoctorLeave = origDeleteLeave;
    }
  });

  test('Issue 244: DoctorRosterCalendarModal preserves Weekly Templates layout with overlay while loading and renders SkeletonList for Leaves', async () => {
    const origGetTemplates = clinicService.getDoctorScheduleTemplates;
    const origGetLeaves = clinicService.getDoctorLeaves;

    let resolveTemplates!: (val: any) => void;
    let resolveLeaves!: (val: any) => void;

    try {
      clinicService.getDoctorScheduleTemplates = (() =>
        new Promise((resolve) => {
          resolveTemplates = resolve;
        })) as any;
      clinicService.getDoctorLeaves = (() =>
        new Promise((resolve) => {
          resolveLeaves = resolve;
        })) as any;

      const doctors: StaffMember[] = [
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

      const harness = createRosterHookHarness((props: any) => DoctorRosterCalendarModal(props), {
        visible: true,
        onClose: () => {},
        doctors,
        initialDoctorId: 'doc-1',
      });

      // While templates are loading, the form stays mounted (non-collapsing) with overlay pill
      const formWrapperDuringLoad = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'roster-templates-form'
      );
      const loadingOverlay = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'roster-templates-loading-overlay'
      );
      const saveBtnDuringLoad = findTreeNode(
        harness.result.current,
        (el) => el?.props?.title === 'Save Template'
      );
      expect(formWrapperDuringLoad).not.toBeNull();
      expect(formWrapperDuringLoad.props.pointerEvents).toBe('none');
      expect(loadingOverlay).not.toBeNull();
      expect(saveBtnDuringLoad).not.toBeNull();
      expect(saveBtnDuringLoad.props.disabled).toBe(true);

      // Resolve templates -> overlay clears, form becomes interactive
      resolveTemplates([[], null]);
      await flushMicrotasks();

      expect(
        findTreeNode(
          harness.result.current,
          (el) => el?.props?.testID === 'roster-templates-loading-overlay'
        )
      ).toBeNull();
      const formWrapperLoaded = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'roster-templates-form'
      );
      expect(formWrapperLoaded.props.pointerEvents).toBe('auto');

      // Switch to Leaves tab while leaves request is still pending -> SkeletonList shown inside leaves container
      findTreeNode(harness.result.current, (el) => el?.props?.testID === 'roster-tab-leaves').props.onPress();
      const leavesSkeleton = findTreeNode(
        harness.result.current,
        (el) => el?.props?.testID === 'roster-leaves-loading-skeleton'
      );
      expect(leavesSkeleton).not.toBeNull();

      resolveLeaves([[], null]);
      await flushMicrotasks();

      expect(
        findTreeNode(
          harness.result.current,
          (el) => el?.props?.testID === 'roster-leaves-loading-skeleton'
        )
      ).toBeNull();

      harness.unmount();
    } finally {
      clinicService.getDoctorScheduleTemplates = origGetTemplates;
      clinicService.getDoctorLeaves = origGetLeaves;
    }
  });
});

function createRosterHookHarness<Props, Result>(
  hookFn: (props: Props) => Result,
  initialProps: Props
) {
  const stateSlots: any[] = [];
  const effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  const refSlots: Array<{ current: any }> = [];
  const memoSlots: Array<{ value: any; deps: any[] }> = [];
  let slotIndex = 0;
  let effectIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let currentProps = initialProps;
  let result!: Result;
  let isRendering = false;
  let hasPendingRender = false;

  const mockHooks: any = {
    useState: (initial: any) => {
      const idx = slotIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (newVal: any) => {
        const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
        if (stateSlots[idx] !== nextVal) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial: any) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) refSlots.push({ current: initial });
      return refSlots[idx];
    },
    useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
    useMemo: (fn: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        const value = fn();
        memoSlots[idx] = { value, deps };
        return value;
      }
      return prev.value;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (context: React.Context<any>) => (context as any)._currentValue,
    useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
  };

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        slotIndex = 0;
        effectIndex = 0;
        refIndex = 0;
        memoIndex = 0;
        const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const prevDispatcher = internals ? internals.H : null;
        if (internals) internals.H = mockHooks;
        try {
          result = hookFn(currentProps);
        } finally {
          if (internals) internals.H = prevDispatcher;
        }
        for (const eff of effectSlots) {
          if (eff.hasChanged) {
            eff.hasChanged = false;
            if (typeof eff.cleanup === 'function') eff.cleanup();
            eff.cleanup = eff.fn();
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get result() {
      return { current: result };
    },
    rerender: (nextProps: Props) => {
      currentProps = nextProps;
      render();
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    },
  };
}

function findTreeNode(node: any, predicate: (el: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findTreeNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node.props?.children !== undefined) {
    return findTreeNode(node.props.children, predicate);
  }
  return null;
}

function collectTreeText(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectTreeText).join('');
  if (typeof node === 'object' && node.props?.children !== undefined) {
    return collectTreeText(node.props.children);
  }
  return '';
}

async function flushMicrotasks() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}
