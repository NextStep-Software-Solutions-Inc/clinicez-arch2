import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError } from '@shared/safe';

const BASE_URL = (process.env.EXPO_PUBLIC_PHARMACY_API_URL ?? 'http://localhost:5245').replace(/\/+$/, '');
const API_PREFIX = '/api/v1';

export class PharmacyApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${BASE_URL}${API_PREFIX}`,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.get<ApiResponse<T>>(url, config));
    if (error) {
      const axiosErr = error as any;
      const status = axiosErr.response?.status ?? 0;
      const payload = axiosErr.response?.data as ApiResponse<T> | undefined;
      return [null, new ApiError(payload?.message ?? axiosErr.message, status, payload?.errors)];
    }
    return [response?.data?.data ?? null, null];
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.post<ApiResponse<T>>(url, data, config));
    if (error) {
      const axiosErr = error as any;
      const status = axiosErr.response?.status ?? 0;
      const payload = axiosErr.response?.data as ApiResponse<T> | undefined;
      return [null, new ApiError(payload?.message ?? axiosErr.message, status, payload?.errors)];
    }
    return [response?.data?.data ?? null, null];
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.put<ApiResponse<T>>(url, data, config));
    if (error) {
      const axiosErr = error as any;
      const status = axiosErr.response?.status ?? 0;
      const payload = axiosErr.response?.data as ApiResponse<T> | undefined;
      return [null, new ApiError(payload?.message ?? axiosErr.message, status, payload?.errors)];
    }
    return [response?.data?.data ?? null, null];
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.delete<ApiResponse<T>>(url, config));
    if (error) {
      const axiosErr = error as any;
      const status = axiosErr.response?.status ?? 0;
      const payload = axiosErr.response?.data as ApiResponse<T> | undefined;
      return [null, new ApiError(payload?.message ?? axiosErr.message, status, payload?.errors)];
    }
    return [response?.data?.data ?? null, null];
  }
}

export const pharmacyApiClient = new PharmacyApiClient();
