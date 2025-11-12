import { useState, useEffect, useCallback } from "react";
import { getPatientWithBasicInfo, type PatientWithBasicInfo } from "../actions/patient.action";
import type { NormalizedDatabaseError } from "../lib/error";

/**
 * Props for usePatient hook
 */
export interface UsePatientProps {
  patientId: string;
  tenantId: string;
  enabled?: boolean;
}

/**
 * Return type for usePatient hook
 */
export interface UsePatientReturn {
  patient: PatientWithBasicInfo | null;
  isLoading: boolean;
  error: NormalizedDatabaseError | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single patient with basic info from SQLite
 * 
 * @example
 * ```typescript
 * const { patient, isLoading, error, refetch } = usePatient({
 *   patientId: "patient-uuid",
 *   tenantId: "tenant-uuid",
 * });
 * ```
 */
export function usePatient({
  patientId,
  tenantId,
  enabled = true,
}: UsePatientProps): UsePatientReturn {
  const [patient, setPatient] = useState<PatientWithBasicInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedDatabaseError | null>(null);

  const fetchPatient = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await getPatientWithBasicInfo(patientId, tenantId);

      if (response.ok) {
        setPatient(response.data);
      } else {
        setError(response.error);
        setPatient(null);
      }
    } catch (err) {
      console.error("Error in usePatient:", err);
      setError({
        kind: { type: "unknown" },
        message: err instanceof Error ? err.message : "Unknown error",
        userMessage: "Failed to fetch patient",
        original: err,
      });
      setPatient(null);
    } finally {
      setIsLoading(false);
    }
  }, [patientId, tenantId, enabled]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  return {
    patient,
    isLoading,
    error,
    refetch: fetchPatient,
  };
}
