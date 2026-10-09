import useSWR from 'swr';
import { useAuth } from 'contexts/AuthContext';
import { swrFetcher, swrKey, type ApiError } from 'services/api/apiClient';
import {
  accessGrantListSchema,
  accessLogPageSchema,
  type AccessGrantDto,
  type AccessLogPage,
} from 'services/api/sharingApi';

type GetToken = () => Promise<string | null>;
type FetchKey = [path: string, getToken: GetToken];

const SWR_OPTIONS = {
  shouldRetryOnError: false,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
} as const;

export function useAccessGrants(patientId: string) {
  const { getToken } = useAuth();
  return useSWR<AccessGrantDto[], ApiError, FetchKey>(
    [swrKey(`/patients/${patientId}/access-grants`), getToken],
    async ([path, tokenFn]) => accessGrantListSchema.parse(await swrFetcher<unknown>(path, tokenFn)),
    SWR_OPTIONS,
  );
}

const ACCESS_LOG_PAGE_SIZE = 50;

export function useAccessLog(patientId: string, grantId?: string) {
  const { getToken } = useAuth();
  const path = swrKey(`/patients/${patientId}/access-log`, {
    grantId,
    skip: 0,
    take: ACCESS_LOG_PAGE_SIZE,
  });
  return useSWR<AccessLogPage, ApiError, FetchKey>(
    [path, getToken],
    async ([url, tokenFn]) => accessLogPageSchema.parse(await swrFetcher<unknown>(url, tokenFn)),
    SWR_OPTIONS,
  );
}
