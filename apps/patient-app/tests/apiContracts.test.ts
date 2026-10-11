import { describe, expect, test } from 'bun:test';
import { remoteAppointmentSchema } from '../services/api/appointmentsApi';
import {
  externalDispenseAckSchema,
  labResultUploadAckSchema,
  syncChangesPageSchema,
} from '../services/api/documentsSchemas';
import { accessGrantListSchema, shareCodeResponseSchema, shareTokenResponseSchema } from '../services/api/sharingApi';
import { syncNotificationSchema } from '../services/api/notificationsApi';

const NOW = '2026-01-01T08:00:00.000Z';

const labRequestJson = {
  id: 'lr-1',
  requisitionId: 'req-1',
  orderingTenantId: 'tenant-1',
  orderingFacilityId: 'facility-1',
  orderingFacilityName: 'Sample Clinic',
  accessionNumber: null,
  title: 'CBC',
  urgency: null,
  items: [{ code: 'CBC', name: 'Complete blood count', category: 'Hematology' }],
  stage: 'AwaitingPayment',
  quotedAmount: 250,
  currency: 'PHP',
  paymentRequired: true,
  paymentStatus: 'Pending',
  laboratoryName: null,
  claimToken: null,
  reason: null,
  issuedAt: NOW,
  updatedAt: NOW,
};

const prescriptionJson = {
  id: 'rx-1',
  prescriptionNumber: 'RX-1',
  orderingTenantId: 'tenant-1',
  orderingFacilityId: 'facility-1',
  orderingFacilityName: null,
  prescriberName: 'Dr. Reyes',
  prescriberPrcLicense: null,
  diagnosis: null,
  instructions: null,
  items: [],
  stage: 'PartiallyAccepted',
  quotedAmount: null,
  pharmacyName: null,
  claimToken: null,
  verificationUrl: null,
  receiptNumber: null,
  dispensedAt: null,
  externalPharmacyName: null,
  issuedAt: NOW,
  updatedAt: NOW,
};

const labResultJson = {
  id: 'res-1',
  requisitionId: null,
  laboratoryName: 'Lab',
  title: 'CBC',
  source: 'PatientUploaded',
  verification: 'Unverified',
  reviewedByName: null,
  reviewedAt: null,
  remarks: null,
  impression: null,
  isCritical: false,
  resultedAt: NOW,
  fileUrl: null,
  observations: [],
  updatedAt: NOW,
};

function pageJson(overrides: Record<string, unknown> = {}) {
  return {
    cursor: 'c1',
    hasMore: false,
    labRequests: [labRequestJson],
    prescriptions: [prescriptionJson],
    labResults: [labResultJson],
    medicalCertificates: [],
    grants: [],
    notifications: [],
    ...overrides,
  };
}

describe('sync changes page contract', () => {
  test('accepts PascalCase enum strings', () => {
    const parsed = syncChangesPageSchema.parse(pageJson());
    expect(parsed.labRequests[0].stage).toBe('AwaitingPayment');
    expect(parsed.labRequests[0].paymentStatus).toBe('Pending');
    expect(parsed.prescriptions[0].stage).toBe('PartiallyAccepted');
    expect(parsed.labResults[0].source).toBe('PatientUploaded');
  });

  test('rejects camelCase enum values', () => {
    const camel = pageJson({ labRequests: [{ ...labRequestJson, stage: 'awaitingPayment' }] });
    expect(syncChangesPageSchema.safeParse(camel).success).toBe(false);
    const camelSource = pageJson({ labResults: [{ ...labResultJson, source: 'patientUploaded' }] });
    expect(syncChangesPageSchema.safeParse(camelSource).success).toBe(false);
  });

  test('rejects numeric enum values', () => {
    const numericStage = pageJson({ prescriptions: [{ ...prescriptionJson, stage: 2 }] });
    expect(syncChangesPageSchema.safeParse(numericStage).success).toBe(false);
    const numericPayment = pageJson({ labRequests: [{ ...labRequestJson, paymentStatus: 1 }] });
    expect(syncChangesPageSchema.safeParse(numericPayment).success).toBe(false);
  });

  test('accepts PascalCase notification types and rejects the old camelCase form', () => {
    const notification = {
      id: 'n1',
      type: 'LabResult',
      title: 'Result ready',
      body: '',
      isRead: false,
      readAt: null,
      payload: null,
      createdAt: NOW,
    };
    expect(syncNotificationSchema.safeParse(notification).success).toBe(true);
    expect(syncNotificationSchema.safeParse({ ...notification, type: 'labResult' }).success).toBe(false);
  });
});

