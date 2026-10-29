/** Machine-readable codes portal-api puts in `errors[0].code` of 402/403/409 responses. */
export const API_ERROR_CODES = {
  subscriptionInactive: "subscription_inactive",
  featureUnavailable: "feature_unavailable",
  limitReached: "limit_reached",
  allocationExceedsPool: "allocation_exceeds_pool",
  branchFacilityTypeTaken: "branch_facility_type_taken",
  ownerAlreadyHasWorkspace: "owner_already_has_workspace",
  targetAlreadyOwnsWorkspace: "target_already_owns_workspace",
  linkAlreadyExists: "link_already_exists",
  linkNotPending: "link_not_pending",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const KNOWN_CODES: readonly string[] = Object.values(API_ERROR_CODES);

const CODE_MESSAGES: Record<ApiErrorCode, string> = {
  subscription_inactive: "Your workspace subscription is not active. Renew it or pick a plan on the Billing page to continue.",
  feature_unavailable: "This feature is not included in your current plan. Upgrade your plan to use it.",
  limit_reached: "You have reached the limit of your current plan. Upgrade your plan or free up capacity first.",
  allocation_exceeds_pool: "These allocations add up to more than your plan's pool. Lower one of the values.",
  branch_facility_type_taken: "This branch already has a facility of that type. Choose another branch or facility type.",
  owner_already_has_workspace: "You already own a workspace.",
  target_already_owns_workspace: "That person already owns a workspace, so they cannot take ownership of another one.",
  link_already_exists: "These facilities already have a pending or active link.",
  link_not_pending: "This link request has already been answered.",
};

const UPGRADE_CODES: readonly ApiErrorCode[] = [
  API_ERROR_CODES.subscriptionInactive,
  API_ERROR_CODES.featureUnavailable,
  API_ERROR_CODES.limitReached,
];

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: { message?: string; errors?: { code?: string; message?: string }[] };
  };
  message?: string;
}

export interface ApiErrorInfo {
  message: string;
  status?: number;
  code?: ApiErrorCode;
  /** True when the failure is fixed by changing the plan (inactive subscription, missing feature, limit reached). */
  needsUpgrade: boolean;
}

/** Status, known error code and the best human message of an API failure. Safe to call with `catch (err: unknown)`. */
export function describeApiError(err: unknown, fallback: string): ApiErrorInfo {
  const e = err as ApiErrorShape | undefined;
  const status = e?.response?.status;
  const rawCode = e?.response?.data?.errors?.[0]?.code;
  const code = rawCode && KNOWN_CODES.includes(rawCode) ? (rawCode as ApiErrorCode) : undefined;
  const serverMessage = e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message;

  const message =
    serverMessage ||
    (code ? CODE_MESSAGES[code] : undefined) ||
    (status === 502 ? "The service could not be reached. Try again shortly." : undefined) ||
    e?.message ||
    fallback;

  return { message, status, code, needsUpgrade: code !== undefined && UPGRADE_CODES.includes(code) };
}

/** HTTP status of an API failure, if the server answered. */
export function apiErrorStatus(err: unknown): number | undefined {
  return describeApiError(err, "").status;
}

/** Known machine-readable code of an API failure, if any. */
export function apiErrorCode(err: unknown): ApiErrorCode | undefined {
  return describeApiError(err, "").code;
}

/**
 * Best-effort human message from an API failure (validation errors first, then the error message).
 * Typed without `any` so callers can use `catch (err: unknown)`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return describeApiError(err, fallback).message;
}
