import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { safeAwait, type ApiResponse, type ApiError, extractApiError } from '@shared/safe';
import { endSession, ensureFreshAccessToken, getAccessToken, refreshSession } from './authSession';
import { getBillingApiBaseUrl } from './runtimeConfig';

export type ApiResult<T> = [T | null, ApiError | null];

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export class BillingApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (config) => {
      config.baseURL = getBillingApiBaseUrl();
      const token = await ensureFreshAccessToken();
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    });

    this.client.interceptors.response.use(undefined, async (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
        const original = error.config as RetriableConfig | undefined;
        if (original && !original._retried && (await refreshSession())) {
          original._retried = true;
          const token = getAccessToken();
          if (token) original.headers.set('Authorization', `Bearer ${token}`);
          return this.client.request(original);
        }
        endSession();
      }
      return Promise.reject(error);
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    const [response, error] = await safeAwait(this.client.get<ApiResponse<T>>(url, config));
    if (error) return [null, extractApiError(error)];
    return [response?.data?.data ?? null, null];
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    const [response, error] = await safeAwait(this.client.post<ApiResponse<T>>(url, data, config));
    if (error) return [null, extractApiError(error)];
    return [response?.data?.data ?? null, null];
  }
}

export const billingApiClient = new BillingApiClient();
