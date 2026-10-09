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
  return value.length >= MIN_TOKEN_LENGTH && value.length <= MAX_TOKEN_LENGTH && /^[\x21-\x7e]+$/.test(value);
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

export interface RedeemInput {
  token: string;
  purpose: string;
  addToQueue: boolean;
  chiefComplaint: string;
}

export type RedeemRequestResult =
  | { ok: true; request: { shareToken: string; purpose: string; addToQueue: boolean; chiefComplaint?: string } }
  | { ok: false; error: string };

/** Validates form input and builds the redeem request body. The chief complaint only applies when queuing. */
export function buildRedeemRequest(input: RedeemInput): RedeemRequestResult {
  const shareToken = normalizeShareToken(input.token);
  if (!shareToken) {
    return { ok: false, error: 'Scan the patient QR code or paste a valid share token.' };
  }
  const purpose = input.purpose.trim() || DEFAULT_SHARE_PURPOSE;
  const complaint = input.chiefComplaint.trim();
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
