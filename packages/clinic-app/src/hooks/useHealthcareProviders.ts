import { useState, useEffect } from "react";
import {
  getHealthcareProvidersWithBasicInfo,
  getHealthcareProviderByUserId,
} from "../actions/healthcare-provider.action";
import type { DbActionResult } from "../lib/error";

/**
 * Healthcare provider data from the database
 */
type HealthcareProvider = Awaited<
  ReturnType<typeof getHealthcareProvidersWithBasicInfo>
> extends DbActionResult<infer T>
  ? T extends Array<infer U>
  ? U
  : never
  : never;

/**
 * Custom hook for fetching healthcare providers
 * 
 * @param tenantId - The tenant ID to filter providers
 * @returns Object containing providers, loading state, error, and refetch function
 * 
 * @example
 * ```tsx
 * const { providers, isLoading, error, refetch } = useHealthcareProviders(tenantId);
 * ```
 */
export function useHealthcareProviders(tenantId: string) {
  const [providers, setProviders] = useState<HealthcareProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    if (!tenantId) {
      setError("Tenant ID is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getHealthcareProvidersWithBasicInfo(tenantId);

      if (response.ok) {
        setProviders(response.data);
      } else {
        setError(response.error.userMessage);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch providers";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [tenantId]);

  return {
    providers,
    isLoading,
    error,
    refetch: fetchProviders,
  };
}

/**
 * Custom hook for fetching a healthcare provider by user ID
 * 
 * @param userId - The user ID to fetch provider for
 * @param tenantId - The tenant ID
 * @returns Object containing provider, loading state, error, and refetch function
 * 
 * @example
 * ```tsx
 * const { provider, isLoading, error } = useHealthcareProviderByUserId(userId, tenantId);
 * ```
 */
export function useHealthcareProviderByUserId(
  userId: string | null,
  tenantId: string
) {
  const [provider, setProvider] = useState<HealthcareProvider | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProvider = async () => {
    if (!userId || !tenantId) {
      setProvider(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getHealthcareProviderByUserId(userId, tenantId);

      if (response.ok) {
        setProvider(response.data);
      } else {
        setError(response.error.userMessage);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch provider";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProvider();
  }, [userId, tenantId]);

  return {
    provider,
    isLoading,
    error,
    refetch: fetchProvider,
  };
}
