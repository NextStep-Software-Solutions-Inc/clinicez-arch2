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
  errorCode?: string;
  traceId?: string;
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
  readonly errorCode?: string;
  readonly traceId?: string;

  constructor(
    message: string,
    status: number,
    errors: ApiFieldError[] = [],
    errorCode?: string,
    traceId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.traceId = traceId;
    this.errors =
      errors.length > 0
        ? errors
        : [{ field: null, code: errorCode || 'API_ERROR', message }];
  }

  /**
   * Returns an array of error messages for the given field name (case-insensitive lookup).
   * Strips JSON path prefixes like '$.' or leading '/'.
   * Example: "patientCode" matches "PatientCode" or "patientCode" or "$.patientCode".
   */
  getFieldErrors(field: string): string[] {
    if (!field || typeof field !== 'string') return [];
    const target = field.replace(/^(\$\.|\/)/, '').trim().toLowerCase();
    return this.errors
      .filter((e) => {
        if (!e.field || typeof e.field !== 'string') return false;
        const normalized = e.field.replace(/^(\$\.|\/)/, '').trim().toLowerCase();
        return normalized === target;
      })
      .map((e) => e.message);
  }

  /**
   * Returns the first error message for the field, or undefined if no error exists.
   */
  getFieldError(field: string): string | undefined {
    const messages = this.getFieldErrors(field);
    return messages.length > 0 ? messages[0] : undefined;
  }

  /**
   * Returns true if any errors exist for the field.
   */
  hasFieldError(field: string): boolean {
    return this.getFieldErrors(field).length > 0;
  }

  /**
   * Returns a map of field names (normalized to camelCase) to their first error message.
   */
  getFieldErrorsMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const e of this.errors) {
      if (e.field && typeof e.field === 'string') {
        const clean = e.field.replace(/^(\$\.|\/)/, '').trim();
        const camel = clean.charAt(0).toLowerCase() + clean.slice(1);
        if (!map[camel]) {
          map[camel] = e.message;
        }
      }
    }
    return map;
  }
}

/**
 * Detects whether an error message leaks raw database or ORM exception strings.
 */
function isDatabaseOrOrmLeak(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('an error occurred while saving the entity changes') ||
    lower.includes('see the inner exception for details') ||
    lower.includes('microsoft.entityframeworkcore') ||
    lower.includes('npgsql.postgresexception') ||
    lower.includes('postgresexception') ||
    lower.includes('duplicate key value violates unique constraint') ||
    lower.includes('violates foreign key constraint') ||
    lower.includes('violates not-null constraint') ||
    lower.includes('value too long for type character varying') ||
    /at\s+(microsoft\.entityframeworkcore|npgsql|system\.data)/i.test(message) ||
    /exception\s+while\s+executing\s+database\s+command/i.test(message)
  );
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

  // Extract traceId from response data (rawData.traceId) or response headers (x-trace-id, traceparent)
  let traceId: string | undefined = undefined;
  if (rawData && typeof rawData === 'object') {
    const rawTrace = rawData.traceId ?? rawData.TraceId;
    if (typeof rawTrace === 'string' && rawTrace.trim().length > 0) {
      traceId = rawTrace.trim();
    }
  }

  if (!traceId && axiosErr?.response?.headers) {
    const headers = axiosErr.response.headers;
    if (typeof headers.get === 'function') {
      const hTrace = headers.get('x-trace-id') || headers.get('traceparent');
      if (typeof hTrace === 'string' && hTrace.trim().length > 0) {
        traceId = hTrace.trim();
      }
    }
    if (!traceId && typeof headers === 'object') {
      const hTrace =
        headers['x-trace-id'] ||
        headers['traceparent'] ||
        headers['X-Trace-Id'] ||
        headers['Traceparent'] ||
        headers['x-correlation-id'] ||
        headers['X-Correlation-Id'];
      if (typeof hTrace === 'string' && hTrace.trim().length > 0) {
        traceId = hTrace.trim();
      }
    }
  }

  // Extract errorCode from response data (rawData.errorCode || rawData.code || rawData.title)
  let errorCode: string | undefined = undefined;
  if (rawData && typeof rawData === 'object') {
    const rawCode =
      rawData.errorCode ??
      rawData.ErrorCode ??
      rawData.code ??
      rawData.Code ??
      rawData.title ??
      rawData.Title;
    if (typeof rawCode === 'string' && rawCode.trim().length > 0) {
      errorCode = rawCode.trim();
    }
  }

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
    return new ApiError(msg, 0, [], 'NETWORK_ERROR', traceId);
  }

  const fieldErrors: ApiFieldError[] = [];
  let extractedMessage: string | null = null;

  if (rawData && typeof rawData === 'object') {
    // 1. Parse errors collection
    if (Array.isArray(rawData.errors)) {
      for (const item of rawData.errors) {
        if (typeof item === 'string') {
          fieldErrors.push({ field: null, code: errorCode || 'VALIDATION_ERROR', message: item });
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

  let finalMessage = extractedMessage || axiosErr?.message || defaultFallback;

  // Client-side safety net: inspect derived message for raw ORM or database exception leakage
  if (isDatabaseOrOrmLeak(finalMessage)) {
    finalMessage = `A database error occurred while saving changes. Please contact support with reference ID: ${traceId || 'N/A'}`;
    errorCode = errorCode || 'DATABASE_ERROR';
    for (const fe of fieldErrors) {
      if (isDatabaseOrOrmLeak(fe.message)) {
        fe.message = finalMessage;
        fe.code = errorCode;
      }
    }
  }

  return new ApiError(finalMessage, status, fieldErrors, errorCode, traceId);
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
