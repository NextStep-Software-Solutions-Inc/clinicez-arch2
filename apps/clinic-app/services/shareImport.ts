import type { ShareImportState, ShareImportStatusDto } from './clinicService';
import { humanizeEnum, type StatusTone } from './labResultReview';

/**
 * Pure logic for the "scan patient QR / paste share token" flow.
 * Free of React / React Native imports so it can be unit tested with `bun test`.
 */

export const DEFAULT_SHARE_PURPOSE = 'Consultation';
export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 60_000;

const MIN_TOKEN_LENGTH = 8;
const MAX_TOKEN_LENGTH = 1024;
const TOKEN_QUERY_KEYS = ['shareToken', 'sharetoken', 'token', 't'];

function isPlausibleToken(value: string): boolean {
  // Visible ASCII only: keyboard-wedge scanners can append Enter/Tab, and pastes pick up stray whitespace.
  if (value.length < MIN_TOKEN_LENGTH || value.length > MAX_TOKEN_LENGTH || !/^[\x21-\x7e]+$/.test(value)) {
    return false;
  }
  // Tokens without dots should not match short one-time codes or ClinicEZ IDs
  if (!value.includes('.')) {
    const clean = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (clean.length === 8 && /^[0-9A-Z]{8}$/.test(clean)) {
      return false;
    }
    if ((clean.length === 10 || clean.length === 8) && clean.startsWith('CE')) {
      return false;
    }
  }
  return true;
}

function fromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const key of ['shareToken', 'token', 't']) {
        const value = record[key];
        if (typeof value === 'string') return value;
      }
    }
  } catch {
    // not JSON, fall through
  }
  return null;
}

function fromUrl(text: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    for (const key of TOKEN_QUERY_KEYS) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) return decodeURIComponent(last);
    // Custom schemes such as clinicez://<token> keep the token in the host.
    return url.host || null;
  } catch {
    return null;
  }
}

/**
 * Extracts the share token from whatever a scanner or paste produced: the bare token, a URL carrying it
 * (query `token` / `shareToken` or last path segment) or a small JSON payload. Returns null when nothing
 * that looks like a token is found.
 */
export function normalizeShareToken(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = trimmed.startsWith('{') ? fromJson(trimmed) : (fromUrl(trimmed) ?? trimmed);
  if (candidate === null) return null;
  const token = candidate.trim();
  return isPlausibleToken(token) ? token : null;
}

/**
 * Normalizes a patient's ClinicEZ ID (e.g. "CE-ABCD-1234", "ce-abcd-1234", "abcd-1234", "ceabcd1234")
 * to the canonical format "CE-XXXX-XXXX".
 */
export function normalizeClinicEzId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  const clean = trimmed.replace(/[^0-9A-Z]/g, '');
  const withoutPrefix = clean.startsWith('CE') ? clean.slice(2) : clean;

  if (withoutPrefix.length === 8) {
    return `CE-${withoutPrefix.slice(0, 4)}-${withoutPrefix.slice(4, 8)}`;
  }
  return null;
}

/**
 * Normalizes an 8-character one-time share code (e.g. "ABCD-EFGH", "abcd-efgh", "abcdefgh", "abcd efgh")
 * to the canonical format "XXXX-XXXX".
 */
export function normalizeShareCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  const clean = trimmed.replace(/[^0-9A-Z]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }
  return null;
}

export interface SmartShareInputResult {
  clinicEzId?: string;
  code?: string;
  token?: string;
}

/**
 * Smartly parses clipboard or pasted share input:
 * - Labeled pairs: "ClinicEZ ID: CE-ABCD-1234 | Code: WXYZ-5678"
 * - Delimited pairs: "CE-ABCD-1234, WXYZ-5678", "CE-ABCD-1234 / WXYZ-5678", "CE-ABCD-1234:WXYZ-5678"
 * - Bare ClinicEZ ID: "CE-ABCD-1234"
 * - Bare Share Code: "WXYZ-5678" or "CE42-7890"
 * - Full QR token, URL, or JSON: "https://... or tok_..."
 */
