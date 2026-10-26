import { publicRoutes } from '@shared/safe';

export interface ParsedReceptionQr {
  joinCode: string;
  clinicId?: string;
  facilitySlug?: string;
  tenantSlug?: string;
}

/**
 * Parses raw barcode content from physical ClinicEZ reception placards and digital join links.
 * Drops URL path-segment scanning and 6-character restrictions.
 * Validates join codes strictly via publicRoutes.isValidJoinCode().
 * Supports:
 *  - Raw join code: "VIP888", "APEX2026", "B4C7-JOINNOW"
 *  - App deep links with query param: "clinicez://join?code=VIP888" or "clinicez://clinics/{id}/unlock?code=VIP888"
 *  - Web URL with query param: "https://portal.clinicez.com/join?code=VIP888" or "...?joinCode=VIP888"
 */
export function parseReceptionQrPayload(rawPayload: string): ParsedReceptionQr | null {
  if (!rawPayload || typeof rawPayload !== 'string') return null;
  const trimmed = rawPayload.trim();
  if (!trimmed) return null;

  // Pattern 1: Raw valid join code (e.g. VIP888, APEX2026, B4C7-JOINNOW)
  if (publicRoutes.isValidJoinCode(trimmed)) {
    return { joinCode: publicRoutes.normalizeJoinCode(trimmed) };
  }

  // Pattern 2: URL parsing (HTTP, HTTPS, or clinicez:// scheme)
  try {
    const url = new URL(trimmed);
    const protocol = url.protocol.toLowerCase();

    if (protocol === 'clinicez:' || protocol === 'http:' || protocol === 'https:') {
      const codeParam = url.searchParams.get('code') || url.searchParams.get('joinCode');
      if (codeParam && publicRoutes.isValidJoinCode(codeParam.trim())) {
        const normalizedCode = publicRoutes.normalizeJoinCode(codeParam.trim());

        // Extract clinicId from query or custom path pattern
        let clinicId = url.searchParams.get('clinicId') ?? undefined;
        if (!clinicId) {
          const fullPath = `${url.hostname}${url.pathname}`;
          const clinicMatch = fullPath.match(/clinics\/([^/]+)\/unlock/i);
          if (clinicMatch?.[1]) {
            clinicId = clinicMatch[1];
          }
        }

        // Extract tenantSlug and facilitySlug if present in path: /join/{tenantSlug}/{facilitySlug}
        let tenantSlug: string | undefined;
        let facilitySlug: string | undefined;
        const segments = url.pathname.split('/').filter(Boolean);
        const joinIndex = segments.findIndex((s) => s.toLowerCase() === 'join');
        if (joinIndex !== -1 && segments.length >= joinIndex + 3) {
          tenantSlug = segments[joinIndex + 1];
          facilitySlug = segments[joinIndex + 2];
        }

        return {
          joinCode: normalizedCode,
          clinicId,
          tenantSlug,
          facilitySlug,
        };
      }
    }
  } catch {
    // Malformed URLs
  }

  // Fallback regex for custom clinicez scheme if URL parsing fails
  const customSchemeMatch = trimmed.match(
    /^clinicez:\/\/(?:clinics\/([^/?#]+)\/unlock|join)?\?(?:.*&)?(?:code|joinCode)=([^&#\s]+)/i
  );
  if (customSchemeMatch) {
    const candidateCode = decodeURIComponent(customSchemeMatch[2].trim());
    if (publicRoutes.isValidJoinCode(candidateCode)) {
      return {
        joinCode: publicRoutes.normalizeJoinCode(candidateCode),
        clinicId: customSchemeMatch[1] ?? undefined,
      };
    }
  }

  return null;
}

/**
 * Convenience helper that extracts just the normalized uppercase join code from any valid QR payload.
 */
export function parseReceptionQr(rawPayload: string): string | null {
  const parsed = parseReceptionQrPayload(rawPayload);
  return parsed ? parsed.joinCode : null;
}
