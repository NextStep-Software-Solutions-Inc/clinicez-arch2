/** Locale date + time for an ISO timestamp from the API; "--" when missing or unparseable. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** True when the ISO timestamp is in the past relative to `nowMs`. Missing/invalid values are not expired. */
export function isPast(iso: string | null | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time < nowMs;
}
