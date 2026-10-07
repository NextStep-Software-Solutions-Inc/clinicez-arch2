import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { safeAwait, ApiResponse, ApiError, resolveTenantContext, resolveServiceApiUrl, ensureApiPrefix } from '@shared/safe';

const resolveDefaultBaseUrl = (fallbackPort: number = 5245): string => {
  const hasBrowserLocation = typeof window !== 'undefined' && !!window.location?.hostname;

  // Every value below is a literal `process.env.EXPO_PUBLIC_*` read so Metro inlines it at build time.
  return resolveServiceApiUrl({
    hostname: hasBrowserLocation ? window.location.hostname : null,
    protocol: hasBrowserLocation ? window.location.protocol : null,
    serviceSubdomain: process.env.EXPO_PUBLIC_SERVICE_SUBDOMAIN,
    baseDomain: process.env.EXPO_PUBLIC_BASE_DOMAIN,
    template: process.env.EXPO_PUBLIC_API_URL_TEMPLATE,
    fallbackPort,
  });
};

export const CLINIC_BASE_URL = (
  process.env.EXPO_PUBLIC_CLINIC_API_URL ??
  resolveDefaultBaseUrl(5245)
).replace(/\/+$/, '');

export const PHARMACY_BASE_URL = (
  process.env.EXPO_PUBLIC_PHARMACY_API_URL ?? CLINIC_BASE_URL
).replace(/\/+$/, '');

export const API_PREFIX = '/api/v1';

export class ClinicApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = CLINIC_BASE_URL) {
    this.client = axios.create({
      baseURL: ensureApiPrefix(baseUrl),
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
      if (context.facilitySlug) {
        config.headers['X-Facility-Slug'] = context.facilitySlug;
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
