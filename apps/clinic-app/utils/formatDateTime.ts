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
