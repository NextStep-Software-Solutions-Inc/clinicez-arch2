import { describe, expect, it } from 'bun:test';
import {
  deduplicateEligibilityGrants,
  type PatientEligibilityGrantDto,
} from '../services/comms/communicationsService';

describe('New Message Inquiry Eligibility Grant Deduplication (Issue #272)', () => {
  const baseGrant: PatientEligibilityGrantDto = {
    grantId: 'grant-1',
    patientId: 'patient-portal-1',
    tenantId: 'tenant-nextstep',
    facilityId: 'fac-nextstep-opd',
    facilityType: 'Clinic',
    facilityName: 'Nextstep OPD',
    contextType: 'Appointment',
    contextId: 'appt-1',
    isActive: true,
    windowStartUtc: '2026-11-25T00:00:00Z',
    windowEndUtc: '2026-12-02T00:00:00Z',
  };

  it('collapses multiple active contexts (Appointment + QueueVisit) for the same facility into one option keeping latest expiry', () => {
    const grants: PatientEligibilityGrantDto[] = [
      baseGrant,
      {
        ...baseGrant,
        grantId: 'grant-2',
        contextType: 'QueueVisit',
        contextId: 'queue-1',
        windowEndUtc: '2026-12-10T00:00:00Z',
      },
      {
        ...baseGrant,
        grantId: 'grant-3',
        facilityId: 'fac-lab-1',
        facilityType: 'Laboratory',
        facilityName: 'Nextstep Diagnostics',
        contextType: 'LabRequisition',
        contextId: 'lab-1',
        windowEndUtc: '2026-12-05T00:00:00Z',
      },
    ];

    const deduplicated = deduplicateEligibilityGrants(grants);
    expect(deduplicated).toHaveLength(2);

    const clinicGrant = deduplicated.find((g) => g.facilityId === 'fac-nextstep-opd');
    expect(clinicGrant?.grantId).toBe('grant-2');
    expect(clinicGrant?.facilityName).toBe('Nextstep OPD');

    const labGrant = deduplicated.find((g) => g.facilityId === 'fac-lab-1');
    expect(labGrant?.grantId).toBe('grant-3');
  });

  it('prefers open-ended grants (null windowEndUtc) over bounded grants for the same facility', () => {
    const grants: PatientEligibilityGrantDto[] = [
      {
        ...baseGrant,
        grantId: 'grant-bounded',
        windowEndUtc: '2026-12-02T00:00:00Z',
      },
      {
        ...baseGrant,
        grantId: 'grant-open',
        windowEndUtc: null,
      },
    ];

    const deduplicated = deduplicateEligibilityGrants(grants);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].grantId).toBe('grant-open');
  });
});
