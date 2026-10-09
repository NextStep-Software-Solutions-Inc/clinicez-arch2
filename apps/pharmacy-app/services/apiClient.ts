import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError, extractApiError } from '@shared/safe';
import { PHARMACY_API_BASE_URL } from './apiBaseUrl';
import { getValidAccessToken, tenantHeaders } from './authSession';

const API_PREFIX = '/api/v1';

export class PharmacyApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: PHARMACY_API_BASE_URL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(async (config) => {
      const token = await getValidAccessToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
      Object.entries(tenantHeaders()).forEach(([name, value]) => config.headers.set(name, value));
      return config;
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.get<ApiResponse<T>>(url, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.post<ApiResponse<T>>(url, data, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.put<ApiResponse<T>>(url, data, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.delete<ApiResponse<T>>(url, config));
    if (error) {
      return [null, extractApiError(error)];
    }
    return [response?.data?.data ?? null, null];
  }
}

export const pharmacyApiClient = new PharmacyApiClient();
