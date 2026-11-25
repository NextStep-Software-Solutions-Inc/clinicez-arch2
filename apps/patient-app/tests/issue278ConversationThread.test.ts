import { describe, expect, it } from 'bun:test';
import {
  mapPatientMessageToThreadMessage,
  resolvePatientThreadSenderName,
  sortThreadMessages,
} from '../services/comms/threadHelpers';
import type { PatientMessageDto } from '../services/comms/communicationsService';

describe('Issue #278 — Patient Portal ConversationThread ordering, sender attribution & attachments', () => {
  const baseMessage = (overrides: Partial<PatientMessageDto>): PatientMessageDto => ({
    id: 'msg-1',
    conversationId: 'conv-1',
    seq: 1,
    clientMessageId: 'client-1',
    senderType: 'Patient',
    senderId: 'pat-1',
    senderName: 'Justine Mae Tabasan',
    contentText: 'Hello',
    requiresAcknowledgement: false,
    isAcknowledged: false,
    deliveryState: 'Received',
    createdAtUtc: '2026-11-25T06:41:00Z',
    retentionDeadlineUtc: '2026-12-02T06:41:00Z',
    attachments: [],
    ...overrides,
  });

  it('resolvePatientThreadSenderName never attributes Staff replies to patient name or generic labels', () => {
    const patientNames = ['Justine Mae Tabasan'];

    expect(
      resolvePatientThreadSenderName(
        baseMessage({ senderType: 'Staff', senderName: 'Justine Mae Tabasan' }),
        'Nextstep OPD',
        patientNames,
      ),
    ).toBe('Nextstep OPD');

    expect(
      resolvePatientThreadSenderName(
        baseMessage({ senderType: 'Staff', senderName: 'Staff Member' }),
        'Nextstep OPD',
        patientNames,
      ),
    ).toBe('Nextstep OPD');

    expect(
      resolvePatientThreadSenderName(
        baseMessage({ senderType: 'Staff', senderName: 'Dr. Elena Cruz' }),
        'Nextstep OPD',
        patientNames,
      ),
    ).toBe('Dr. Elena Cruz');

    expect(
      resolvePatientThreadSenderName(
        baseMessage({ senderType: 'Patient', senderName: 'Justine Mae Tabasan' }),
        'Nextstep OPD',
        patientNames,
      ),
    ).toBe('Justine Mae Tabasan');
  });

  it('sortThreadMessages repairs scrambled Issue #278 order (02:41 -> 02:42 -> 02:42 -> 02:48 -> 02:57)', () => {
    const scrambled = [
      mapPatientMessageToThreadMessage(
        baseMessage({ id: 'm1', seq: 1, senderType: 'Patient', contentText: 'Initial', createdAtUtc: '2026-11-25T06:41:00Z' }),
        'Nextstep OPD',
      ),
      mapPatientMessageToThreadMessage(
        baseMessage({ id: 'm2', seq: 2, senderType: 'Staff', senderName: 'Nextstep OPD', contentText: 'Hi, Justine!', createdAtUtc: '2026-11-25T06:48:00Z' }),
        'Nextstep OPD',
      ),
      mapPatientMessageToThreadMessage(
        baseMessage({ id: 'm3', seq: 2, senderType: 'Patient', contentText: 'Hello?', createdAtUtc: '2026-11-25T06:42:10Z' }),
        'Nextstep OPD',
      ),
      mapPatientMessageToThreadMessage(
        baseMessage({ id: 'm4', seq: 3, senderType: 'Staff', senderName: 'Nextstep OPD', contentText: 'Doing fine?', createdAtUtc: '2026-11-25T06:57:00Z' }),
        'Nextstep OPD',
      ),
      mapPatientMessageToThreadMessage(
        baseMessage({ id: 'm5', seq: 3, senderType: 'Patient', contentText: 'Are you still there?', createdAtUtc: '2026-11-25T06:42:30Z' }),
        'Nextstep OPD',
      ),
    ];

    const sorted = sortThreadMessages(scrambled);
    expect(sorted.map((m) => m.id)).toEqual(['m1', 'm3', 'm5', 'm2', 'm4']);
  });

  it('mapPatientMessageToThreadMessage maps attachmentId for authenticated download', () => {
    const mapped = mapPatientMessageToThreadMessage(
      baseMessage({
        id: 'm-att',
        senderType: 'Staff',
        senderName: 'Justine Mae Tabasan',
        attachments: [
          {
            id: 'att-guid-1',
            messageId: 'm-att',
            storageKey: 'comms/attachments/p1/a1/lab.pdf',
            fileName: 'lab.pdf',
            contentType: 'application/pdf',
            fileSizeBytes: 12345,
            scanStatus: 'Clean',
          },
        ],
      }),
      'Nextstep OPD',
      ['Justine Mae Tabasan'],
    );

    expect(mapped.senderDisplayName).toBe('Nextstep OPD');
    expect(mapped.attachments).toHaveLength(1);
    expect(mapped.attachments![0].attachmentId).toBe('att-guid-1');
    expect(mapped.attachments![0].fileKey).toBe('comms/attachments/p1/a1/lab.pdf');
    expect(mapped.attachments![0].isClean).toBe(true);
  });
});
