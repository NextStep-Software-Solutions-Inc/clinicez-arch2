import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError, extractApiError } from '@shared/safe';
import { getPharmacyApiBaseUrl } from './runtimeConfig';
import { getAccessToken, getValidAccessToken, refreshSession, tenantHeaders } from './authSession';

const API_PREFIX = '/api/v1';

export type PharmacyRequestConfig = AxiosRequestConfig & { skipAuth?: boolean };

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; skipAuth?: boolean };

export class PharmacyApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(async (config) => {
      config.baseURL = getPharmacyApiBaseUrl();
      if (!(config as RetriableConfig).skipAuth) {
        const token = await getValidAccessToken();
        if (token) {
          config.headers.set('Authorization', `Bearer ${token}`);
        }
      }
      Object.entries(tenantHeaders()).forEach(([name, value]) => config.headers.set(name, value));
      return config;
    });

    this.client.interceptors.response.use(undefined, async (error) => {
      const original = error?.config as RetriableConfig | undefined;
      if (error?.response?.status === 401 && original && !original._retried && !original.skipAuth) {
        original._retried = true;
        if (await refreshSession()) {
          const token = getAccessToken();
          if (token) original.headers.set('Authorization', `Bearer ${token}`);
          return this.client.request(original);
        }
      }
      throw error;
    });
  }

  async get<T>(url: string, config?: PharmacyRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.get<ApiResponse<T>>(url, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async post<T>(url: string, data?: unknown, config?: PharmacyRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.post<ApiResponse<T>>(url, data, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async put<T>(url: string, data?: unknown, config?: PharmacyRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.put<ApiResponse<T>>(url, data, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async delete<T>(url: string, config?: PharmacyRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.delete<ApiResponse<T>>(url, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }
}

export const pharmacyApiClient = new PharmacyApiClient();
