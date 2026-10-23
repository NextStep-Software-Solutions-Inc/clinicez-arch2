/**
 * apps/clinic-app/utils/yakapEnlistment.ts
 *
 * PhilHealth Konsulta (YAKAP) Statutory Enlistment Lifecycle Helpers.
 * Implements strict no-auto-renewal guards, active period resolution,
 * and immutable renewal construction.
 */

export type YakapEnlistmentStatus = 'Active' | 'Expired' | 'Transferred';

export type YakapEnlistmentSource =
  | 'PhilHealthMasterlist'
  | 'ClinicEnlistment'
  | 'SelfReported';

export interface YakapEnlistmentEntry {
  enlisted_at: string; // YYYY-MM-DD
  valid_until: string; // YYYY-MM-DD
  effective_year: string; // YYYY
  status: YakapEnlistmentStatus;
  source: YakapEnlistmentSource;
  case_no?: string | null;
  enlistment_no?: string | null;
  profiling_trans_no?: string | null;
}

export interface AnnualRenewalOptions {
  effectiveYear: string | number;
  enlistedAt?: string; // defaults to YYYY-01-01 or today
  validUntil?: string; // defaults to YYYY-12-31
  source?: YakapEnlistmentSource;
}

/**
 * Normalizes any Date or date string to strict YYYY-MM-DD for timezone-safe lexicographical comparison.
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
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {
    // fallback to slice
  }
  return str.slice(0, 10);
}

/**
 * Safely extracts the array of YAKAP enlistments from customFields.
 */
export function getYakapEnlistments(
  customFields?: Record<string, any> | null
): YakapEnlistmentEntry[] {
  if (!customFields) return [];
  const raw = customFields['yakap_enlistments'];
  if (!raw) return [];

  const normalizeEntry = (item: any): YakapEnlistmentEntry | null => {
    if (item != null && typeof item === 'object' && typeof item.effective_year !== 'undefined') {
      return {
        enlisted_at: toIsoDateString(item.enlisted_at),
        valid_until: toIsoDateString(item.valid_until),
        effective_year: String(item.effective_year).trim(),
        status: (item.status === 'Active' || item.status === 'Transferred' || item.status === 'Expired')
          ? item.status
          : 'Expired',
        source: item.source || 'ClinicEnlistment',
        case_no: item.case_no ?? null,
        enlistment_no: item.enlistment_no ?? null,
        profiling_trans_no: item.profiling_trans_no ?? null,
      };
    }
    return null;
  };

  if (Array.isArray(raw)) {
    return raw.map(normalizeEntry).filter((item): item is YakapEnlistmentEntry => item !== null);
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeEntry).filter((item): item is YakapEnlistmentEntry => item !== null);
      }
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Resolves the active YAKAP enlistment covering the given reference date.
 * If no referenceDate is passed, defaults to current calendar date.
 * Returns null if no active enlistment covers the date, or if status is 'Expired'/'Transferred'.
 */
export function getActiveYakapEnlistment(
  customFieldsOrList?: Record<string, any> | YakapEnlistmentEntry[] | null,
  referenceDate?: string | Date
): YakapEnlistmentEntry | null {
  const list = Array.isArray(customFieldsOrList)
    ? customFieldsOrList
    : getYakapEnlistments(customFieldsOrList);

  if (list.length === 0) return null;

  const refIso = toIsoDateString(referenceDate);

  // Look for active enlistment covering refIso
  for (const entry of list) {
    if (entry.status !== 'Active') continue;
    const startIso = toIsoDateString(entry.enlisted_at);
    const endIso = toIsoDateString(entry.valid_until);

    if (refIso >= startIso && refIso <= endIso) {
      return entry;
    }
  }

  return null;
}

/**
 * Checks whether the patient has an active enlistment for a specified benefit year or reference date.
 */
export function isYakapEnlistmentActive(
  customFieldsOrList?: Record<string, any> | YakapEnlistmentEntry[] | null,
  yearOrDate?: string | number | Date
): boolean {
  const list = Array.isArray(customFieldsOrList)
    ? customFieldsOrList
    : getYakapEnlistments(customFieldsOrList);

  if (list.length === 0) return false;

  // Case 1: 4-digit Year string or number (e.g. 2026 or "2026")
  if (
    typeof yearOrDate === 'number' ||
    (typeof yearOrDate === 'string' && /^\d{4}$/.test(yearOrDate.trim()))
  ) {
    const yearStr = String(yearOrDate).trim();
    return list.some(
      (e) => String(e.effective_year).trim() === yearStr && e.status === 'Active'
    );
  }

  // Case 2: Specific Date or default today
  return getActiveYakapEnlistment(list, yearOrDate as string | Date | undefined) !== null;
}

/**
 * Determines whether a patient requires an annual renewal for the target year (defaults to current year).
 */
