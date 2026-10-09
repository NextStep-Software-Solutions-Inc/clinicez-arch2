/**
 * Sharing scopes: the eight categories of data a patient can release to a facility.
 * `key` is the camelCase wire name used by patient-api (`SharingScopes`).
 */

export const SHARING_SCOPE_KEYS = [
  'demographics',
  'allergies',
  'medications',
  'conditions',
  'immunizations',
  'labResults',
  'prescriptions',
  'vitals',
] as const;

export type SharingScope = (typeof SHARING_SCOPE_KEYS)[number];

export type ScopeSelection = Record<SharingScope, boolean>;

export interface SharingScopeInfo {
  key: SharingScope;
  label: string;
  description: string;
  /** Pre-selected when the patient opens the share screen. */
  defaultEnabled: boolean;
}

export const SHARING_SCOPES: readonly SharingScopeInfo[] = [
  {
    key: 'demographics',
    label: 'Personal details',
    description: 'Name, date of birth, sex, contact details and address, used to match you to a chart.',
    defaultEnabled: true,
  },
  {
    key: 'allergies',
    label: 'Allergies',
    description: 'Known allergens, reactions and severity, so staff can avoid harmful treatments.',
    defaultEnabled: true,
  },
  {
    key: 'medications',
    label: 'Current medications',
    description: 'Medicines you take, with dosage and frequency, to prevent drug interactions.',
    defaultEnabled: true,
  },
  {
    key: 'conditions',
    label: 'Medical conditions',
    description: 'Chronic conditions and past illnesses that affect your care.',
    defaultEnabled: true,
  },
  {
    key: 'immunizations',
    label: 'Immunizations',
    description: 'Vaccines you have received and their dates.',
    defaultEnabled: false,
  },
  {
    key: 'labResults',
    label: 'Lab results',
    description: 'Laboratory results and findings from past tests.',
    defaultEnabled: false,
  },
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    description: 'Prescriptions issued to you and their dispensing history.',
    defaultEnabled: false,
  },
  {
    key: 'vitals',
    label: 'Vital signs',
    description: 'Blood pressure, heart rate, temperature, weight and other measurements.',
    defaultEnabled: false,
  },
];

export function defaultScopeSelection(): ScopeSelection {
  return Object.fromEntries(
    SHARING_SCOPES.map((scope) => [scope.key, scope.defaultEnabled]),
  ) as ScopeSelection;
}

/** Selected scopes as the API array, in canonical order. */
export function toApiScopes(selection: ScopeSelection): SharingScope[] {
  return SHARING_SCOPE_KEYS.filter((key) => selection[key]);
}

export function isSharingScope(value: string): value is SharingScope {
  return (SHARING_SCOPE_KEYS as readonly string[]).includes(value);
}

/** Builds a selection from an API scope list; unknown names are ignored. */
export function fromApiScopes(scopes: readonly string[]): ScopeSelection {
  const selection = Object.fromEntries(SHARING_SCOPE_KEYS.map((key) => [key, false])) as ScopeSelection;
  for (const scope of scopes) {
    if (isSharingScope(scope)) selection[scope] = true;
  }
  return selection;
}

export function scopeLabel(scope: string): string {
  return SHARING_SCOPES.find((info) => info.key === scope)?.label ?? scope;
}

export function countSelectedScopes(selection: ScopeSelection): number {
  return toApiScopes(selection).length;
}
