import type { ClinicSettingsRecord } from '../services/clinicService';

export type PhilHealthSettingsUrlSlice = Pick<
  ClinicSettingsRecord,
  'philHealthBaseUrl' | 'branchPhilHealthBaseUrl'
> | null | undefined;

export interface PhilHealthServerErrorLike {
  message?: string;
  status?: number;
  errorCode?: string;
}

const GENERIC_AXIOS_HTTP_REGEX = /^Request failed with status code \d+$/i;

export function resolveEffectivePhilHealthConnectionUrl(settings: PhilHealthSettingsUrlSlice): string {
  return settings?.philHealthBaseUrl?.trim() || settings?.branchPhilHealthBaseUrl?.trim() || '';
}

/**
 * Returns true when we have a real loaded settings record (containing URL metadata fields)
 * and BOTH clinic override and branch baseline Connection URLs are missing.
 */
export function isMissingPhilHealthConnectionUrlKnown(settings: PhilHealthSettingsUrlSlice): boolean {
  if (!settings || typeof settings !== 'object') {
    return false;
  }
  const hasUrlFields = 'philHealthBaseUrl' in settings || 'branchPhilHealthBaseUrl' in settings;
  if (!hasUrlFields) {
    return false;
  }
  return resolveEffectivePhilHealthConnectionUrl(settings).length === 0;
}

export const MISSING_CONNECTION_URL_MESSAGE =
  'PhilHealth Connection URL is not configured for this clinic. Go to Clinic Settings -> PhilHealth & YAKAP (or Portal Branch Settings) and set a valid Connection URL before contacting the PhilHealth server.';

export function formatPhilHealthServerError(
  err: PhilHealthServerErrorLike | null | undefined,
  settings: PhilHealthSettingsUrlSlice,
  fallbackMessage: string
): string {
  const code = (err?.errorCode || '').trim().toUpperCase();
  const rawMessage = (err?.message || '').trim();

  if (
    code === 'PHILHEALTH_CONNECTION_URL_MISSING' ||
    code === 'PHILHEALTH_CONNECTION_URL_INVALID' ||
    code === 'PHILHEALTH_ENDPOINT_NOT_FOUND' ||
    code === 'PHILHEALTH_AUTH_FAILED' ||
    code === 'PHILHEALTH_SERVER_UNREACHABLE'
  ) {
    return rawMessage || MISSING_CONNECTION_URL_MESSAGE;
  }

  if (err?.status === 404 && (!rawMessage || GENERIC_AXIOS_HTTP_REGEX.test(rawMessage))) {
    if (isMissingPhilHealthConnectionUrlKnown(settings)) {
      return MISSING_CONNECTION_URL_MESSAGE;
    }
    return 'PhilHealth server endpoint returned 404 (Not Found). Verify the PhilHealth Connection URL in Settings -> PhilHealth & YAKAP and ensure YAKAP 2.0 endpoints are available on your clinic server.';
  }

  if (rawMessage && !GENERIC_AXIOS_HTTP_REGEX.test(rawMessage)) {
    return rawMessage;
  }

  if (isMissingPhilHealthConnectionUrlKnown(settings)) {
    return MISSING_CONNECTION_URL_MESSAGE;
  }

  return fallbackMessage;
}
