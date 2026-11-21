import { describe, expect, test } from 'bun:test';

interface PatientQueueItem {
  id: string;
  status: string;
  patientId: string;
  queueNumber?: string;
}

interface ProcedureRecord {
  id: string;
  queueItemId?: string;
  consultationId?: string;
  procedureName: string;
  status: 'Ordered' | 'InProgress' | 'Completed' | 'Cancelled';
  toothNumber?: number;
}

interface LocalProcedureOrder {
  name: string;
  isHandedOff?: boolean;
  status?: string;
  toothNumber?: number;
}

function evaluateProcedureBayLock(
  selectedPatient: PatientQueueItem | null,
  proceduresHistory: ProcedureRecord[],
  signedConsultationId: string | null,
  orderedProcedures: LocalProcedureOrder[]
) {
  if (!selectedPatient) return { isLocked: false, reason: null };

  if (selectedPatient.status === 'PendingProcedure') {
    return { isLocked: true, reason: 'In Procedure Bay' };
  }

  const visitProcs = proceduresHistory.filter(
    (proc) =>
      (selectedPatient.id && proc.queueItemId === selectedPatient.id) ||
      (signedConsultationId && proc.consultationId === signedConsultationId)
  );

  if (visitProcs.some((p) => p.status === 'Ordered' || p.status === 'InProgress')) {
    return { isLocked: true, reason: 'In-clinic procedures pending in Procedure Bay' };
  }

  const unhandedOff = orderedProcedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
  if (unhandedOff.length > 0) {
    return { isLocked: true, reason: `${unhandedOff.length} procedure(s) pending handoff` };
  }

  return { isLocked: false, reason: null };
}

describe('Procedure Bay Signing Guard', () => {
  test('locks signing when direct visit ticket status is PendingProcedure', () => {
    const patient: PatientQueueItem = {
      id: 'dv-1',
      status: 'PendingProcedure',
      patientId: 'pat-1',
      queueNumber: 'DV-001',
    };

    const result = evaluateProcedureBayLock(patient, [], null, []);
    expect(result.isLocked).toBe(true);
    expect(result.reason).toBe('In Procedure Bay');
  });

  test('locks signing when active ordered procedure exists for the encounter', () => {
    const patient: PatientQueueItem = {
      id: 'dv-2',
      status: 'InConsultation',
      patientId: 'pat-2',
      queueNumber: 'DV-002',
    };

    const history: ProcedureRecord[] = [
      {
        id: 'proc-1',
        queueItemId: 'dv-2',
        procedureName: 'Nebulization Therapy',
        status: 'Ordered',
      },
    ];

    const result = evaluateProcedureBayLock(patient, history, null, []);
    expect(result.isLocked).toBe(true);
    expect(result.reason).toBe('In-clinic procedures pending in Procedure Bay');
  });

  test('locks signing when doctor added unhanded-off procedures to the plan', () => {
    const patient: PatientQueueItem = {
      id: 'dv-3',
      status: 'InConsultation',
      patientId: 'pat-3',
      queueNumber: 'DV-003',
    };

    const ordered: LocalProcedureOrder[] = [
      {
        name: 'Wound Dressing',
        isHandedOff: false,
      },
    ];

    const result = evaluateProcedureBayLock(patient, [], null, ordered);
    expect(result.isLocked).toBe(true);
    expect(result.reason).toBe('1 procedure(s) pending handoff');
  });

  test('unlocks signing when procedure is completed and patient is returned to ReEvaluation', () => {
    const patient: PatientQueueItem = {
      id: 'dv-4',
      status: 'ReEvaluation',
      patientId: 'pat-4',
      queueNumber: 'DV-004',
    };

    const history: ProcedureRecord[] = [
      {
        id: 'proc-2',
        queueItemId: 'dv-4',
        procedureName: 'Nebulization Therapy',
        status: 'Completed',
      },
    ];

    const ordered: LocalProcedureOrder[] = [
      {
        name: 'Nebulization Therapy',
        isHandedOff: true,
        status: 'sent_to_room',
      },
    ];

    const result = evaluateProcedureBayLock(patient, history, null, ordered);
    expect(result.isLocked).toBe(false);
    expect(result.reason).toBeNull();
  });

  test('unlocks signing when procedure order is cancelled', () => {
    const patient: PatientQueueItem = {
      id: 'dv-5',
      status: 'InConsultation',
      patientId: 'pat-5',
      queueNumber: 'DV-005',
    };

    const history: ProcedureRecord[] = [
      {
        id: 'proc-3',
        queueItemId: 'dv-5',
        procedureName: 'Nebulization Therapy',
        status: 'Cancelled',
      },
    ];

    const result = evaluateProcedureBayLock(patient, history, null, []);
    expect(result.isLocked).toBe(false);
    expect(result.reason).toBeNull();
  });
});
