import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from 'contexts/AuthContext';
import { swrFetcher, swrKey, type ApiError } from 'services/api/apiClient';
import { deviceSessionListSchema, type DeviceSessionDto } from 'services/api/sessionsApi';
import { getStoredDeviceId } from 'services/devices/deviceIdentity';

type GetToken = () => Promise<string | null>;
type FetchKey = [path: string, getToken: GetToken];

export function useDeviceSessions(patientId: string) {
  const { getToken } = useAuth();
  return useSWR<DeviceSessionDto[], ApiError, FetchKey>(
    [swrKey(`/patients/${patientId}/sessions`), getToken],
    async ([path, tokenFn]) => deviceSessionListSchema.parse(await swrFetcher<unknown>(path, tokenFn)),
    { shouldRetryOnError: false, revalidateOnFocus: true, revalidateOnReconnect: true },
  );
}

/** This install's device id, or null until read / when it has never registered. */
export function useCurrentDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getStoredDeviceId()
      .then((id) => {
        if (!cancelled) setDeviceId(id);
      })
      .catch(() => {
        if (!cancelled) setDeviceId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return deviceId;
}
