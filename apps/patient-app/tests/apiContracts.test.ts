import { describe, expect, test } from 'bun:test';
import { remoteAppointmentSchema } from '../services/api/appointmentsApi';
import {
  clinicDetailSchema,
  clinicSummarySchema,
  organizationDetailSchema,
  organizationMembershipResultSchema,
  organizationSummarySchema,
} from '../services/api/discoveryApi';
import {
  externalDispenseAckSchema,
  labResultUploadAckSchema,
  syncChangesPageSchema,
} from '../services/api/documentsSchemas';
import {
  accessGrantListSchema,
  accessLogPageSchema,
  shareCodeResponseSchema,
  shareTokenResponseSchema,
} from '../services/api/sharingApi';
import {
  notificationListResultSchema,
  remoteNotificationSchema,
  syncNotificationSchema,
} from '../services/api/notificationsApi';

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

  test('accepts patient-api WhenWritingNull payload with omitted nullable fields', () => {
    const omittedNulls = {
      id: 'a2',
      clinicId: 'c1',
      clinicName: 'Sample Clinic',
      provider: { id: 'p1', name: 'Dr. Reyes' },
      scheduledAt: NOW,
      durationMinutes: 30,
      status: 'Confirmed',
    };
    const parsed = remoteAppointmentSchema.parse(omittedNulls);
    expect(parsed.provider.specialty).toBeUndefined();
    expect(parsed.serviceType).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});

