import { useState, useCallback } from "react";
import {
  createPatientWithBasicInfo,
  type CreatePatientWithBasicInfoInput,
  type CreatePatientResult,
} from "../actions/patient.action";
import type { DbActionResult } from "../lib/error";
import type { CreateBasicInfoInput } from "../schemas/patient.schema";

interface UseCreatePatientOptions {
  onSuccess?: (result: CreatePatientResult) => void;
  onError?: (error: string) => void;
  tenantId: string;
}

interface UseCreatePatientReturn {
  createPatient: (basicInfo: CreateBasicInfoInput) => Promise<DbActionResult<CreatePatientResult>>;
  isCreating: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for creating a new patient with basic info
 * 
 * @param options - Configuration options
 * @param options.tenantId - The tenant ID for the current user
 * @param options.onSuccess - Callback when patient is created successfully
 * @param options.onError - Callback when an error occurs
 * 
 * @returns Object with createPatient function and state
 * 
 * @example
 * ```typescript
 * const { createPatient, isCreating, error } = useCreatePatient({
 *   tenantId: currentTenantId,
 *   onSuccess: (result) => {
 *     console.log("Patient created:", result.patientId);
 *     navigation.goBack();
 *   },
 *   onError: (errorMsg) => {
 *     Alert.alert("Error", errorMsg);
 *   }
 * });
 * 
 * // In your form submit handler
 * const handleSubmit = async (data: CreateBasicInfoInput) => {
 *   const result = await createPatient(data);
 *   if (result.ok) {
 *     // Success handled by onSuccess callback
 *   }
 * };
 * ```
 */
export function useCreatePatient({
  tenantId,
  onSuccess,
  onError,
}: UseCreatePatientOptions): UseCreatePatientReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPatient = useCallback(
    async (basicInfo: CreateBasicInfoInput): Promise<DbActionResult<CreatePatientResult>> => {
      setIsCreating(true);
      setError(null);

      try {
        const input: CreatePatientWithBasicInfoInput = {
          basicInfo,
          tenantId,
        };

        const result = await createPatientWithBasicInfo(input);

        if (result.ok) {
          onSuccess?.(result.data);
        } else {
          const errorMessage = result.error.userMessage;
          setError(errorMessage);
          onError?.(errorMessage);
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
        onError?.(errorMessage);

        return {
          ok: false,
          error: {
            kind: { type: "unknown" },
            message: errorMessage,
            userMessage: "Failed to create patient. Please try again.",
            original: err,
          },
        };
      } finally {
        setIsCreating(false);
      }
    },
    [tenantId, onSuccess, onError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    createPatient,
    isCreating,
    error,
    clearError,
  };
}