export function needsYakapRenewal(
  customFieldsOrList?: Record<string, any> | YakapEnlistmentEntry[] | null,
  targetYearOrDate?: string | number | Date
): boolean {
  if (
    typeof targetYearOrDate === 'number' ||
    (typeof targetYearOrDate === 'string' && /^\d{4}$/.test(targetYearOrDate.trim()))
  ) {
    return !isYakapEnlistmentActive(customFieldsOrList, targetYearOrDate);
  }

  if (targetYearOrDate instanceof Date || (typeof targetYearOrDate === 'string' && targetYearOrDate.includes('-'))) {
    return getActiveYakapEnlistment(customFieldsOrList, targetYearOrDate) === null;
  }

  const currentYear = new Date().getFullYear();
  return !isYakapEnlistmentActive(customFieldsOrList, currentYear);
}

/**
 * Pure builder creating a new YakapEnlistmentEntry object.
 * Does not mutate any external state.
 */
export function createAnnualRenewal(
  optionsOrYear: AnnualRenewalOptions | string | number,
  sourceOverride?: YakapEnlistmentSource
): YakapEnlistmentEntry {
  const normalizedOpts: AnnualRenewalOptions =
    typeof optionsOrYear === 'object' && optionsOrYear !== null
      ? optionsOrYear
      : { effectiveYear: optionsOrYear, source: sourceOverride };

  const yearStr = String(normalizedOpts.effectiveYear).trim();
  const defaultValidUntil = `${yearStr}-12-31`;

  // Default enlisted_at: if renewing current year, default to today; if future year, default to YYYY-01-01
  const todayIso = toIsoDateString();
  const defaultEnlistedAt = todayIso.startsWith(yearStr) ? todayIso : `${yearStr}-01-01`;

  return {
    enlisted_at: normalizedOpts.enlistedAt
      ? toIsoDateString(normalizedOpts.enlistedAt)
      : defaultEnlistedAt,
    valid_until: normalizedOpts.validUntil
      ? toIsoDateString(normalizedOpts.validUntil)
      : defaultValidUntil,
    effective_year: yearStr,
    status: 'Active',
    source: normalizedOpts.source || 'ClinicEnlistment',
    case_no: null,
    enlistment_no: null,
    profiling_trans_no: null,
  };
}

/**
 * Records an annual renewal onto the customFields dictionary.
 * Preserves all prior historical benefit periods, marks any existing active entry for the same year as Expired,
 * appends the new entry, and sorts the array chronologically by effective_year.
 * Returns the updated YakapEnlistmentEntry[] array.
 */
export function recordAnnualRenewal(
  customFields: Record<string, any>,
  optionsOrYear: AnnualRenewalOptions | string | number,
  sourceOverride?: YakapEnlistmentSource
): YakapEnlistmentEntry[] {
  const existingList = getYakapEnlistments(customFields);
  const newEntry = createAnnualRenewal(optionsOrYear, sourceOverride);
  const targetYear = newEntry.effective_year;

  // Clone entries, marking prior active entries for the same year as Expired
  const updatedList = existingList.map((entry) => {
    if (String(entry.effective_year).trim() === targetYear && entry.status === 'Active') {
      return { ...entry, status: 'Expired' as YakapEnlistmentStatus };
    }
    return { ...entry };
  });

  updatedList.push(newEntry);

  // Sort chronologically by effective_year, then by enlisted_at
  updatedList.sort((a, b) => {
    const yearDiff = parseInt(a.effective_year, 10) - parseInt(b.effective_year, 10);
    if (yearDiff !== 0) return yearDiff;
    return a.enlisted_at.localeCompare(b.enlisted_at);
  });

  customFields['yakap_enlistments'] = updatedList;
  return updatedList;
}

/**
 * UI visual helper returning Badge props for a given enlistment status.
 */
export function formatYakapStatusBadge(status?: YakapEnlistmentStatus | null): {
  label: string;
  variant: 'success' | 'warning' | 'neutral' | 'emergency';
  icon: string;
} {
  switch (status) {
    case 'Active':
      return { label: 'Active Enlistment', variant: 'success', icon: 'checkCircle' };
    case 'Expired':
      return { label: 'Expired Enlistment', variant: 'warning', icon: 'clock' };
    case 'Transferred':
      return { label: 'Transferred Out', variant: 'neutral', icon: 'arrowRight' };
    default:
      return { label: 'Not Enlisted', variant: 'neutral', icon: 'info' };
  }
}

/**
 * UI display label for enlistment source.
 */
export function formatYakapSourceLabel(source?: YakapEnlistmentSource | null): string {
  switch (source) {
    case 'PhilHealthMasterlist':
      return 'PhilHealth Masterlist';
    case 'ClinicEnlistment':
      return 'Clinic Enlistment';
    case 'SelfReported':
      return 'Self-Reported (eGovPH / Member Portal)';
    default:
      return 'Clinic Enlistment';
  }
}
