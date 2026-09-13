/**
 * Axios-based HTTP client for the PatientApp backend API.
 *
 * - Reads base URL from EXPO_PUBLIC_API_URL.
 * - Attaches the Clerk JWT via request config.
 * - Unwraps the standard ApiResponse<T> envelope { succeeded, message, data, errors }.
 * - Throws ApiError (includes status, server message, and structured field errors).
 *
 * Error shape from backend:
 *   errors: Array<{ field: string | null, code: string, message: string }>
 *
 * SWR integration:
 *   - swrFetcher(key, getToken) — use directly as `fetcher` in useSWR.
 *   - swrKey(path, params)     — builds a stable cache key with query params.
 */

import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const API_PREFIX = '/api/v1';

/** A single structured error from the backend. */
export interface ApiFieldError {
    /** Null for non-field errors (e.g. 404, 409, 503). */
    field: string | null;
    /** Machine-readable constant, e.g. "REQUIRED_FIELD_MISSING", "NOT_FOUND". */
    code: string;
    /** Human-friendly string — safe to display directly in the UI. */
    message: string;
}

interface ApiEnvelope<T> {
    succeeded: boolean;
    message: string | null;
    data: T | null;
    errors?: ApiFieldError[];
}

// ── Error class ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
    /** HTTP status code (0 = network / config error). */
    readonly status: number;
    /**
     * Structured error list from the backend.
     * Always contains at least one item on failure.
     * For validation errors each item carries the `field` name.
     */
    readonly errors: ApiFieldError[];

    constructor(message: string, status: number, errors: ApiFieldError[] = []) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors.length > 0
            ? errors
            : [{ field: null, code: 'ERROR', message }];
    }

    /** Returns all error messages joined for simple toast display. */
    get userMessage(): string {
        return this.errors.map((e) => e.message).join('\n');
    }

    /** Returns the first error message (most common case). */
    get firstMessage(): string {
        return this.errors[0]?.message ?? this.message;
    }

    /** Returns field-keyed errors for form validation libraries. */
    get fieldErrors(): Record<string, string> {
        return Object.fromEntries(
            this.errors
                .filter((e) => e.field !== null)
                .map((e) => [e.field!, e.message]),
        );
    }
}

// ── Axios instance ────────────────────────────────────────────────────────────

const axiosInstance = axios.create({
    baseURL: `${BASE_URL}${API_PREFIX}`,
    headers: { Accept: 'application/json' },
    timeout: 30_000,
});

// Response interceptor: unwrap ApiResponse<T> envelope, convert to ApiError on failure
axiosInstance.interceptors.response.use(
    (response) => {
        if (response.status === 204) return response;
        const envelope = response.data as ApiEnvelope<unknown>;
        if (!envelope.succeeded) {
            throw new ApiError(
                envelope.message ?? 'Request failed',
                response.status,
                envelope.errors ?? [],
            );
        }
        response.data = envelope.data;
        return response;
    },
    (error: AxiosError<ApiEnvelope<unknown>>) => {
        const status = error.response?.status ?? 0;
        const envelope = error.response?.data;
        const message = envelope?.message ?? error.message ?? 'Network error';
        const errors = envelope?.errors ?? [];
        throw new ApiError(message, status, errors);
    },
);

// ── Authenticated request helper ──────────────────────────────────────────────

async function authRequest<T>(
    getToken: () => Promise<string | null>,
    config: AxiosRequestConfig,
): Promise<T> {
    if (!BASE_URL) {
        throw new ApiError('EXPO_PUBLIC_API_URL is not configured.', 0, [
            { field: null, code: 'NO_API_URL', message: 'API URL is not configured.' },
        ]);
    }
    const token = await getToken();
    const response = await axiosInstance.request<T>({
        ...config,
        headers: {
            ...config.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    return response.data;
}

// ── api namespace ─────────────────────────────────────────────────────────────

export const api = {
    get: <T>(getToken: () => Promise<string | null>, path: string): Promise<T> =>
        authRequest<T>(getToken, { method: 'GET', url: path }),

    post: <T>(getToken: () => Promise<string | null>, path: string, body?: unknown): Promise<T> =>
        authRequest<T>(getToken, { method: 'POST', url: path, data: body }),

    put: <T>(getToken: () => Promise<string | null>, path: string, body?: unknown): Promise<T> =>
        authRequest<T>(getToken, { method: 'PUT', url: path, data: body }),

    patch: <T>(getToken: () => Promise<string | null>, path: string, body?: unknown): Promise<T> =>
        authRequest<T>(getToken, { method: 'PATCH', url: path, data: body }),

    delete: <T>(getToken: () => Promise<string | null>, path: string): Promise<T> =>
        authRequest<T>(getToken, { method: 'DELETE', url: path }),
};

// ── SWR integration ───────────────────────────────────────────────────────────

/**
 * SWR fetcher for GET requests.
 *
 * Usage:
 *   const { data, error } = useSWR(
 *     [swrKey('/organizations', { q }), getToken],
 *     ([path, gt]) => swrFetcher(path, gt),
 *   );
 *
 * On error, `error` will be an ApiError with `.errors`, `.userMessage`, `.fieldErrors`.
 */
export async function swrFetcher<T>(
    path: string,
    getToken: () => Promise<string | null>,
): Promise<T> {
    return api.get<T>(getToken, path);
}

/**
 * Builds a stable SWR cache key that includes query params.
 *
 * Usage:
 *   swrKey('/organizations', { q: query, skip, take })
 *   // → '/organizations?q=foo&skip=0&take=20'
 */
export function swrKey(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
): string {
    if (!params) return path;
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}