describe('202 acknowledgement contracts', () => {
  test('upload-result ack is Unverified / PatientUploaded', () => {
    const ack = { resultId: 'res-1', verification: 'Unverified', source: 'PatientUploaded' };
    expect(labResultUploadAckSchema.safeParse(ack).success).toBe(true);
    expect(labResultUploadAckSchema.safeParse({ ...ack, verification: 'unverified' }).success).toBe(false);
    expect(labResultUploadAckSchema.safeParse({ ...ack, source: 2 }).success).toBe(false);
  });

  test('external-dispense ack is ExternalDispensed', () => {
    const ack = { prescriptionId: 'rx-1', stage: 'ExternalDispensed' };
    expect(externalDispenseAckSchema.safeParse(ack).success).toBe(true);
    expect(externalDispenseAckSchema.safeParse({ ...ack, stage: 'externalDispensed' }).success).toBe(false);
    expect(externalDispenseAckSchema.safeParse({ ...ack, stage: 5 }).success).toBe(false);
  });
});

describe('sharing contract', () => {
  const grant = {
    id: 'g1',
    tenantId: 't1',
    facilityId: 'f1',
    facilityName: 'Sample Clinic',
    scopes: ['Demographics', 'LabResults'],
    purpose: 'Care',
    source: 'Qr',
    status: 'Active',
    expiresAt: NOW,
    revokedAt: null,
    createdAt: NOW,
  };

  test('accepts PascalCase grant source, status and scopes', () => {
    expect(accessGrantListSchema.safeParse([grant]).success).toBe(true);
  });

  test('rejects camelCase scopes, source and status', () => {
    expect(accessGrantListSchema.safeParse([{ ...grant, scopes: ['labResults'] }]).success).toBe(false);
    expect(accessGrantListSchema.safeParse([{ ...grant, source: 'qr' }]).success).toBe(false);
    expect(accessGrantListSchema.safeParse([{ ...grant, status: 'active' }]).success).toBe(false);
    expect(accessGrantListSchema.safeParse([{ ...grant, status: 0 }]).success).toBe(false);
  });

  test('share token response carries PascalCase scopes and maxRedemptions', () => {
    const response = { token: 'abc', expiresAt: NOW, ttlSeconds: 60, clinicEzId: 'CEZ-1', scopes: ['Vitals'], purpose: 'Care', maxRedemptions: 3 };
    expect(shareTokenResponseSchema.safeParse(response).success).toBe(true);
    expect(shareTokenResponseSchema.safeParse({ ...response, scopes: ['vitals'] }).success).toBe(false);
    expect(shareTokenResponseSchema.safeParse({ ...response, maxRedemptions: 1.5 }).success).toBe(false);
    const { maxRedemptions: _omitted, ...withoutMax } = response;
    expect(shareTokenResponseSchema.safeParse(withoutMax).success).toBe(false);
  });

  test('share code response carries the code and PascalCase scopes', () => {
    const response = { code: 'ABCD-EFGH', expiresAt: NOW, ttlSeconds: 600, clinicEzId: 'CEZ-1', scopes: ['Allergies', 'LabResults'], purpose: 'Care' };
    expect(shareCodeResponseSchema.safeParse(response).success).toBe(true);
    expect(shareCodeResponseSchema.safeParse({ ...response, scopes: ['labResults'] }).success).toBe(false);
    expect(shareCodeResponseSchema.safeParse({ ...response, ttlSeconds: '600' }).success).toBe(false);
    const { code: _omitted, ...withoutCode } = response;
    expect(shareCodeResponseSchema.safeParse(withoutCode).success).toBe(false);
  });
});

describe('appointment contract', () => {
  const appointment = {
    id: 'a1',
    clinicId: 'c1',
    clinicName: 'Sample Clinic',
    provider: { id: 'p1', name: 'Dr. Reyes', specialty: null, avatarUrl: null },
    serviceType: null,
    scheduledAt: NOW,
    durationMinutes: 30,
    status: 'NoShow',
    notes: null,
  };

  test('accepts the PascalCase status', () => {
    expect(remoteAppointmentSchema.safeParse(appointment).success).toBe(true);
  });

  test('rejects camelCase and numeric statuses', () => {
    expect(remoteAppointmentSchema.safeParse({ ...appointment, status: 'noShow' }).success).toBe(false);
    expect(remoteAppointmentSchema.safeParse({ ...appointment, status: 'confirmed' }).success).toBe(false);
    expect(remoteAppointmentSchema.safeParse({ ...appointment, status: 3 }).success).toBe(false);
  });
});
