import { describe, expect, test } from 'bun:test';
import type {
  LabRequestDto,
  LabResultDto,
  MedicalCertificateDto,
  PrescriptionDto,
  SyncChangesPage,
} from '../services/api/documentsApi';
import {
  parseLabRequestItems,
  parseObservations,
  parsePrescriptionItems,
  toLabRequestRow,
  toLabResultRow,
  toMedicalCertificateRow,
  toPrescriptionRow,
} from '../services/sync/documentMappers';
import { MAX_SYNC_PAGES, pageHasDocumentChanges, pullAllChanges } from '../services/sync/pullChanges';

const PATIENT = 'patient-1';

function labRequest(overrides: Partial<LabRequestDto> = {}): LabRequestDto {
  return {
    id: 'lr-1',
    requisitionId: 'req-1',
    orderingTenantId: 'tenant-1',
    orderingFacilityId: 'facility-1',
    orderingFacilityName: 'Sample Clinic',
    accessionNumber: null,
    title: 'CBC and lipid panel',
    urgency: null,
    items: [{ code: 'CBC', name: 'Complete blood count', category: 'Hematology' }],
    stage: 'Issued',
    quotedAmount: null,
    currency: null,
    paymentRequired: false,
    paymentStatus: 'None',
    laboratoryName: null,
    claimToken: 'claim-1',
    reason: null,
    issuedAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

function prescription(overrides: Partial<PrescriptionDto> = {}): PrescriptionDto {
  return {
    id: 'rx-1',
    prescriptionNumber: 'RX-0001',
    orderingTenantId: 'tenant-1',
    orderingFacilityId: 'facility-1',
    orderingFacilityName: 'Sample Clinic',
    prescriberName: 'Dr. Reyes',
    prescriberPrcLicense: null,
    diagnosis: null,
    instructions: null,
    items: [
      {
        genericName: 'Amoxicillin',
        brandName: null,
        dosage: '500 mg',
        form: 'capsule',
        sig: 'Every 8 hours',
        quantity: 21,
        durationDays: 7,
        remarks: null,
      },
    ],
    stage: 'Issued',
    quotedAmount: null,
    pharmacyName: null,
    claimToken: 'claim-rx',
    verificationUrl: null,
    receiptNumber: null,
    dispensedAt: null,
    externalPharmacyName: null,
    issuedAt: '2026-01-02T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
    ...overrides,
  };
}

function labResult(overrides: Partial<LabResultDto> = {}): LabResultDto {
  return {
    id: 'res-1',
    requisitionId: 'req-1',
    laboratoryName: 'ClinicEZ Lab',
    title: 'CBC',
    source: 'ClinicEzLab',
    verification: 'Verified',
    reviewedByName: null,
    reviewedAt: null,
    remarks: null,
    impression: null,
    isCritical: false,
    resultedAt: '2026-01-03T08:00:00.000Z',
    fileUrl: null,
    observations: [
      { panel: 'CBC', name: 'Hemoglobin', value: '14', unit: 'g/dL', referenceRange: '12-16', flag: 'N' },
    ],
    updatedAt: '2026-01-03T08:00:00.000Z',
    ...overrides,
  };
}

function certificate(overrides: Partial<MedicalCertificateDto> = {}): MedicalCertificateDto {
  return {
    id: 'mc-1',
    certificateNumber: 'MC-0001',
    issuerName: 'Sample Clinic',
    doctorName: 'Dr. Reyes',
    doctorPrcLicense: null,
    purpose: 'Sick leave',
    diagnosis: null,
    remarks: null,
    restDays: 3,
    validFrom: '2026-01-04T00:00:00.000Z',
    validTo: null,
    verificationUrl: 'https://verify.example/mc-1',
    issuedAt: '2026-01-04T08:00:00.000Z',
    updatedAt: '2026-01-04T08:00:00.000Z',
    ...overrides,
  };
}

function page(overrides: Partial<SyncChangesPage> = {}): SyncChangesPage {
  return {
    cursor: 'c1',
    hasMore: false,
    labRequests: [],
    prescriptions: [],
    labResults: [],
    medicalCertificates: [],
    grants: [],
    notifications: [],
    ...overrides,
  };
}

/** In-memory stand-in for the four inbox tables: upsert by id, like the Drizzle onConflictDoUpdate. */
function createFakeInbox() {
  const labRequests = new Map<string, ReturnType<typeof toLabRequestRow>>();
  const prescriptions = new Map<string, ReturnType<typeof toPrescriptionRow>>();
  const labResults = new Map<string, ReturnType<typeof toLabResultRow>>();
  const certificates = new Map<string, ReturnType<typeof toMedicalCertificateRow>>();

  return {
    labRequests,
    prescriptions,
    labResults,
    certificates,
    apply: async (incoming: SyncChangesPage) => {
      for (const dto of incoming.labRequests) labRequests.set(dto.id, toLabRequestRow(PATIENT, dto));
      for (const dto of incoming.prescriptions) prescriptions.set(dto.id, toPrescriptionRow(PATIENT, dto));
      for (const dto of incoming.labResults) labResults.set(dto.id, toLabResultRow(PATIENT, dto));
      for (const dto of incoming.medicalCertificates) {
        certificates.set(dto.id, toMedicalCertificateRow(PATIENT, dto));
      }
    },
  };
}

function createHarness(pages: SyncChangesPage[], initialCursor: string | null = null) {
  const inbox = createFakeInbox();
  const requestedSince: (string | null)[] = [];
  const events: string[] = [];
  let stored = initialCursor;
  let index = 0;

  const deps = {
    fetchPage: async (since: string | null) => {
      requestedSince.push(since);
      events.push('fetch');
      return pages[Math.min(index++, pages.length - 1)];
    },
    readCursor: async () => stored,
    writeCursor: async (cursor: string) => {
      events.push(`cursor:${cursor}`);
      stored = cursor;
    },
    applyPage: async (incoming: SyncChangesPage) => {
      events.push('apply');
      await inbox.apply(incoming);
    },
  };

  return { deps, inbox, requestedSince, events, storedCursor: () => stored };
}

describe('pullAllChanges cursor handling', () => {
  test('first pull omits the cursor and persists the returned one', async () => {
    const harness = createHarness([page({ cursor: 'c1', labRequests: [labRequest()] })]);
    const result = await pullAllChanges(harness.deps);

    expect(harness.requestedSince).toEqual([null]);
    expect(harness.storedCursor()).toBe('c1');
    expect(result).toEqual({ pages: 1, cursor: 'c1' });
  });

  test('subsequent pulls send the stored cursor as since', async () => {
    const harness = createHarness([page({ cursor: 'c6' })], 'c5');
    await pullAllChanges(harness.deps);

    expect(harness.requestedSince).toEqual(['c5']);
    expect(harness.storedCursor()).toBe('c6');
  });

  test('loops while hasMore, chaining each cursor into the next request', async () => {
    const harness = createHarness([
      page({ cursor: 'c1', hasMore: true, labRequests: [labRequest({ id: 'a' })] }),
      page({ cursor: 'c2', hasMore: true, prescriptions: [prescription({ id: 'b' })] }),
      page({ cursor: 'c3', hasMore: false, labResults: [labResult({ id: 'c' })] }),
    ]);
    const result = await pullAllChanges(harness.deps);

    expect(harness.requestedSince).toEqual([null, 'c1', 'c2']);
    expect(result.pages).toBe(3);
    expect(harness.storedCursor()).toBe('c3');
    expect([...harness.inbox.labRequests.keys()]).toEqual(['a']);
    expect([...harness.inbox.prescriptions.keys()]).toEqual(['b']);
    expect([...harness.inbox.labResults.keys()]).toEqual(['c']);
  });

  test('persists the cursor only after the page was applied', async () => {
    const harness = createHarness([page({ cursor: 'c1', labRequests: [labRequest()] })]);
    await pullAllChanges(harness.deps);

    expect(harness.events).toEqual(['fetch', 'apply', 'cursor:c1']);
  });

  test('a failing apply leaves the stored cursor untouched so the page is replayed', async () => {
    const harness = createHarness([page({ cursor: 'c1' })], 'c0');
    const failing = {
      ...harness.deps,
      applyPage: async () => {
        throw new Error('disk full');
      },
    };

    await expect(pullAllChanges(failing)).rejects.toThrow('disk full');
    expect(harness.storedCursor()).toBe('c0');
  });

  test('stops when the server keeps returning the same cursor with hasMore', async () => {
    const harness = createHarness([page({ cursor: 'same', hasMore: true })], 'same');
    const result = await pullAllChanges(harness.deps);

    expect(result.pages).toBe(1);
  });

  test('never exceeds the page cap', async () => {
    let counter = 0;
    const harness = createHarness([page()]);
    const deps = {
      ...harness.deps,
      fetchPage: async () => page({ cursor: `c${counter++}`, hasMore: true }),
    };
    const result = await pullAllChanges(deps);

    expect(result.pages).toBe(MAX_SYNC_PAGES);
  });
});

describe('upsert by id', () => {
  test('re-delivering a row replaces it instead of duplicating', async () => {
    const harness = createHarness([
      page({ cursor: 'c1', hasMore: true, labRequests: [labRequest({ stage: 'Issued' })] }),
      page({
        cursor: 'c2',
        labRequests: [labRequest({ stage: 'AwaitingPayment', paymentStatus: 'Pending', quotedAmount: 250 })],
      }),
    ]);
    await pullAllChanges(harness.deps);

    expect(harness.inbox.labRequests.size).toBe(1);
    const row = harness.inbox.labRequests.get('lr-1');
    expect(row?.stage).toBe('AwaitingPayment');
    expect(row?.paymentStatus).toBe('Pending');
    expect(row?.quotedAmount).toBe(250);
  });

  test('applying the same page twice is idempotent', async () => {
    const inbox = createFakeInbox();
    const incoming = page({
      labRequests: [labRequest()],
      prescriptions: [prescription()],
      labResults: [labResult()],
      medicalCertificates: [certificate()],
    });
    await inbox.apply(incoming);
    const snapshot = JSON.stringify([...inbox.labRequests]);
    await inbox.apply(incoming);

    expect(inbox.labRequests.size).toBe(1);
    expect(inbox.prescriptions.size).toBe(1);
    expect(inbox.labResults.size).toBe(1);
    expect(inbox.certificates.size).toBe(1);
    expect(JSON.stringify([...inbox.labRequests])).toBe(snapshot);
  });

  test('a result moving from pending review to verified updates in place', async () => {
    const inbox = createFakeInbox();
    await inbox.apply(page({ labResults: [labResult({ verification: 'Unverified', source: 'PatientUploaded' })] }));
    await inbox.apply(
      page({ labResults: [labResult({ verification: 'Verified', source: 'PatientUploaded', reviewedByName: 'Dr. Reyes' })] }),
    );

    expect(inbox.labResults.size).toBe(1);
    expect(inbox.labResults.get('res-1')?.verification).toBe('Verified');
    expect(inbox.labResults.get('res-1')?.reviewedByName).toBe('Dr. Reyes');
  });
});

describe('pageHasDocumentChanges', () => {
  test('is false for an empty page and for grants-only changes', () => {
    expect(pageHasDocumentChanges(page())).toBe(false);
  });

  test('is true when any document list or notifications changed', () => {
    expect(pageHasDocumentChanges(page({ medicalCertificates: [certificate()] }))).toBe(true);
    expect(
      pageHasDocumentChanges(
        page({
          notifications: [
            {
              id: 'n1',
              type: 'LabResult',
              title: 'Result ready',
              body: '',
              isRead: false,
              readAt: null,
              payload: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('document mappers', () => {
  test('lab request row carries ids, dates and serialised items', () => {
    const row = toLabRequestRow(PATIENT, labRequest({ paymentRequired: true, quotedAmount: 120.5, currency: 'PHP' }));

    expect(row.patientId).toBe(PATIENT);
    expect(row.requisitionId).toBe('req-1');
    expect(row.issuedAt).toEqual(new Date('2026-01-01T08:00:00.000Z'));
    expect(row.paymentRequired).toBe(true);
    expect(row.quotedAmount).toBe(120.5);
    expect(parseLabRequestItems(row.itemsJson)).toEqual([
      { code: 'CBC', name: 'Complete blood count', category: 'Hematology' },
    ]);
  });

  test('prescription row converts dispensedAt and keeps null when absent', () => {
    expect(toPrescriptionRow(PATIENT, prescription()).dispensedAt).toBeNull();
    const dispensed = toPrescriptionRow(
      PATIENT,
      prescription({ stage: 'ExternalDispensed', dispensedAt: '2026-01-05T10:00:00.000Z', externalPharmacyName: 'Mercury' }),
    );
    expect(dispensed.dispensedAt).toEqual(new Date('2026-01-05T10:00:00.000Z'));
    expect(parsePrescriptionItems(dispensed.itemsJson)[0].genericName).toBe('Amoxicillin');
  });

  test('lab result row keeps provenance, verification and observations', () => {
    const row = toLabResultRow(PATIENT, labResult({ source: 'ExternalLab', verification: 'Rejected', remarks: 'Illegible' }));

    expect(row.source).toBe('ExternalLab');
    expect(row.verification).toBe('Rejected');
    expect(row.remarks).toBe('Illegible');
    expect(parseObservations(row.observationsJson)[0].name).toBe('Hemoglobin');
  });

  test('certificate row maps optional validity dates', () => {
    const row = toMedicalCertificateRow(PATIENT, certificate());

    expect(row.validFrom).toEqual(new Date('2026-01-04T00:00:00.000Z'));
    expect(row.validTo).toBeNull();
    expect(row.verificationUrl).toBe('https://verify.example/mc-1');
  });

  test('JSON parsers tolerate malformed or non-array content', () => {
    expect(parseLabRequestItems('not json')).toEqual([]);
    expect(parsePrescriptionItems('{"a":1}')).toEqual([]);
    expect(parseObservations('')).toEqual([]);
  });
});