describe('discovery contract (patient-api WhenWritingNull)', () => {
  const minimalClinicSummary = {
    id: 'clinic-1',
    name: 'NextStep OPD',
    isPublic: true,
    supportsAppointments: true,
    specialtiesJson: '["General Practice"]',
    requiredShareFieldsJson: '["fullName","mobile"]',
    featuredScore: 10,
    activeMemberCount: 0,
  };

  const minimalOrganizationSummary = {
    id: 'org-1',
    slug: 'nextstep-health',
    name: 'NextStep Health Network',
    description: 'Regional care network',
    isPublic: true,
    featuredScore: 5,
    activeMemberCount: 12,
    requiredShareFieldsJson: '["fullName"]',
    rolesJson: '[{"id":"member","name":"Member","description":"General access"}]',
  };

  test('clinicSummarySchema parses payload with all nullable fields omitted', () => {
    const parsed = clinicSummarySchema.parse(minimalClinicSummary);
    expect(parsed.id).toBe('clinic-1');
    expect(parsed.description).toBeUndefined();
    expect(parsed.address).toBeUndefined();
    expect(parsed.logoUrl).toBeUndefined();
    expect(parsed.coverImageUrl).toBeUndefined();
    expect(parsed.membershipStatus).toBeUndefined();
  });

  test('clinicDetailSchema parses unjoined public clinic with omitted null fields', () => {
    const wirePayload = {
      ...minimalClinicSummary,
      isGated: false,
      isUnlocked: true,
      linkedOrganizations: [minimalOrganizationSummary],
      healthcareProviders: [
        { id: 'prov-1', name: 'Dr. Maria Santos', specialty: 'Internal Medicine' },
      ],
      services: [
        { id: 'svc-1', name: 'General Consultation' },
      ],
    };

    const parsed = clinicDetailSchema.parse(wirePayload);
    expect(parsed.name).toBe('NextStep OPD');
    expect(parsed.membershipStatus).toBeUndefined();
    expect(parsed.privacyPolicyUrl).toBeUndefined();
    expect(parsed.termsAndConditionsUrl).toBeUndefined();
    expect(parsed.healthcareProviders[0].avatarUrl).toBeUndefined();
    expect(parsed.healthcareProviders[0].professionalLicenseNo).toBeUndefined();
    expect(parsed.services[0].description).toBeUndefined();
    expect(parsed.services[0].durationMinutes).toBeUndefined();
    expect(parsed.services[0].price).toBeUndefined();
    expect(parsed.linkedOrganizations[0].logoUrl).toBeUndefined();
  });

  test('clinicDetailSchema accepts explicit nulls and Rejected membershipStatus', () => {
    const wirePayload = {
      ...minimalClinicSummary,
      description: null,
      address: null,
      logoUrl: null,
      coverImageUrl: null,
      privacyPolicyUrl: null,
      termsAndConditionsUrl: null,
      membershipStatus: 'Rejected',
      linkedOrganizations: [],
      healthcareProviders: [],
      services: [],
    };
    const parsed = clinicDetailSchema.parse(wirePayload);
    expect(parsed.membershipStatus).toBe('Rejected');
  });

  test('organizationSummarySchema, organizationDetailSchema, and organizationMembershipResultSchema parse omitted nulls', () => {
    expect(organizationSummarySchema.parse(minimalOrganizationSummary).addressHint).toBeUndefined();
    const orgDetail = organizationDetailSchema.parse({
      ...minimalOrganizationSummary,
      linkedClinics: [minimalClinicSummary],
    });
    expect(orgDetail.privacyPolicyUrl).toBeUndefined();
    expect(orgDetail.linkedClinics).toHaveLength(1);

    const membership = organizationMembershipResultSchema.parse({
      id: 'mem-1',
      organizationId: 'org-1',
      organizationName: 'NextStep Health Network',
      roleId: 'member',
      roleName: 'Member',
      status: 'Rejected',
      consentDataSharing: true,
      createdAt: NOW,
    });
    expect(membership.status).toBe('Rejected');
    expect(membership.consentedAt).toBeUndefined();
  });

  test('rejects invalid membershipStatus casing on clinicDetailSchema', () => {
    const invalid = {
      ...minimalClinicSummary,
      membershipStatus: 'rejected',
      linkedOrganizations: [],
      healthcareProviders: [],
      services: [],
    };
    expect(clinicDetailSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('patient-api WhenWritingNull payloads across documents, notifications, and sharing', () => {
  test('syncChangesPageSchema parses records with omitted nullable properties', () => {
    const minimalPage = {
      cursor: 'c2',
      hasMore: false,
      labRequests: [
        {
          id: 'lr-2',
          requisitionId: 'req-2',
          orderingTenantId: 'tenant-1',
          orderingFacilityId: 'facility-1',
          title: 'Urinalysis',
          items: [],
          stage: 'Issued',
          paymentRequired: false,
          paymentStatus: 'None',
          issuedAt: NOW,
          updatedAt: NOW,
        },
      ],
      prescriptions: [
        {
          id: 'rx-2',
          prescriptionNumber: 'RX-2',
          orderingTenantId: 'tenant-1',
          orderingFacilityId: 'facility-1',
          prescriberName: 'Dr. Cruz',
          items: [
            {
              genericName: 'Paracetamol',
              dosage: '500mg',
              form: 'tablet',
              sig: 'PRN',
              quantity: 10,
            },
          ],
          stage: 'Issued',
          issuedAt: NOW,
          updatedAt: NOW,
        },
      ],
      labResults: [
        {
          id: 'res-2',
          laboratoryName: 'Main Lab',
          title: 'Urinalysis',
          source: 'ClinicEzLab',
          verification: 'Verified',
          isCritical: false,
          resultedAt: NOW,
          observations: [],
          updatedAt: NOW,
        },
      ],
      medicalCertificates: [
        {
          id: 'mc-2',
          certificateNumber: 'MC-2',
          issuerName: 'NextStep OPD',
          doctorName: 'Dr. Cruz',
          purpose: 'Fit to work',
          issuedAt: NOW,
          updatedAt: NOW,
        },
      ],
      grants: [
        {
          id: 'g-2',
          tenantId: 't1',
          facilityId: 'f1',
          scopes: ['Demographics'],
          purpose: 'Care',
          source: 'Qr',
          status: 'Active',
          expiresAt: NOW,
          createdAt: NOW,
        },
      ],
      notifications: [
        {
          id: 'n-2',
          type: 'System',
          title: 'Welcome',
          body: 'Hello',
          isRead: false,
          createdAt: NOW,
        },
      ],
    };

    const parsed = syncChangesPageSchema.parse(minimalPage);
    expect(parsed.labRequests[0].quotedAmount).toBeUndefined();
    expect(parsed.prescriptions[0].items[0].brandName).toBeUndefined();
    expect(parsed.labResults[0].fileUrl).toBeUndefined();
    expect(parsed.medicalCertificates[0].restDays).toBeUndefined();
    expect(parsed.grants[0].revokedAt).toBeUndefined();
    expect(parsed.notifications[0].readAt).toBeUndefined();
  });

  test('notificationListResultSchema and remoteNotificationSchema parse NotificationDto without category/readAt/payload', () => {
    const wireNotification = {
      id: 'n-3',
      type: 'AppointmentReminder',
      title: 'Reminder',
      body: 'Visit tomorrow',
      isRead: false,
      createdAt: NOW,
    };
    expect(remoteNotificationSchema.parse(wireNotification).category).toBeUndefined();
    expect(
      notificationListResultSchema.parse({
        items: [wireNotification],
        unreadCount: 1,
        totalCount: 1,
      }).items,
    ).toHaveLength(1);
  });

  test('accessGrantListSchema and accessLogPageSchema parse omitted nullable fields', () => {
    const grants = accessGrantListSchema.parse([
      {
        id: 'g-3',
        tenantId: 't1',
        facilityId: 'f1',
        scopes: ['Vitals'],
        purpose: 'Care',
        source: 'Manual',
        status: 'Active',
        expiresAt: NOW,
        createdAt: NOW,
      },
    ]);
    expect(grants[0].facilityName).toBeUndefined();
    expect(grants[0].revokedAt).toBeUndefined();

    const logs = accessLogPageSchema.parse({
      items: [
        {
          id: 'log-1',
          grantId: 'g-3',
          actor: 'Dr. Reyes',
          action: 'ViewVitals',
          at: NOW,
        },
      ],
      totalCount: 1,
    });
    expect(logs.items[0].facilityName).toBeUndefined();
    expect(logs.items[0].detail).toBeUndefined();
  });
});
