/**
 * Custom SWR Hook for Patient Appointments.
 *
 * Provides:
 * - `appointments`: AppointmentItem[] (live appointments or SQLite offline cache)
 * - `error`: Error | null
 * - `isLoading`: boolean
 * - `isValidating`: boolean
 * - `mutate`: SWR KeyedMutator
 * - `refresh`: explicitly revalidates appointments
 */

import { useCallback } from 'react';
import useSWR, { type KeyedMutator, type SWRConfiguration } from 'swr';
import { db } from '../db/index';
import {
  fetchAppointments,
  type AppointmentItem,
} from '../services/appointments/appointmentsService';
import type { TokenProvider } from '../services/api/apiClient';

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
};

export interface UseAppointmentsOptions {
  getToken?: TokenProvider;
  database?: any;
  config?: SWRConfiguration;
}

export interface UseAppointmentsResult {
  appointments: AppointmentItem[];
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<AppointmentItem[]>;
  refresh: () => Promise<AppointmentItem[] | undefined>;
}

export function useAppointments(
  patientId?: string,
  options?: UseAppointmentsOptions | SWRConfiguration,
): UseAppointmentsResult {
  const opts: UseAppointmentsOptions =
    options && 'config' in options
      ? (options as UseAppointmentsOptions)
      : options && !('getToken' in options)
        ? { config: options as SWRConfiguration }
        : ((options as UseAppointmentsOptions) ?? {});

  const effectivePatientId = patientId ?? null;
  const getToken = opts.getToken ?? (async () => null);
  const database = opts.database ?? db;
  const swrConfig = opts.config;

  const swrKey = effectivePatientId ? `/patients/${effectivePatientId}/appointments` : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<AppointmentItem[]>(
    swrKey,
    async () => {
      if (!effectivePatientId) return [];
      const res = await fetchAppointments(effectivePatientId, database, getToken);
      return res.items ?? [];
    },
    { ...DEFAULT_SWR_CONFIG, ...swrConfig },
  );

  const refresh = useCallback(async () => {
    return mutate();
  }, [mutate]);

  return {
    appointments: data ?? [],
    error: error ?? null,
    isLoading: isLoading && Boolean(swrKey),
    isValidating,
    mutate,
    refresh,
  };
}
