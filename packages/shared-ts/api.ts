/**
 * Common API Response and Error contracts across all Clinic EZ frontend apps and microservices.
 * Mirrors CLINICEZ.Shared.Common.ApiResponse<T> and GlobalExceptionHandler shapes.
 */

export interface ApiFieldError {
  field: string | null;
  code: string;
  message: string;
}

export interface ApiResponse<T = any> {
  succeeded: boolean;
  message: string | null;
  data: T | null;
  errors?: ApiFieldError[];
}

export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];

  constructor(message: string, status: number, errors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors =
      errors.length > 0
        ? errors
        : [{ field: null, code: 'API_ERROR', message }];
  }
}

/**
 * Safely extracts a meaningful, user-friendly ApiError from any error object,
 * including Axios errors, ASP.NET Core ValidationProblemDetails (RFC 7807/9110),
 * standard ApiResponse envelopes, and network errors.
 */
export function extractApiError(error: unknown, defaultFallback = 'Request failed.'): ApiError {
  if (error instanceof ApiError) return error;

  const axiosErr = error as any;
  const status: number = typeof axiosErr?.response?.status === 'number' ? axiosErr.response.status : 0;
  const rawData = axiosErr?.response?.data;

  // Network / server connection error
  if (status === 0 && !rawData) {
    const rawMsg = axiosErr?.message || '';
    const isNetwork =
      rawMsg.toLowerCase().includes('network') ||
      rawMsg.toLowerCase().includes('econnrefused') ||
      rawMsg.toLowerCase().includes('failed to fetch');
    const msg = isNetwork
      ? 'Cannot reach the clinic server. Check your connection and the server address.'
      : (rawMsg || defaultFallback);
    return new ApiError(msg, 0);
  }

  const fieldErrors: ApiFieldError[] = [];
  let extractedMessage: string | null = null;

  if (rawData && typeof rawData === 'object') {
    // 1. Parse errors collection
    if (Array.isArray(rawData.errors)) {
      for (const item of rawData.errors) {
        if (typeof item === 'string') {
          fieldErrors.push({ field: null, code: 'VALIDATION_ERROR', message: item });
        } else if (item && typeof item === 'object') {
          fieldErrors.push({
            field: item.field ?? null,
            code: item.code ?? 'VALIDATION_ERROR',
            message: item.message ?? item.longMessage ?? JSON.stringify(item),
          });
        }
      }
    } else if (rawData.errors && typeof rawData.errors === 'object') {
      // ASP.NET ValidationProblemDetails: { [key: string]: string[] | string }
      for (const [fieldKey, val] of Object.entries(rawData.errors)) {
        const cleanField = fieldKey.startsWith('$.') ? fieldKey.slice(2) : fieldKey;
        if (Array.isArray(val)) {
          for (const msg of val) {
            if (typeof msg === 'string') {
              fieldErrors.push({ field: cleanField, code: 'VALIDATION_ERROR', message: msg });
            }
          }
        } else if (typeof val === 'string') {
          fieldErrors.push({ field: cleanField, code: 'VALIDATION_ERROR', message: val });
        }
      }
    }

    // 2. Determine best primary message
    if (typeof rawData.message === 'string' && rawData.message.trim().length > 0) {
      extractedMessage = rawData.message.trim();
    } else if (fieldErrors.length > 0) {
      // If there are specific field errors, filter out generic wrapper "The command field is required."
      const specificFieldErrors = fieldErrors.filter(
        (e) => e.field !== 'command' && !e.message.includes('The command field is required')
      );
      const errorsToUse = specificFieldErrors.length > 0 ? specificFieldErrors : fieldErrors;
      const uniqueMsgs = Array.from(new Set(errorsToUse.map((e) => e.message)));
      extractedMessage = uniqueMsgs.join('; ');
    } else if (typeof rawData.detail === 'string' && rawData.detail.trim().length > 0) {
      extractedMessage = rawData.detail.trim();
    } else if (typeof rawData.title === 'string' && rawData.title.trim().length > 0) {
      extractedMessage = rawData.title.trim();
    }
  } else if (typeof rawData === 'string' && rawData.trim().length > 0) {
    extractedMessage = rawData.trim();
  }

  const finalMessage = extractedMessage || axiosErr?.message || defaultFallback;
  return new ApiError(finalMessage, status, fieldErrors);
}

export enum FacilityType {
  Clinic = 0,
  Laboratory = 1,
  Pharmacy = 2,
  Organization = 3,
}

export enum SyncStatus {
  Synced = 'synced',
  Pending = 'pending',
  Conflict = 'conflict',
  Failed = 'failed',
}