export function parseSmartShareInput(input: string | null | undefined): SmartShareInputResult | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Check for labeled format e.g. "ClinicEZ ID: CE-ABCD-1234 | Code: WXYZ-5678"
  // Using \b word boundaries prevents false positives on words like "Valid:" or "Fluid:"
  const idMatch = trimmed.match(/\b(?:clinicez\s*id|clinicez|patient\s*id|id)\b\s*[:=]\s*([a-zA-Z0-9-]+)/i);
  const codeMatch = trimmed.match(/\b(?:one-time\s*code|share\s*code|code)\b\s*[:=]\s*([a-zA-Z0-9-]+)/i);

  if (idMatch || codeMatch) {
    const parsedId = idMatch ? normalizeClinicEzId(idMatch[1]) : null;
    const parsedCode = codeMatch ? normalizeShareCode(codeMatch[1]) : null;
    if (parsedId || parsedCode) {
      return {
        ...(parsedId ? { clinicEzId: parsedId } : {}),
        ...(parsedCode ? { code: parsedCode } : {}),
      };
    }
  }

  // 2. Check for delimiter-separated values: e.g. "CE-ABCD-1234 | WXYZ-5678", "CE-ABCD-1234, WXYZ-5678", "CE-ABCD-1234:WXYZ-5678", "CE-ABCD-1234 / WXYZ-5678"
  const parts = trimmed.split(/[\s|,\n\r;/:]+|\s+-\s+/).filter(Boolean);
  if (parts.length >= 2) {
    // Priority 1: A token explicitly starting with CE (10 chars, e.g. CE-ABCD-1234)
    const idToken = parts.find((p) => {
      const clean = p.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      return clean.startsWith('CE') && clean.length === 10;
    });

    const codeToken = idToken
      ? parts.find((p) => p !== idToken && normalizeShareCode(p) !== null)
      : undefined;

    if (idToken && codeToken) {
      const parsedId = normalizeClinicEzId(idToken);
      const parsedCode = normalizeShareCode(codeToken);
      if (parsedId && parsedCode) {
        return { clinicEzId: parsedId, code: parsedCode };
      }
    }

    // Priority 2: If neither has explicit CE, check if the first is ID and second is code, or vice versa
    if (parts.length === 2) {
      const idFirst = normalizeClinicEzId(parts[0]);
      const codeSecond = normalizeShareCode(parts[1]);
      if (idFirst && codeSecond) {
        return { clinicEzId: idFirst, code: codeSecond };
      }

      const codeFirst = normalizeShareCode(parts[0]);
      const idSecond = normalizeClinicEzId(parts[1]);
      if (codeFirst && idSecond) {
        return { clinicEzId: idSecond, code: codeFirst };
      }
    }
  }

  // 3. Check if the entire string is a ClinicEZ ID (has CE prefix and 10 alphanumeric characters)
  const directId = normalizeClinicEzId(trimmed);
  const cleanTrimmed = trimmed.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (directId && !trimmed.includes('.') && cleanTrimmed.startsWith('CE') && cleanTrimmed.length === 10) {
    return { clinicEzId: directId };
  }

  // 4. Check if the entire string is an 8-character Share Code (e.g. "WXYZ-5678" or "CE42-7890")
  const directCode = normalizeShareCode(trimmed);
  if (directCode && !trimmed.includes('.')) {
    return { code: directCode };
  }

  // If it's an 8-character string without CE prefix that wasn't matched as a code:
  if (directId && !trimmed.includes('.')) {
    return { clinicEzId: directId };
  }

  // 5. Check if it's a Share Token
  const token = normalizeShareToken(trimmed);
  if (token) {
    return { token };
  }

  return null;
}

export function isTerminalShareStatus(status: ShareImportState | string): boolean {
  return status === 'Imported' || status === 'Denied' || status === 'Failed';
}

export type PollDecision = 'continue' | 'stop' | 'timeout';

/** Decide what the poller does after receiving `status` once `elapsedMs` have passed since polling began. */
export function decidePoll(status: ShareImportState | string | null, elapsedMs: number): PollDecision {
  if (status !== null && isTerminalShareStatus(status)) return 'stop';
  if (elapsedMs >= POLL_TIMEOUT_MS) return 'timeout';
  return 'continue';
}

