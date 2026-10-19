export interface ParsedReceptionQr {
  joinCode: string;
  clinicId?: string;
  facilitySlug?: string;
  tenantSlug?: string;
}

/**
 * Parses raw barcode content from physical ClinicEZ reception placards.
 * Supports:
 *  - Raw 6-character code: "VIP888"
 *  - Web URL: "https://portal.clinicez.com/join/VIP888"
 *  - Deep URL with params: "https://portal.clinicez.com/join/tenant-1/cdo-uhc?code=VIP888"
 *  - Custom App Scheme: "clinicez://join/VIP888" or "clinicez://clinics/{id}/unlock?code=VIP888"
 */
export function parseReceptionQrPayload(rawPayload: string): ParsedReceptionQr | null {
  if (!rawPayload || typeof rawPayload !== 'string') return null;
  const trimmed = rawPayload.trim();

  // Pattern 1: Pure 6-character alphanumeric code
  if (/^[A-Za-z0-9]{6}$/.test(trimmed)) {
    return { joinCode: trimmed.toUpperCase() };
  }

  // Pattern 2: Custom app URI scheme clinicez://
  const customSchemeMatch = trimmed.match(
    /^clinicez:\/\/(?:join\/(?:[A-Za-z0-9_-]+\/)*|join\?(?:.*&)?(?:code|joinCode)=|clinics\/(?:[^/]+)\/unlock\?(?:.*&)?(?:code|joinCode)=)([A-Za-z0-9]{6})/i,
  );
  if (customSchemeMatch?.[1]) {
    return { joinCode: customSchemeMatch[1].toUpperCase() };
  }

  // Pattern 3: HTTP/HTTPS URL
  try {
    const url = new URL(trimmed);

    // Check query params: ?code=XYZ or ?joinCode=XYZ
    const codeParam = url.searchParams.get('code') || url.searchParams.get('joinCode');
    if (codeParam && /^[A-Za-z0-9]{6}$/.test(codeParam.trim())) {
      const clinicId = url.searchParams.get('clinicId') ?? undefined;
      return { joinCode: codeParam.trim().toUpperCase(), clinicId };
    }

    // Check path segments: /join/:code or /join/:tenant/:code or /join/:tenant/:facility/:code
    const segments = url.pathname.split('/').filter(Boolean);
    const joinIndex = segments.findIndex((s) => s.toLowerCase() === 'join');
    if (joinIndex !== -1) {
      for (let i = joinIndex + 1; i < segments.length; i++) {
        const candidate = segments[i].trim();
        if (/^[A-Za-z0-9]{6}$/.test(candidate)) {
          return { joinCode: candidate.toUpperCase() };
        }
      }
    }
  } catch {
    // Malformed URLs
  }

  return null;
}

/**
 * Convenience helper that extracts just the 6-character uppercase join code from any valid QR payload.
 */
export function parseReceptionQr(rawPayload: string): string | null {
  const parsed = parseReceptionQrPayload(rawPayload);
  return parsed ? parsed.joinCode : null;
}

