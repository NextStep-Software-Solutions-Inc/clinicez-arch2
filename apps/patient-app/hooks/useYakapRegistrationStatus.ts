import { useEffect, useState } from 'react';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index';
import { patientGovernmentIds } from '../db/schema/patientGovernmentIds';
import { clinicMemberships } from '../db/schema/clinicMemberships';
import { clinics } from '../db/schema/clinics';
import { prescriptions } from '../db/schema/prescriptions';
import { patients } from '../db/schema/patients';
import { storage } from '../utils/storage';

export interface YakapRegistrationStatus {
  isConfirmedRegistered: boolean;
  philhealthPin: string | null;
  assignedClinicName: string | null;
  gamotUsed: number;
  annualAllocation: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const ANNUAL_YAKAP_MEDICINE_ALLOCATION = 20000;

/**
 * Evaluates whether the current patient is 100% verified and registered for PhilHealth YAKAP
 * with an accredited ClinicEZ partner facility.
 */
export function useYakapRegistrationStatus(patientId: string | null | undefined): YakapRegistrationStatus {
  const [isConfirmedRegistered, setIsConfirmedRegistered] = useState(false);
  const [philhealthPin, setPhilhealthPin] = useState<string | null>(null);
  const [assignedClinicName, setAssignedClinicName] = useState<string | null>(null);
  const [gamotUsed, setGamotUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadStatus = async () => {
    if (!patientId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // 1. Fetch PhilHealth PIN
      const idRows = await db
        .select()
        .from(patientGovernmentIds)
        .where(eq(patientGovernmentIds.patientId, patientId));
      const pin = idRows.length > 0 && idRows[0].philhealthId ? idRows[0].philhealthId : null;
      setPhilhealthPin(pin);

      // 2. Fetch Active Clinic Memberships
      const membershipRows = await db
        .select({
          membershipId: clinicMemberships.id,
          clinicId: clinicMemberships.clinicId,
          clinicName: clinics.name,
          status: clinicMemberships.status,
        })
        .from(clinicMemberships)
        .innerJoin(clinics, eq(clinicMemberships.clinicId, clinics.id))
        .where(
          and(
            eq(clinicMemberships.patientId, patientId),
            eq(clinicMemberships.status, 'active')
          )
        );

      const activeClinic = membershipRows.length > 0 ? membershipRows[0] : null;
      setAssignedClinicName(activeClinic?.clinicName ?? null);

      // 3. Fetch Consent / Enlistment Flag
      const patientRows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, patientId));
      const hasEnlistmentConsent = patientRows.length > 0 && !!patientRows[0].consentToShareInfo;

      // 4. Calculate medicine allowance claimed
      const rxRows = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.patientId, patientId));
      const totalClaimed = rxRows
        .filter((r) => r.isPhilHealthGamot)
        .reduce((sum, r) => sum + (r.gamotCoverageAmount ?? 0), 0);
      setGamotUsed(totalClaimed);

      // 5. Check optional developer debug override
      let debugOverride = false;
      if (__DEV__) {
        const storedDebug = await storage.getItemAsync('debug_force_yakap_registered');
        debugOverride = storedDebug === 'true';
      }

      // Confirmed only if: PIN is present AND patient has an active accredited clinic membership with consent (or debug override)
      const confirmed = debugOverride || (Boolean(pin) && Boolean(activeClinic) && hasEnlistmentConsent);
      setIsConfirmedRegistered(confirmed);
    } catch (err) {
      console.error('[useYakapRegistrationStatus] Error loading status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [patientId]);

  return {
    isConfirmedRegistered,
    philhealthPin,
    assignedClinicName: assignedClinicName ?? 'Partner Health Center',
    gamotUsed,
    annualAllocation: ANNUAL_YAKAP_MEDICINE_ALLOCATION,
    isLoading,
    refresh: loadStatus,
  };
}