const SCOPE_LABELS: Record<string, string> = {
  Demographics: 'Demographics',
  Allergies: 'Allergies',
  Medications: 'Medications',
  Conditions: 'Conditions',
  Immunizations: 'Immunizations',
  LabResults: 'Lab results',
  Prescriptions: 'Prescriptions',
  Vitals: 'Vitals',
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? humanizeEnum(scope);
}

/** Labels for the granted scopes, de-duplicated; the API may serialize a flags value as "A, B". */
export function scopeLabels(scopes: ReadonlyArray<string> | null | undefined): string[] {
  const names = (scopes ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(names)).map(scopeLabel);
}

export interface ShareStatusDisplay {
  title: string;
  tone: StatusTone;
  /** Reason shown for Denied / Failed, with a fallback when the server gave none. */
  detail: string | null;
}

export function describeShareStatus(
  dto: Pick<ShareImportStatusDto, 'status' | 'denialReason'>,
): ShareStatusDisplay {
  const reason = dto.denialReason?.trim() || null;
  switch (dto.status) {
    case 'Imported':
      return { title: 'Patient imported', tone: 'success', detail: null };
    case 'Denied':
      return { title: 'Access denied', tone: 'danger', detail: reason ?? 'The patient did not grant access for this request.' };
    case 'Failed':
      return { title: 'Import failed', tone: 'danger', detail: reason ?? 'The record could not be imported. Try scanning again.' };
    case 'Pending':
    default:
      return { title: 'Waiting for the patient record', tone: 'info', detail: null };
  }
}

export type RedeemMode = 'token' | 'code';

export interface RedeemInput {
  mode?: RedeemMode;
  token?: string;
  clinicEzId?: string;
  code?: string;
  purpose: string;
  addToQueue: boolean;
  chiefComplaint: string;
}

export type RedeemRequestResult =
  | {
      ok: true;
      request: {
        shareToken?: string;
        clinicEzId?: string;
        code?: string;
        purpose: string;
        addToQueue: boolean;
        chiefComplaint?: string;
      };
    }
  | { ok: false; error: string };

/** Validates form input and builds the redeem request body. The chief complaint only applies when queuing. */
export function buildRedeemRequest(input: RedeemInput): RedeemRequestResult {
  const isCodeMode =
    input.mode === 'code' || (!input.mode && !input.token && (Boolean(input.clinicEzId) || Boolean(input.code)));
  const purpose = input.purpose.trim() || DEFAULT_SHARE_PURPOSE;
  const complaint = input.chiefComplaint.trim();

  if (isCodeMode) {
    const clinicEzId = normalizeClinicEzId(input.clinicEzId);
    const code = normalizeShareCode(input.code);

    if (!clinicEzId && !code) {
      return { ok: false, error: "Enter the patient's ClinicEZ ID and one-time code." };
    }
    if (!clinicEzId) {
      return { ok: false, error: 'Enter a valid ClinicEZ ID (e.g. CE-ABCD-1234).' };
    }
    if (!code) {
      return { ok: false, error: 'Enter a valid 8-character one-time code (e.g. ABCD-EFGH).' };
    }

    return {
      ok: true,
      request: {
        clinicEzId,
        code,
        purpose,
        addToQueue: input.addToQueue,
        ...(input.addToQueue && complaint ? { chiefComplaint: complaint } : {}),
      },
    };
  }

  const shareToken = normalizeShareToken(input.token);
  if (!shareToken) {
    if (normalizeShareCode(input.token) || normalizeClinicEzId(input.token)) {
      return { ok: false, error: 'This looks like a one-time code or ClinicEZ ID. Switch to One-Time Code mode to enter it.' };
    }
    return { ok: false, error: 'Scan the patient QR code or paste a valid share token.' };
  }

  return {
    ok: true,
    request: {
      shareToken,
      purpose,
      addToQueue: input.addToQueue,
      ...(input.addToQueue && complaint ? { chiefComplaint: complaint } : {}),
    },
  };
}
