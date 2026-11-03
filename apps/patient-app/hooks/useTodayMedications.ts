/**
 * Custom SWR Hook for Today's Medications and Adherence logging.
 *
 * Provides:
 * - `medications`: TodayMedicationDto[] (active scheduled medications or SQLite cache)
 * - `error`: Error | null
 * - `isLoading`: boolean
 * - `isValidating`: boolean
 * - `mutate`: SWR KeyedMutator
 * - `logNow`: callback to log a dose adherence with optimistic UI updates
 */

import { useCallback } from 'react';
import useSWR, { type KeyedMutator, type SWRConfiguration } from 'swr';
import type { TokenProvider } from '../services/api/apiClient';
import {
  fetchTodayMedications,
  logMedicationAdherence as logAdherenceApi,
  type TodayMedicationDto,
} from '../services/api/medicationsApi';

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
};

export interface UseTodayMedicationsOptions {
  date?: string;
  getToken?: TokenProvider;
  config?: SWRConfiguration;
}

export interface UseTodayMedicationsResult {
  medications: TodayMedicationDto[];
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<TodayMedicationDto[]>;
  logNow: (medicationId: string, takenAt?: string) => Promise<boolean>;
}

export function useTodayMedications(
  patientId?: string,
  dateOrOptions?: string | UseTodayMedicationsOptions,
  options?: UseTodayMedicationsOptions,
): UseTodayMedicationsResult {
  const resolvedDate = typeof dateOrOptions === 'string' ? dateOrOptions : dateOrOptions?.date;
  const opts: UseTodayMedicationsOptions =
    typeof dateOrOptions === 'object' && dateOrOptions !== null
      ? dateOrOptions
      : (options ?? {});

  const effectivePatientId = patientId ?? null;
  const getToken = opts.getToken;
  const swrConfig = opts.config;

  const swrKey = effectivePatientId
    ? `/patients/${effectivePatientId}/medications/today${resolvedDate ? `?date=${encodeURIComponent(resolvedDate)}` : ''}`
    : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<TodayMedicationDto[]>(
    swrKey,
    async () => {
      if (!effectivePatientId) return [];
      return fetchTodayMedications(effectivePatientId, resolvedDate, getToken);
    },
    { ...DEFAULT_SWR_CONFIG, ...swrConfig },
  );

  const logNow = useCallback(
    async (medicationId: string, takenAt?: string): Promise<boolean> => {
      if (!effectivePatientId) {
        throw new Error('Cannot log medication adherence without an authenticated patient ID.');
      }

      const resolvedTakenAt = takenAt ?? new Date().toISOString();

      // Optimistically mark dose as taken in SWR cache
      await mutate(
        (current) =>
          (current ?? []).map((m) =>
            m.id === medicationId
              ? { ...m, isTaken: true, takenAt: resolvedTakenAt }
              : m,
          ),
        { revalidate: false },
      );

      try {
        const success = await logAdherenceApi(
          effectivePatientId,
          medicationId,
          resolvedTakenAt,
          undefined,
          getToken,
        );
        await mutate();
        return success;
      } catch (err) {
        await mutate();
        throw err;
      }
    },
    [effectivePatientId, getToken, mutate],
  );

  return {
    medications: data ?? [],
    error: error ?? null,
    isLoading: isLoading && Boolean(swrKey),
    isValidating,
    mutate,
    logNow,
  };
}
