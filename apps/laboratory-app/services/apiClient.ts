import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError, extractApiError } from '@shared/safe';
import { getLabApiBaseUrl } from './runtimeConfig';

const API_PREFIX = '/api/v1';

export class LaboratoryApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      config.baseURL = getLabApiBaseUrl();
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

export const labApiClient = new LaboratoryApiClient();
