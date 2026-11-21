import type { EhrOptionDescriptor } from '@shared/safe';
import type { SelectOption } from '../components/ui/Select';

/** PhilHealth lib_sex specifies Male and Female only; broader options live in Gender Identity. */
export const PHILHEALTH_SEX_LABELS = ['Male', 'Female'] as const;

export const PHILHEALTH_SEX_SELECT_OPTIONS: SelectOption[] = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

/**
 * Filters an EHR option set to PhilHealth-specified biological sex values (`Male` / `Female`).
 * Guarantees stale caches or un-updated servers never surface legacy `Intersex` / `Unknown` Sex pills.
 */
export function filterPhilHealthSexLabels(options?: EhrOptionDescriptor[] | null): string[] {
  if (!options || options.length === 0) return [...PHILHEALTH_SEX_LABELS];
  const filtered = options
    .filter((o) => {
      const code = (o.code ?? '').trim().toUpperCase();
      const label = (o.label ?? '').trim().toLowerCase();
      return code === 'MALE' || code === 'FEMALE' || label === 'male' || label === 'female';
    })
    .map((o) => o.label);
  return filtered.length > 0 ? filtered : [...PHILHEALTH_SEX_LABELS];
}

/** Filters an EHR option set into `SelectOption[]` restricted to `Male` and `Female`. */
export function filterPhilHealthSexSelectOptions(options?: EhrOptionDescriptor[] | null): SelectOption[] {
  return filterPhilHealthSexLabels(options).map((label) => ({ value: label, label }));
}

/** Normalizes CSV or free-text biological sex input to PhilHealth `Male` / `Female`, or `null` if invalid. */
export function parsePhilHealthSexInput(raw?: string | null): 'Male' | 'Female' | null {
  const clean = (raw ?? '').trim().toLowerCase();
  if (clean === 'm' || clean === 'male') return 'Male';
  if (clean === 'f' || clean === 'female') return 'Female';
  return null;
}
