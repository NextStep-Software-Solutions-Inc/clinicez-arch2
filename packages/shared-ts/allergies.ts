import type { EhrOptionDescriptor } from './options';

export type AllergyCategory = 'Medication' | 'Food' | 'Environmental' | 'Other' | string;

export type AllergySeverity = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening' | string;

export interface AllergyOptionMeta {
  code: string;
  label: string;
  category?: AllergyCategory;
  severity?: AllergySeverity;
  philHealthCode?: string | null;
}

// Purged static arrays: categories and severities are loaded dynamically via useEhrOptions('allergy_severity')

/**
 * Validates whether a severity string is a standard allergy severity.
 */
export function isStandardAllergySeverity(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const normalized = val.trim().toLowerCase();
  return ['mild', 'moderate', 'severe', 'lifethreatening', 'life threatening'].includes(normalized);
}

/**
 * Converts dynamic EhrOptionDescriptor into standard AllergyOptionMeta.
 */
export function toAllergyOption(descriptor: EhrOptionDescriptor): AllergyOptionMeta {
  return {
    code: descriptor.code,
    label: descriptor.label,
    philHealthCode: descriptor.philHealthCode,
  };
}

/**
 * Normalizes an allergy severity string or dynamic option descriptor into a standard format.
 */
export function normalizeAllergySeverity(
  val: EhrOptionDescriptor | string | null | undefined
): AllergySeverity {
  if (!val) return 'Mild';
  const raw = typeof val === 'string' ? val : val.code || val.label;
  const lower = raw.trim().toLowerCase();
  if (lower === 'lifethreatening' || lower === 'life threatening' || lower === 'anaphylactic') {
    return 'LifeThreatening';
  }
  if (lower === 'severe') return 'Severe';
  if (lower === 'moderate') return 'Moderate';
  return 'Mild';
}
