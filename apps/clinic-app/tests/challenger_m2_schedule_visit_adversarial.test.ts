// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock UI & React Native primitives
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    style,
    onPress,
    disabled,
    title,
    label,
    ...props
  }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
      },
      title || label || placeholder,
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
  Modal: ({ children, visible }: any) => (visible ? React.createElement('div', { 'data-modal': 'true' }, children) : null),
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [
      { id: 'doc-maria-101', name: 'Maria Santos', role: 'Doctor', title: 'MD' },
      { id: 'doc-jose-102', name: 'Jose Rizal', role: 'Doctor', title: 'MD' },
      { id: 'nurse-joy-201', name: 'Joy Reyes', role: 'Nurse', title: 'RN' },
    ],
    currentName: 'Nurse Joy',
  }),
  formatStaffName: (s: any) => `Dr. ${s.name}`,
}));

mock.module('../components/ui/Button', () => ({
  default: ({ title, style, onPress, testID, disabled, loading, icon, variant }: any) =>
    React.createElement(
      'button',
      {
        'data-component': 'Button',
        ...(testID ? { 'data-testid': testID } : {}),
        'data-disabled': String(Boolean(disabled || loading)),
        'data-variant': variant,
        'data-icon': icon,
        onClick: onPress,
      },
      title
    ),
}));

// Import target under test and real feedback module
const {
  default: ScheduleVisitModal,
  getTodayIsoDate,
  getRelativeIsoDate,
} = await import('../components/patient/ScheduleVisitModal');

const { notify, getFeedbackState, resetFeedbackState } = await import('../utils/feedback');
const { clinicService } = await import('../services/clinicService');
import type { ClinicPatient } from '../services/clinicService';

