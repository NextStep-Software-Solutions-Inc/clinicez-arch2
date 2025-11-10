import { useState, useEffect, useCallback } from "react";
import { getPatientsWithBasicInfo, type PatientWithBasicInfo } from "../actions/patient.action";

/**
 * Props for usePatients hook
 */
export interface UsePatientsProps {
  tenantId: string;
  /**
   * If true, automatically fetch patients on mount
   * @default true
   */
  autoFetch?: boolean;
}

/**
 * Hook return type
 */
export interface UsePatientsReturn {
  patients: PatientWithBasicInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearError: () => void;
}

/**
 * Custom hook to fetch and manage patients list
 * 
 * @example
 * ```tsx
 * const { patients, isLoading, error, refetch } = usePatients({
 *   tenantId: "tenant-id",
 * });
 * 
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error} />;
 * 
 * return <PatientList patients={patients} onRefresh={refetch} />;
 * ```
 */
export function usePatients({
  tenantId,
  autoFetch = true,
}: UsePatientsProps): UsePatientsReturn {
  const [patients, setPatients] = useState<PatientWithBasicInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(async () => {
    if (!tenantId) {
      setError("Tenant ID is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPatientsWithBasicInfo(tenantId);

      if (result.ok) {
        // Type guard: when ok is true, data is guaranteed to be PatientWithBasicInfo[]
        setPatients(result.data);
      } else {
        setError(result.error.userMessage);
      }
    } catch (err) {
      console.error("Error in usePatients:", err);
      setError("An unexpected error occurred while fetching patients");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchPatients();
    }
  }, [autoFetch, fetchPatients]);

  return {
    patients,
    isLoading,
    error,
    refetch: fetchPatients,
    clearError,
  };
}
