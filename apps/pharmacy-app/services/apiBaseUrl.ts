import { ensureApiPrefix } from '@shared/safe';

const resolveDefaultPharmacyBaseUrl = (fallbackPort: number = 5245): string => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol || 'http:';

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.lvh.me') ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return `${protocol}//${hostname}:${fallbackPort}`;
    }

    // Default to same-origin for ingress reverse-proxy routing
    return `${protocol}//${hostname}`;
  }
  return `http://localhost:${fallbackPort}`;
};

const BASE_URL = (
  process.env.EXPO_PUBLIC_PHARMACY_API_URL ??
  resolveDefaultPharmacyBaseUrl(5245)
).replace(/\/+$/, '');

export const PHARMACY_API_BASE_URL = ensureApiPrefix(BASE_URL);