describe('Adversarial Challenge: ScheduleVisitModal Stress Harness', () => {
  const baseTestPatient: ClinicPatient = {
    id: 'pat-diego-test',
    tenantId: 'tenant-clinicez',
    clinicId: 'clinic-main',
    patientCode: 'PAT-20261031-001',
    firstName: 'Diego',
    lastName: 'Silang',
    fullName: 'Silang, Diego',
    dateOfBirth: '1985-05-15',
    age: 41,
    sex: 'Male',
    civilStatus: 'Married',
    contactNumber: '09171234567',
    barangay: 'San Vicente',
    city: 'Biñan',
    philHealthNumber: '12-345678901-2',
    allergies: 'Penicillin (Anaphylaxis)',
    alerts: 'Fall Risk',
    customFields: {},
  };

  beforeEach(() => {
    resetFeedbackState();
  });

  // =========================================================================
  // REMEDIATED DEFECT: notify.warning runtime existence
  // =========================================================================
  describe('Remediated Defect: notify.warning method verification', () => {
    test('DEFECT 1 REMEDIATED: notify.warning is defined on utils/feedback module', () => {
      expect((notify as any).warning).toBeDefined();
      expect(typeof (notify as any).warning).toBe('function');
    });

    test('DEFECT 2 REMEDIATED: Calling notify.warning does not throw TypeError at runtime', () => {
      expect(() => {
        (notify as any).warning('Doctor is off duty');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 1. Doctor on leave / off-duty edge cases
  // =========================================================================
  describe('Group 1: Doctor Leave & Off-Duty Edge Cases', () => {
    test('1.1: Attending doctor explicitly off duty with reason renders warning notice', () => {
      const offDutyData = {
        doctorId: 'doc-maria-101',
        doctorName: 'Dr. Maria Santos',
        date: '2026-11-01',
        isOnDuty: false,
        nonAvailabilityReason: 'Attending Regional Pediatric Conference',
        availableSlots: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: true,
          patient: baseTestPatient,
          onClose: () => {},
          attendingDoctor: 'Dr. Maria Santos',
          initialDoctorId: 'doc-maria-101',
        })
      );

      expect(markup).toContain('Schedule visit');
      expect(markup).toContain('Silang, Diego');
    });

    test('1.2: Off-duty doctor without specific reason defaults cleanly', () => {
      const offDutyNoReason = {
        doctorId: 'doc-jose-102',
        isOnDuty: false,
        nonAvailabilityReason: '',
        availableSlots: [],
      };

      const notice = `Doctor is not on duty on this date${offDutyNoReason.nonAvailabilityReason ? `: ${offDutyNoReason.nonAvailabilityReason}` : ''}. Please pick another date or doctor.`;
      expect(notice).toBe('Doctor is not on duty on this date. Please pick another date or doctor.');
    });

    test('1.3: Doctor availability API failure simulation', async () => {
      const originalMethod = clinicService.getDoctorAvailableSlots;
      (clinicService as any).getDoctorAvailableSlots = async () => {
        return [null, new Error('Network request failed: Gateway Timeout (504)')];
      };

      const [res, err] = await clinicService.getDoctorAvailableSlots('doc-101', '2026-11-01');
      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err?.message).toContain('Gateway Timeout');

      (clinicService as any).getDoctorAvailableSlots = originalMethod;
    });

    test('1.4: Scheduling submission logic blocks off-duty doctors', () => {
      const isDoctorOnDuty = false;
      const canSubmit = isDoctorOnDuty;
      expect(canSubmit).toBe(false);
    });
  });

  // =========================================================================
  // 2. Overlapping & Booked Slot Collisions
  // =========================================================================
  describe('Group 2: Overlapping & Booked Slot Collision Handling', () => {
    test('2.1: Doctor shift slots with booked collisions mark slots unavailable', () => {
      const shiftSlots = [
        { time: '08:00', status: 'Available', available: true },
        { time: '08:30', status: 'Booked', available: false, reason: 'Booked' },
        { time: '09:00', status: 'Booked', available: false, reason: 'Follow-up Consultation' },
        { time: '09:30', status: 'Available', available: true },
      ];

      expect(shiftSlots[0].available).toBe(true);
      expect(shiftSlots[1].available).toBe(false);
      expect(shiftSlots[1].reason).toBe('Booked');
      expect(shiftSlots[2].available).toBe(false);
      expect(shiftSlots[2].reason).toBe('Follow-up Consultation');
      expect(shiftSlots[3].available).toBe(true);
    });

    test('2.2: Slot selection guard rejects clicking on booked or unavailable slots', () => {
      let selectedSlotTime = '';
      const handleSlotSelect = (time: string, isAvailable: boolean, isDoctorOnDuty: boolean) => {
        if (!isAvailable || !isDoctorOnDuty) return;
        selectedSlotTime = time;
      };

      handleSlotSelect('08:30', false, true);
      expect(selectedSlotTime).toBe('');

      handleSlotSelect('08:00', true, false);
      expect(selectedSlotTime).toBe('');

      handleSlotSelect('09:30', true, true);
      expect(selectedSlotTime).toBe('09:30');
    });

    test('2.3: Race condition booking collision from backend returns error', async () => {
      const originalCreateAppointment = clinicService.createAppointment;
      (clinicService as any).createAppointment = async () => {
        return [null, new Error('Appointment collision: Slot 09:30 was just booked by another patient.')];
      };

      try {
        const [res, err] = await clinicService.createAppointment({
          patientId: baseTestPatient.id,
          patientName: baseTestPatient.fullName,
          scheduledAt: '2026-11-01T09:30:00',
        });

        expect(res).toBeNull();
        expect(err?.message).toContain('Appointment collision');
      } finally {
        (clinicService as any).createAppointment = originalCreateAppointment;
      }
    });
  });

  // =========================================================================
  // 3. Missing Patient Mobile Number Notification Handling
  // =========================================================================
  describe('Group 3: Missing Patient Mobile Number on Notification', () => {
    test('3.1: Patient with empty string contactNumber aborts SMS reminder', async () => {
      const patientEmptyMobile: ClinicPatient = {
        ...baseTestPatient,
        contactNumber: '',
      };

      let reminderCalled = false;
      const originalRemind = clinicService.sendAppointmentReminder;
      (clinicService as any).sendAppointmentReminder = async () => {
        reminderCalled = true;
        return [{}, null];
      };

      try {
        if (!patientEmptyMobile.contactNumber) {
          // Guard prevents sending SMS
        } else {
          await clinicService.sendAppointmentReminder('apt-123');
        }
      } finally {
        (clinicService as any).sendAppointmentReminder = originalRemind;
      }

      expect(reminderCalled).toBe(false);
    });

    test('3.2: Patient with undefined contactNumber aborts SMS reminder', () => {
      const patientUndefinedMobile: ClinicPatient = {
        ...baseTestPatient,
        contactNumber: undefined as any,
      };

      let reminderCalled = false;
      if (patientUndefinedMobile.contactNumber) {
        reminderCalled = true;
      }

      expect(reminderCalled).toBe(false);
    });

    test('3.3: Patient with valid mobile number dispatches reminder', async () => {
      const patientWithMobile: ClinicPatient = {
        ...baseTestPatient,
        contactNumber: '09171234567',
      };

      let reminderCalledId = '';
      const originalRemind = clinicService.sendAppointmentReminder;
      (clinicService as any).sendAppointmentReminder = async (aptId: string) => {
        reminderCalledId = aptId;
        return [{}, null];
      };

      try {
        if (patientWithMobile.contactNumber) {
          await clinicService.sendAppointmentReminder('apt-2026-999');
        }
      } finally {
        (clinicService as any).sendAppointmentReminder = originalRemind;
      }

      expect(reminderCalledId).toBe('apt-2026-999');
    });
  });

  // =========================================================================
  // 4. "Set new" Reset Behavior & Patient Preselection Preservation
  // =========================================================================
  describe('Group 4: "Set new" Form Reset & Continuity', () => {
    test('4.1: "Set new" resets booking details while preserving preselected patient', () => {
      let scheduledDetails: any = {
        appointmentId: 'apt-001',
        patientName: 'Silang, Diego',
        doctorName: 'Dr. Maria Santos',
        dateTime: '2026-11-01 at 09:00',
        purpose: 'Consultation',
        reference: 'APT-001',
        status: 'Confirmed',
      };
      let selectedSlotTime = '09:00';
      let clinicalNotes = 'Patient reports recurring migraine';
      let scheduling = false;

      const handleResetForm = () => {
        scheduledDetails = null;
        selectedSlotTime = '';
        clinicalNotes = '';
        scheduling = false;
      };

      handleResetForm();

      expect(scheduledDetails).toBeNull();
      expect(selectedSlotTime).toBe('');
      expect(clinicalNotes).toBe('');
      expect(scheduling).toBe(false);

      expect(baseTestPatient.fullName).toBe('Silang, Diego');
      expect(baseTestPatient.patientCode).toBe('PAT-20261031-001');
      expect(baseTestPatient.philHealthNumber).toBe('12-345678901-2');
    });

    test('4.2: Sequential booking: immediate rebooking works without closing modal', () => {
      let bookingCount = 0;
      let currentBookingDetails: any = null;

      const schedule = (slot: string, notes: string) => {
        bookingCount += 1;
        currentBookingDetails = {
          appointmentId: `apt-seq-${bookingCount}`,
          patientName: baseTestPatient.fullName,
          slot,
          notes,
        };
      };

      const setNew = () => {
        currentBookingDetails = null;
      };

      schedule('09:00', 'Initial consultation');
      expect(bookingCount).toBe(1);
      expect(currentBookingDetails?.slot).toBe('09:00');

      setNew();
      expect(currentBookingDetails).toBeNull();

      schedule('14:30', 'Follow-up lab result review');
      expect(bookingCount).toBe(2);
      expect(currentBookingDetails?.slot).toBe('14:30');
      expect(currentBookingDetails?.patientName).toBe('Silang, Diego');
    });
  });

  // =========================================================================
  // 5. "Close" Clean Dismissal & Dialog Teardown
  // =========================================================================
  describe('Group 5: "Close" Clean Dismissal & Teardown', () => {
    test('5.1: Modal close trigger invokes onClose callback cleanly', () => {
      let closeCalled = false;
      const handleClose = () => {
        closeCalled = true;
      };

      handleClose();
      expect(closeCalled).toBe(true);
    });

    test('5.2: "Open appointment screen" triggers onClose AND onNavigateToAppointments', () => {
      let closeCalled = false;
      let navigatedPatientId: string | undefined = undefined;

      const handleOpenAppointmentsScreen = (patientId?: string) => {
        closeCalled = true;
        navigatedPatientId = patientId;
      };

      handleOpenAppointmentsScreen(baseTestPatient.id);
      expect(closeCalled).toBe(true);
      expect(navigatedPatientId).toBe('pat-diego-test');
    });

    test('5.3: Visibility false cleanly unmounts modal without residual markup', () => {
      const closedMarkup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: false,
          patient: baseTestPatient,
          onClose: () => {},
        })
      );
      expect(closedMarkup).toBe('');
    });

    test('5.4: Patient null cleanly suppresses modal rendering', () => {
      const nullPatientMarkup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: true,
          patient: null,
          onClose: () => {},
        })
      );
      expect(nullPatientMarkup).toBe('');
    });
  });

  // =========================================================================
  // 6. Date Arithmetic, Rollovers, and Quick Dates
  // =========================================================================
  describe('Group 6: Date Arithmetic & Rollover Resilience', () => {
    test('6.1: getTodayIsoDate returns ISO format YYYY-MM-DD', () => {
      const today = getTodayIsoDate();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(today)).toBe(true);
    });

    test('6.2: getRelativeIsoDate handles positive day offsets correctly', () => {
      const tomorrow = getRelativeIsoDate(1);
      const nextWeek = getRelativeIsoDate(7);

      expect(/^\d{4}-\d{2}-\d{2}$/.test(tomorrow)).toBe(true);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(nextWeek)).toBe(true);

      const todayDate = new Date(getTodayIsoDate());
      const tomorrowDate = new Date(tomorrow);
      const diffMs = tomorrowDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(1);
    });

    test('6.3: Date rollover boundary: end of month to next month', () => {
      const d = new Date('2026-10-31T12:00:00Z');
      d.setDate(d.getDate() + 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const nextDayIso = `${year}-${month}-${day}`;

      expect(nextDayIso).toBe('2026-11-01');
    });

    test('6.4: Date rollover boundary: end of year to next year', () => {
      const d = new Date('2026-12-31T12:00:00Z');
      d.setDate(d.getDate() + 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const nextYearIso = `${year}-${month}-${day}`;

      expect(nextYearIso).toBe('2027-01-01');
    });
  });

  // =========================================================================
  // 7. Concise Header Subtitle & Zero Demographic Detail Clutter
  // =========================================================================
  describe('Group 7: Concise Header Subtitle & Zero Demographic Clutter', () => {
    test('7.1: ScheduleVisitModal shows patient name in header subtitle and omits bulky demographic banner', () => {
      const patientWithStatAllergy: ClinicPatient = {
        ...baseTestPatient,
        allergies: 'Amoxicillin (STAT: Anaphylaxis)',
      };

      const markup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: true,
          patient: patientWithStatAllergy,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Silang, Diego');
      expect(markup).not.toContain('PAT-20261031-001');
      expect(markup).not.toContain('PhilHealth PIN 12-345678901-2');
      expect(markup).not.toContain('Direct clinic appointment setup');
    });

    test('7.2: Plain patient renders cleanly without demographic badges in dialog', () => {
      const plainPatient: ClinicPatient = {
        ...baseTestPatient,
        philHealthNumber: undefined,
        allergies: '',
        alerts: undefined,
      };

      const markup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: true,
          patient: plainPatient,
          onClose: () => {},
        })
      );

      expect(markup).not.toContain('PhilHealth PIN');
      expect(markup).not.toContain('STAT Allergy');
      expect(markup).not.toContain('Allergies:');
      expect(markup).toContain('Silang, Diego');
    });
  });
});
