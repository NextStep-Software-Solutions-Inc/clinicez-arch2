/**
 * Custom SWR Hook for Patient Vitals telemetry.
 *
 * Provides:
 * - `data`: LatestVitalsDto | null (live telemetry or SQLite offline fallback)
 * - `error`: Error | null
 * - `isLoading`: boolean
 * - `isValidating`: boolean
 * - `mutate`: SWR KeyedMutator
 * - `recordVitals`: mutation function recording new vitals and updating local/remote state
 */

import { useCallback } from 'react';
import useSWR, { type KeyedMutator, type SWRConfiguration } from 'swr';
import {
  fetchLatestVitals,
  recordPatientVitals as recordVitalsApi,
  type LatestVitalsDto,
  type RecordVitalsInput,
  type TokenProvider,
  type VitalSignsDto,
} from '../services/api/vitalsApi';

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
};

export interface UseVitalsOptions {
  getToken?: TokenProvider;
  config?: SWRConfiguration;
}

export interface UseVitalsResult {
  data: LatestVitalsDto | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<LatestVitalsDto | null>;
  recordVitals: (input: RecordVitalsInput) => Promise<VitalSignsDto>;
}

export function useVitals(
  patientId?: string,
  options?: UseVitalsOptions | SWRConfiguration,
): UseVitalsResult {
  const opts: UseVitalsOptions =
    options && 'config' in options
      ? (options as UseVitalsOptions)
      : options && !('getToken' in options)
        ? { config: options as SWRConfiguration }
        : ((options as UseVitalsOptions) ?? {});

  const effectivePatientId = patientId ?? null;
  const getToken = opts.getToken;
  const swrConfig = opts.config;

  const swrKey = effectivePatientId ? `/patients/${effectivePatientId}/vitals/latest` : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<LatestVitalsDto | null>(
    swrKey,
    async () => {
      if (!effectivePatientId) return null;
      return fetchLatestVitals(effectivePatientId, getToken);
    },
    { ...DEFAULT_SWR_CONFIG, ...swrConfig },
  );

  const recordVitals = useCallback(
    async (input: RecordVitalsInput): Promise<VitalSignsDto> => {
      if (!effectivePatientId) {
        throw new Error('Cannot record vitals without an authenticated patient ID.');
      }

      const result = await recordVitalsApi(effectivePatientId, input, getToken);

      // Optimistically update SWR cache with the new recorded vitals
      await mutate(
        (current) => ({
          heartRateBpm: input.heartRateBpm ?? current?.heartRateBpm ?? null,
          heartRateTrend: current?.heartRateTrend ?? '+0 bpm',
          systolicBp: input.systolicBp ?? current?.systolicBp ?? null,
          diastolicBp: input.diastolicBp ?? current?.diastolicBp ?? null,
          bpCategory: input.systolicBp && input.diastolicBp
            ? (input.systolicBp < 120 && input.diastolicBp < 80 ? 'Optimal' : 'Normal')
            : current?.bpCategory ?? null,
          bloodGlucoseMgDl: input.bloodGlucoseMgDl ?? input.fastingBloodGlucose ?? current?.bloodGlucoseMgDl ?? null,
          glucoseCategory: input.bloodGlucoseMgDl
            ? (input.bloodGlucoseMgDl <= 100 ? 'Fasting' : 'Normal')
            : current?.glucoseCategory ?? null,
          sleepHours: input.sleepHours ?? current?.sleepHours ?? null,
          sleepFormatted: input.sleepHours ? `${input.sleepHours}h` : current?.sleepFormatted ?? null,
          sleepDeepFormatted: current?.sleepDeepFormatted ?? null,
          recordedAt: input.recordedAt ?? new Date().toISOString(),
          bpSystolic: input.systolicBp ?? current?.bpSystolic ?? null,
          bpDiastolic: input.diastolicBp ?? current?.bpDiastolic ?? null,
          fastingBloodGlucose: input.bloodGlucoseMgDl ?? input.fastingBloodGlucose ?? current?.fastingBloodGlucose ?? null,
          spO2Percent: input.oxygenSaturationPercent ?? current?.spO2Percent ?? null,
        }),
        { revalidate: true },
      );

      return result;
    },
    [effectivePatientId, getToken, mutate],
  );

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading: isLoading && Boolean(swrKey),
    isValidating,
    mutate,
    recordVitals,
  };
}
