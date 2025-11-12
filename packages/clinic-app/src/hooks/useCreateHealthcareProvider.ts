import { useState } from "react";
import {
  createHealthcareProviderWithBasicInfo,
  type CreateHealthcareProviderWithBasicInfoInput,
  type CreateHealthcareProviderResult,
} from "../actions/healthcare-provider.action";
import type { DbActionResult } from "../lib/error";

/**
 * Custom hook for creating a healthcare provider with basic info
 * 
 * @returns Object containing createProvider function, loading state, error, and result
 * 
 * @example
 * ```tsx
 * const { createProvider, isCreating, error } = useCreateHealthcareProvider();
 * 
 * const handleSubmit = async (data) => {
 *   const result = await createProvider(data);
 *   if (result.success) {
 *     console.log("Provider created:", result.data);
 *   }
 * };
 * ```
 */
export function useCreateHealthcareProvider() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateHealthcareProviderResult | null>(
    null
  );

  const createProvider = async (
    input: CreateHealthcareProviderWithBasicInfoInput
  ): Promise<DbActionResult<CreateHealthcareProviderResult>> => {
    setIsCreating(true);
    setError(null);
    setResult(null);

    try {
      const response = await createHealthcareProviderWithBasicInfo(input);

      if (response.ok) {
        setResult(response.data);
      } else {
        setError(response.error.userMessage);
      }

      return response;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);

      // Return error result matching DbActionResult type
      const normalizedError: DbActionResult<CreateHealthcareProviderResult> = {
        ok: false,
        error: {
          kind: { type: "unknown" },
          message: errorMessage,
          userMessage: errorMessage,
          original: err,
        },
      };

      return normalizedError;
    } finally {
      setIsCreating(false);
    }
  };

  const reset = () => {
    setError(null);
    setResult(null);
    setIsCreating(false);
  };

  return {
    createProvider,
    isCreating,
    error,
    result,
    reset,
  };
}
