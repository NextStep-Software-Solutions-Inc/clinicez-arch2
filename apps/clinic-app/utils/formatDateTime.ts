import {
  formatClinicDate,
  formatClinicTime,
  formatClinicDateTime,
} from '../services/clinicService';

export { formatClinicDate, formatClinicTime, formatClinicDateTime };

/**
 * Formats an ISO timestamp from the API using the clinic's configured timezone, date format, and time format;
 * returns "--" when missing or unparseable.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return formatClinicDateTime(date, { fallback: '--' });
}

/** True when the ISO timestamp is in the past relative to `nowMs`. Missing/invalid values are not expired. */
export function isPast(iso: string | null | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time < nowMs;
}

/**
 * Normalizes a Date or date string to a local YYYY-MM-DD calendar string.
 * When empty/null, defaults to today's local date.
 */
export function toIsoDateString(date?: string | Date | null): string {
  if (!date) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(date).trim();
  if (str.length >= 10 && str[4] === '-' && str[7] === '-') {
    return str.slice(0, 10);
  }
  try {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {
    // Fall back to today below
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
