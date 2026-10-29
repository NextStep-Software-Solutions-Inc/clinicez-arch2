import { getPortalApiUrl, resolveBaseDomain } from "./urls";

/**
 * Resolves the active base domain across environments without hardcoded domain fallbacks.
 */
export function getConsoleBaseDomain(hostname?: string): string {
  return resolveBaseDomain(hostname);
}

export const getFacilityBaseDomain = getConsoleBaseDomain;

/**
 * Resolves the patient-api base URL following the architecture contract:
 * 1. Explicit NEXT_PUBLIC_PATIENT_API_URL override if configured
 * 2. Domain-derived https://patient-api.<baseDomain>/api/v1 if running on a real domain
 * 3. Localhost development fallback http://localhost:5150/api/v1
 */
export function getPatientApiUrl(hostname?: string): string {
  if (process.env.NEXT_PUBLIC_PATIENT_API_URL) {
    const configured = process.env.NEXT_PUBLIC_PATIENT_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  const baseDomain = resolveBaseDomain(hostname);
  if (baseDomain) {
    return `https://patient-api.${baseDomain}/api/v1`;
  }
  return "http://localhost:5150/api/v1";
}

export { getPortalApiUrl, resolveBaseDomain };
