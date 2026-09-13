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
