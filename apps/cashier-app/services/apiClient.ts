import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, type ApiResponse, type ApiError, extractApiError } from '@shared/safe';
import { endSession, getAccessToken } from './authSession';
import { getBillingApiBaseUrl } from './runtimeConfig';

export type ApiResult<T> = [T | null, ApiError | null];

export class BillingApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config) => {
      config.baseURL = getBillingApiBaseUrl();
      const token = getAccessToken();
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    });

    this.client.interceptors.response.use(undefined, (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
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
