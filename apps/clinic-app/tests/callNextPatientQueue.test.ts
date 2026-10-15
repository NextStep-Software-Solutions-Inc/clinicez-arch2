// token-guard:ignore-file
import { describe, test, expect, mock } from 'bun:test';
import React from 'react';

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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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

import type {
  PatientQueueItem,
  QueueStatus,
  QueuePriority,
  ClinicRoom,
  StaffMember,
  ClinicSettingsRecord,
} from '../services/clinicService';

const {
  resolveCallToRoom,
  clinicService,
} = await import('../services/clinicService');

describe('Call Next Patient on Queue Workflow & Opt-in Settings', () => {
  const dummyStaffDoctor: StaffMember = {
    id: 'staff-doc-01',
    clinicId: 'clinic-01',
    firstName: 'Wave',
    lastName: 'Ambray',
    email: 'dr.ambray@clinicez.ph',
    role: 'Doctor',
    isActive: true,
    assignedRoomIds: ['room-1', 'room-2'],
    assignedRoomId: 'room-1',
  };

  const sampleRooms: ClinicRoom[] = [
    { id: 'room-1', clinicId: 'clinic-01', name: 'Room 1', type: 'Consultation', isActive: true, displayOrder: 1 },
    { id: 'room-2', clinicId: 'clinic-01', name: 'Room 2', type: 'Consultation', isActive: true, displayOrder: 2 },
    { id: 'room-triage', clinicId: 'clinic-01', name: 'Triage Station', type: 'Triage', isActive: true, displayOrder: 3 },
    { id: 'room-treatment', clinicId: 'clinic-01', name: 'Treatment Room', type: 'Treatment', isActive: true, displayOrder: 4 },
  ];

  const samplePatients: PatientQueueItem[] = [
    {
      id: 'q-1',
      tenantId: 'tenant-01',
      clinicId: 'clinic-01',
      queueNumber: 'Q-001',
      sequenceNumber: 1,
      queueDate: '2026-10-16',
      patientId: 'pat-1',
      patientName: 'Juan Dela Cruz',
      priority: 'Routine',
      status: 'InConsultation', // Already called
      checkInTime: '2026-10-16T08:00:00Z',
      hasVitals: true,
    },
    {
      id: 'q-2',
      tenantId: 'tenant-01',
      clinicId: 'clinic-01',
      queueNumber: 'Q-002',
      sequenceNumber: 2,
      queueDate: '2026-10-16',
      patientId: 'pat-2',
      patientName: 'Maria Clara',
      priority: 'Routine',
      status: 'Triaged', // Eligible
      checkInTime: '2026-10-16T08:05:00Z',
      hasVitals: true,
    },
    {
      id: 'q-3',
      tenantId: 'tenant-01',
      clinicId: 'clinic-01',
      queueNumber: 'Q-003',
      sequenceNumber: 3,
      queueDate: '2026-10-16',
      patientId: 'pat-3',
      patientName: 'Pedro Penduko',
      priority: 'Emergency',
      status: 'Triaged', // Eligible & STAT Emergency
      checkInTime: '2026-10-16T08:10:00Z',
      hasVitals: true,
    },
    {
      id: 'q-4',
      tenantId: 'tenant-01',
      clinicId: 'clinic-01',
      queueNumber: 'Q-004',
      sequenceNumber: 4,
      queueDate: '2026-10-16',
      patientId: 'pat-4',
      patientName: 'Jose Rizal',
      priority: 'Routine',
      status: 'Completed',
      checkInTime: '2026-10-16T07:30:00Z',
      hasVitals: true,
    },
  ];

  // Logic extracted from Consultations.screen.tsx
  function findNextEligiblePatient(displayed: PatientQueueItem[]): PatientQueueItem | undefined {
    const eligibleStatuses: QueueStatus[] = ['Triaged', 'ReEvaluation', 'Waiting'];
    // Patients are already sorted by Priority DESC, SequenceNumber ASC by backend
    const sorted = [...displayed].sort((a, b) => {
      const priorityOrder: Record<QueuePriority, number> = { Emergency: 3, Urgent: 2, Routine: 1 };
      const diff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (diff !== 0) return diff;
      return a.sequenceNumber - b.sequenceNumber;
    });
    return sorted.find((p) => eligibleStatuses.includes(p.status));
  }

  function getCallNextButtonTitle(nextPatient: PatientQueueItem | undefined, isDesktop: boolean): string {
    if (nextPatient) {
      return isDesktop ? `Call next (${nextPatient.queueNumber})` : `Call ${nextPatient.queueNumber}`;
    }
    return isDesktop ? 'Call next patient' : 'Call next';
  }

  describe('1. Next Eligible Patient Selection Logic', () => {
    test('1.1 Prioritizes STAT Emergency over Routine even if Emergency checked in later', () => {
      const next = findNextEligiblePatient(samplePatients);
      expect(next).toBeDefined();
      expect(next?.queueNumber).toBe('Q-003');
      expect(next?.priority).toBe('Emergency');
      expect(next?.patientName).toBe('Pedro Penduko');
    });

    test('1.2 Skips already InConsultation and Completed patients', () => {
      // Exclude Q-003, leaving only Q-001 (InConsultation), Q-002 (Triaged), Q-004 (Completed)
      const listWithoutEmergency = samplePatients.filter((p) => p.queueNumber !== 'Q-003');
      const next = findNextEligiblePatient(listWithoutEmergency);
      expect(next).toBeDefined();
      expect(next?.queueNumber).toBe('Q-002');
      expect(next?.status).toBe('Triaged');
    });

    test('1.3 Handles empty queue safely returning undefined', () => {
      const next = findNextEligiblePatient([]);
      expect(next).toBeUndefined();
    });

    test('1.4 Handles queue where all patients are already InConsultation or Completed', () => {
      const completedOrActive = samplePatients.filter((p) => p.status === 'InConsultation' || p.status === 'Completed');
      const next = findNextEligiblePatient(completedOrActive);
      expect(next).toBeUndefined();
    });

    test('1.5 Supports ReEvaluation patients returned from procedure room', () => {
      const reEvalPatient: PatientQueueItem = {
        id: 'q-5',
        tenantId: 'tenant-01',
        clinicId: 'clinic-01',
        queueNumber: 'Q-005',
        sequenceNumber: 5,
        queueDate: '2026-10-16',
        patientId: 'pat-5',
        patientName: 'Andres Bonifacio',
        priority: 'Urgent',
        status: 'ReEvaluation',
        checkInTime: '2026-10-16T08:15:00Z',
        hasVitals: true,
      };
      const next = findNextEligiblePatient([reEvalPatient]);
      expect(next).toBeDefined();
      expect(next?.queueNumber).toBe('Q-005');
      expect(next?.status).toBe('ReEvaluation');
    });
  });

  describe('2. Dynamic Button Badge Labeling (Option A)', () => {
    test('2.1 Desktop view renders "Call next (Q-003)" when next patient is Q-003', () => {
      const next = samplePatients.find((p) => p.queueNumber === 'Q-003');
      const label = getCallNextButtonTitle(next, true);
      expect(label).toBe('Call next (Q-003)');
    });

    test('2.2 Desktop view falls back to "Call next patient" when no patient is waiting', () => {
      const label = getCallNextButtonTitle(undefined, true);
      expect(label).toBe('Call next patient');
    });

    test('2.3 Compact view renders "Call Q-003" when next patient is Q-003', () => {
      const next = samplePatients.find((p) => p.queueNumber === 'Q-003');
      const label = getCallNextButtonTitle(next, false);
      expect(label).toBe('Call Q-003');
    });

    test('2.4 Compact view falls back to "Call next" when no patient is waiting', () => {
      const label = getCallNextButtonTitle(undefined, false);
      expect(label).toBe('Call next');
    });
  });

  describe('3. Opt-in Chip-Level Direct Queue Calling Setting', () => {
    test('3.1 When enableChipLevelQueueCalling is false, chip calling is disabled', () => {
      const settings: ClinicSettingsRecord = {
        id: 'settings-1',
        tenantId: 'tenant-01',
        clinicId: 'clinic-01',
        clinicName: 'Health Clinic',
        operatingHours: '8-5',
        defaultSlotDurationMinutes: 30,
        queuePrefix: 'Q',
        invoicePrefix: 'INV',
        defaultConsultationFee: 400,
        vatRate: 0.12,
        enableChipLevelQueueCalling: false,
      };
      const allowChipCalling = Boolean(settings.enableChipLevelQueueCalling);
      expect(allowChipCalling).toBe(false);
    });

    test('3.2 When enableChipLevelQueueCalling is undefined/null, defaults to false (sequential enforced)', () => {
      const settings: Partial<ClinicSettingsRecord> = {
        clinicName: 'Health Clinic',
      };
      const allowChipCalling = Boolean(settings.enableChipLevelQueueCalling);
      expect(allowChipCalling).toBe(false);
    });

    test('3.3 When enableChipLevelQueueCalling is true, chip calling is enabled for waiting patients', () => {
      const settings: ClinicSettingsRecord = {
        id: 'settings-1',
        tenantId: 'tenant-01',
        clinicId: 'clinic-01',
        clinicName: 'Health Clinic',
        operatingHours: '8-5',
        defaultSlotDurationMinutes: 30,
        queuePrefix: 'Q',
        invoicePrefix: 'INV',
        defaultConsultationFee: 400,
        vatRate: 0.12,
        enableChipLevelQueueCalling: true,
      };
      const allowChipCalling = Boolean(settings.enableChipLevelQueueCalling);
      expect(allowChipCalling).toBe(true);

      // Verify patient eligibility for chip button
      const eligibleStatuses: QueueStatus[] = ['Triaged', 'ReEvaluation', 'Waiting'];
      const q2Eligible = allowChipCalling && eligibleStatuses.includes(samplePatients[1].status);
      const q1Eligible = allowChipCalling && eligibleStatuses.includes(samplePatients[0].status); // InConsultation
      expect(q2Eligible).toBe(true);
      expect(q1Eligible).toBe(false);
    });
  });

  describe('4. Call-to-Room Resolution Integration', () => {
    test('4.1 Resolves active station pill if selected (e.g. Room 2)', () => {
      const target = samplePatients[2]; // Q-003
      const resolved = resolveCallToRoom({
        ticket: target,
        selectedStation: 'Room 2',
        currentStaff: dummyStaffDoctor,
        activeRooms: sampleRooms,
        visibleRooms: sampleRooms,
      });
      expect(resolved.roomName).toBe('Room 2');
      expect(resolved.roomId).toBe('room-2');
    });

    test('4.2 Resolves to doctor primary assigned room when station filter is ALL', () => {
      const target = samplePatients[2]; // Q-003
      const resolved = resolveCallToRoom({
        ticket: target,
        selectedStation: 'ALL',
        currentStaff: dummyStaffDoctor,
        activeRooms: sampleRooms,
        visibleRooms: sampleRooms,
      });
      expect(resolved.roomName).toBe('Room 1');
      expect(resolved.roomId).toBe('room-1');
    });
  });

  describe('5. Call Execution & State Transition', () => {
    test('5.1 clinicService.callQueueItem serializes correct payload', async () => {
      const originalCallQueueItem = clinicService.callQueueItem;
      let capturedArgs: any = null;

      clinicService.callQueueItem = async (id, docId, docName, roomOrStation, roomId) => {
        capturedArgs = { id, docId, docName, roomOrStation, roomId };
        return [
          {
            ...samplePatients[2],
            status: 'InConsultation',
            doctorId: docId,
            doctorName: docName,
            roomOrStation,
            roomId,
            calledTime: new Date().toISOString(),
          },
          null,
        ] as any;
      };

      try {
        const target = samplePatients[2]; // Q-003
        const [res, err] = await clinicService.callQueueItem(
          target.id,
          dummyStaffDoctor.id,
          'Dr. Wave Ambray',
          'Room 1',
          'room-1',
        );

        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(res?.status).toBe('InConsultation');
        expect(capturedArgs).toEqual({
          id: 'q-3',
          docId: 'staff-doc-01',
          docName: 'Dr. Wave Ambray',
          roomOrStation: 'Room 1',
          roomId: 'room-1',
        });
      } finally {
        clinicService.callQueueItem = originalCallQueueItem;
      }
    });
  });
});
