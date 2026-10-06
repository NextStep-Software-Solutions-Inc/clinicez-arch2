import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError, resolveTenantContext } from '@shared/safe';

const resolveDefaultBaseUrl = (fallbackPort: number = 5245): string => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol || 'http:';

    // Local development or direct IP access uses explicit dev port
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.lvh.me') ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return `${protocol}//${hostname}:${fallbackPort}`;
    }

    // Subdomain-based cloud or enterprise deployment (e.g. <facility>.clinic.<baseDomain> or clinic.<baseDomain>)
    const match = hostname.match(/^(?:[a-z0-9-]+\.)?clinic\.(.+)$/);
    if (match) {
      return `https://clinic-api.${match[1]}`;
    }

    return `${protocol}//${hostname}`;
  }
  return `http://localhost:${fallbackPort}`;
};

export const CLINIC_BASE_URL = (
  process.env.EXPO_PUBLIC_CLINIC_API_URL ?? resolveDefaultBaseUrl(5245)
).replace(/\/+$/, '');

export const PHARMACY_BASE_URL = (
  process.env.EXPO_PUBLIC_PHARMACY_API_URL ?? CLINIC_BASE_URL
).replace(/\/+$/, '');

export const API_PREFIX = '/api/v1';

export class ClinicApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = CLINIC_BASE_URL) {
    this.client = axios.create({
      baseURL: `${baseUrl}${API_PREFIX}`,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Dynamically inject active tenant and clinic ID headers on every outgoing request
    this.client.interceptors.request.use((config) => {
      const context = resolveTenantContext();
      if (context.tenantSlug) {
        config.headers['X-Tenant-Id'] = context.tenantSlug;
      }
      if (context.clinicId) {
        config.headers['X-Clinic-Id'] = context.clinicId;
      }
      return config;
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

export const clinicApiClient = new ClinicApiClient(CLINIC_BASE_URL);
export const pharmacyApiClient = new ClinicApiClient(PHARMACY_BASE_URL);
