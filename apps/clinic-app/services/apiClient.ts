import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import {
  safeAwait,
  ApiResponse,
  ApiError,
  resolveTenantContext,
  ensureApiPrefix,
  joinApiUrl,
} from '@shared/safe';
import { getApiBaseUrl } from './runtimeConfig';
import { ensureFreshToken, getAccessToken, refreshSession } from './authSession';

export const API_PREFIX = '/api/v1';

/** Absolute URL for a clinic API path (e.g. `/lab-orders/{id}/report-pdf`). Throws until a server is configured. */
export function clinicApiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) throw new ApiError('Connect this device to your clinic server first.', 0);
  return joinApiUrl(base, path);
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export interface ClinicApiClientOptions {
  /** Resolves the server origin per request, so a server address entered after launch is picked up. */
  baseUrl: () => string | null;
  /** Attach the signed-in staff member's bearer token (clinic server only). */
  authenticated: boolean;
}

export class ClinicApiClient {
  private client: AxiosInstance;

  constructor(private readonly options: ClinicApiClientOptions) {
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(async (config) => {
      const base = this.options.baseUrl();
      if (!base) {
        throw new ApiError('Connect this device to your clinic server first.', 0);
      }
      config.baseURL = ensureApiPrefix(base);

      // Workspace hints (cloud multi-tenant hosts). On-prem single-clinic servers resolve the clinic themselves.
      const context = resolveTenantContext();
      if (context.tenantSlug) config.headers['X-Tenant-Id'] = context.tenantSlug;
      if (context.facilitySlug) config.headers['X-Facility-Slug'] = context.facilitySlug;
      if (context.clinicId) config.headers['X-Clinic-Id'] = context.clinicId;

      if (this.options.authenticated) {
        await ensureFreshToken();
        const token = getAccessToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    if (options.authenticated) {
      this.client.interceptors.response.use(undefined, async (error) => {
        const original = error?.config as RetriableConfig | undefined;
        if (error?.response?.status === 401 && original && !original._retried) {
          original._retried = true;
          // Single-flight: concurrent 401s share one refresh rotation.
          if (await refreshSession()) {
            const token = getAccessToken();
            if (token) original.headers.Authorization = `Bearer ${token}`;
            return this.client.request(original);
          }
        }
        throw error;
      });
    }
  }

  private static toError<T>(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    const axiosErr = error as any;
    const status = axiosErr?.response?.status ?? 0;
    const payload = axiosErr?.response?.data as ApiResponse<T> | undefined;
    return new ApiError(payload?.message ?? axiosErr?.message ?? 'Request failed.', status, payload?.errors);
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.get<ApiResponse<T>>(url, config));
    if (error) return [null, ClinicApiClient.toError<T>(error)];
    return [response?.data?.data ?? null, null];
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.post<ApiResponse<T>>(url, data, config));
    if (error) return [null, ClinicApiClient.toError<T>(error)];
    return [response?.data?.data ?? null, null];
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.put<ApiResponse<T>>(url, data, config));
    if (error) return [null, ClinicApiClient.toError<T>(error)];
    return [response?.data?.data ?? null, null];
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<[T | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.delete<ApiResponse<T>>(url, config));
    if (error) return [null, ClinicApiClient.toError<T>(error)];
    return [response?.data?.data ?? null, null];
  }

  /** Authenticated binary download (PDFs, attachments). */
  async getBlob(url: string, config?: AxiosRequestConfig): Promise<[Blob | null, ApiError | null]> {
    const [response, error] = await safeAwait(this.client.get<Blob>(url, { ...config, responseType: 'blob' }));
    if (error) return [null, ClinicApiClient.toError(error)];
    return [response?.data ?? null, null];
  }
}

export const clinicApiClient = new ClinicApiClient({ baseUrl: getApiBaseUrl, authenticated: true });
