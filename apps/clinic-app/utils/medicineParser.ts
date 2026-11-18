/**
 * Pure clinical medicine parser for PhilHealth YAKAP 2.0 (`lib_medicine`) and clinic formulary items.
 *
 * Extracts clean `genericName`, `dosage`, and `form` from either structured PhilHealth catalog
 * metadata (`lib_medicine_strength`, `lib_medicine_form`, `lib_medicine_unit`, `lib_medicine_generic`)
 * or free-text medicine descriptions, including handling PhilHealth's bare Excel decimal percentages
 * (e.g. `strengthCode` -> `"0.005"` for `"0.50%"` ophthalmic solutions).
 */

export interface MedicineSelectionInput {
  description: string;
  attributes?: Record<string, string> | null;
  strengthLookup?: ReadonlyMap<string, string>;
  formLookup?: ReadonlyMap<string, string>;
  unitLookup?: ReadonlyMap<string, string>;
  genericLookup?: ReadonlyMap<string, string>;
}

export interface ParsedMedicineSelection {
  genericName: string;
  dosage: string;
  form: string;
}

const MAX_GENERIC_LENGTH = 150;
const MAX_DOSAGE_LENGTH = 50;
const MAX_FORM_LENGTH = 50;

const BARE_DECIMAL_RE = /^\d+(?:\.\d+)?$/;

const UPPERCASE_CLINICAL_TOKENS = new Set([
  'DNA',
  'RNA',
  'HCL',
  'HIV',
  'HBV',
  'HPV',
  'BCG',
  'DTAP',
  'DTP',
  'TDAP',
  'IPV',
  'OPV',
  'HIB',
  'PCV',
  'MMR',
  'JE',
  'TT',
  'TD',
  'IU',
  'USP',
  'BP',
  'XR',
  'SR',
  'ER',
  'MR',
  'CR',
  'LA',
  'OD',
  'DS',
  'FORTE',
  'B1',
  'B2',
  'B3',
  'B5',
  'B6',
  'B12',
  'D2',
  'D3',
  'K1',
  'K2',
  'II',
  'III',
  'IV',
  'VI',
  'VII',
  'VIII',
  'IX',
]);

const LOWERCASE_CONNECTORS = new Set(['as', 'in', 'with', 'and', 'of', 'for', 'to', 'or']);

const FORM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bEYE\s+DROPS\s+SUSPENSION\b/i, label: 'Eye Drops Suspension' },
  { pattern: /\bEYE\s+DROPS\s+SOLUTION\b/i, label: 'Eye Drops Solution' },
  { pattern: /\bEYE\s+DROPS\b/i, label: 'Eye Drops' },
  { pattern: /\bEYE\s+OINTMENT\b/i, label: 'Eye Ointment' },
  { pattern: /\bEAR\s+DROPS\b/i, label: 'Ear Drops' },
  { pattern: /\bNASAL\s+SPRAY\b/i, label: 'Nasal Spray' },
  { pattern: /\bNASAL\s+DROPS\b/i, label: 'Nasal Drops' },
  { pattern: /\bORAL\s+DROPS\b/i, label: 'Oral Drops' },
  { pattern: /\bMETERED\s+DOSE\s+INHALER\b/i, label: 'Metered Dose Inhaler' },
  { pattern: /\bDRY\s+POWDER\s+INHALER\b/i, label: 'Dry Powder Inhaler' },
  { pattern: /\bRESPIRATORY\s+SOLUTION\b/i, label: 'Respiratory Solution' },
  { pattern: /\bNEBULIZING\s+SOLUTION\b/i, label: 'Nebulizing Solution' },
  { pattern: /\bNEBULE\b/i, label: 'Nebule' },
  { pattern: /\bINHALER\b/i, label: 'Inhaler' },
  { pattern: /\bFILM[- ]COATED\s+TABLET\b/i, label: 'Film-Coated Tablet' },
  { pattern: /\bCHEWABLE\s+TABLET\b/i, label: 'Chewable Tablet' },
  { pattern: /\bDISPERSIBLE\s+TABLET\b/i, label: 'Dispersible Tablet' },
  { pattern: /\bEFFERVESCENT\s+TABLET\b/i, label: 'Effervescent Tablet' },
  { pattern: /\bSUBLINGUAL\s+TABLET\b/i, label: 'Sublingual Tablet' },
  { pattern: /\bMODIFIED[- ]RELEASE\s+TABLET\b/i, label: 'Modified-Release Tablet' },
  { pattern: /\bEXTENDED[- ]RELEASE\s+TABLET\b/i, label: 'Extended-Release Tablet' },
  { pattern: /\bSUSTAINED[- ]RELEASE\s+TABLET\b/i, label: 'Sustained-Release Tablet' },
  { pattern: /\bTABLETS?\b/i, label: 'Tablet' },
  { pattern: /\bCAPSULES?\b/i, label: 'Capsule' },
  { pattern: /\bSUSPENSION\b/i, label: 'Suspension' },
  { pattern: /\bSYRUP\b/i, label: 'Syrup' },
  { pattern: /\bELIXIR\b/i, label: 'Elixir' },
  { pattern: /\bDROPS\b/i, label: 'Drops' },
  { pattern: /\bCREAM\b/i, label: 'Cream' },
  { pattern: /\bOINTMENT\b/i, label: 'Ointment' },
  { pattern: /\bGEL\b/i, label: 'Gel' },
  { pattern: /\bLOTION\b/i, label: 'Lotion' },
  { pattern: /\bSUPPOSITOR(?:Y|IES)\b/i, label: 'Suppository' },
  { pattern: /\bTRANSDERMAL\s+PATCH\b/i, label: 'Transdermal Patch' },
  { pattern: /\bPATCH\b/i, label: 'Patch' },
  { pattern: /\bSACHETS?\b/i, label: 'Sachet' },
  { pattern: /\bGRANULES?\b/i, label: 'Granules' },
  { pattern: /\bPOWDER\b/i, label: 'Powder' },
  { pattern: /\bEMULSION\b/i, label: 'Emulsion' },
  { pattern: /\bSOLUTION\b/i, label: 'Solution' },
  { pattern: /\bAMPULES?\b/i, label: 'Ampule' },
  { pattern: /\bVIALS?\b/i, label: 'Vial' },
];

// Combination strengths: e.g. "400 mg + 57 mg/5 mL", "5 mg + 10 mg", "70 mg + 2800 IU", "500 mcg + 2.5 mg"
const COMBO_DOSAGE_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|µg|g|kg|iu|units?|meq|mmol|%)(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:ml|l|g|dose|actuation|drop))?(?:\s*\+\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|µg|g|kg|iu|units?|meq|mmol|%)(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:ml|l|g|dose|actuation|drop))?)+/i;

// Ratio / concentration strengths: e.g. "100 IU/mL", "250 mg/5 mL", "100 mcg/dose", "2 mg/mL"
const RATIO_DOSAGE_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|µg|g|iu|units?|meq|mmol)\s*\/\s*\d*(?:[.,]\d+)?\s*(?:ml|l|g|dose|actuation|drop|hr|h)\b/i;

// Percentage concentrations: e.g. "0.50%", "0.9%", "3%", "20%"
const PERCENT_DOSAGE_RE = /(?:^|\s)(\d+(?:\.\d+)?\s*%)/;

// Single mass / potency strengths (excluding standalone mL/L container volume): e.g. "500 mg", "500mg", "2.5 mg", "10,000 IU"
const MASS_DOSAGE_RE = /\b\d[\d,]*(?:\.\d+)?\s*(?:mg|mcg|ug|µg|kg|iu|units?|meq|mmol|g)\b/i;

// Container fill volume / unit fallback: e.g. "5 mL", "60 mL", "500 mL", "1 L", "4.5 g", "1 sachet"
const VOLUME_UNIT_RE = /\b(\d+(?:\.\d+)?\s*(?:mL|ml|L|g|sachets?))\b(?:\s+(?:BOTTLE|AMPULE|VIAL|TUBE|BAG|SACHET|PRE-FILLED|SYRINGE|NEBULE|JAR|CANISTER))?/i;

function normalizeUnitCasing(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bml\b/gi, 'mL')
    .replace(/\biu\b/gi, 'IU')
    .replace(/\bmeq\b/gi, 'mEq')
    .trim();
}

function compactDosage(raw: string): string {
  let cleaned = normalizeUnitCasing(raw);
  if (cleaned.length <= MAX_DOSAGE_LENGTH) {
    return cleaned;
  }

  // Strip parenthetical equivalence notes first (e.g. "(equiv. to 500 mg elemental calcium)")
  const withoutParens = cleaned.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (withoutParens && withoutParens.length <= MAX_DOSAGE_LENGTH) {
    return withoutParens;
  }

  // If still > 50 chars (e.g. "70% isophane suspension + 30% soluble insulin in 100 IU/mL"), extract concise concentration
  const ratioMatch = withoutParens.match(RATIO_DOSAGE_RE) ?? withoutParens.match(COMBO_DOSAGE_RE) ?? withoutParens.match(MASS_DOSAGE_RE);
  if (ratioMatch && ratioMatch[0].length <= MAX_DOSAGE_LENGTH) {
    return normalizeUnitCasing(ratioMatch[0]);
  }

  return withoutParens.slice(0, MAX_DOSAGE_LENGTH).trim();
}

export function extractDosageFromText(text: string): { baseDosage: string; containerUnit: string } {
  const source = text.trim();
  if (!source) {
    return { baseDosage: '', containerUnit: '' };
  }

  let baseDosage = '';
  const comboMatch = source.match(COMBO_DOSAGE_RE);
  if (comboMatch) {
    baseDosage = normalizeUnitCasing(comboMatch[0]);
  } else {
    const ratioMatch = source.match(RATIO_DOSAGE_RE);
    if (ratioMatch) {
      baseDosage = normalizeUnitCasing(ratioMatch[0]);
    } else {
      const percentMatch = source.match(PERCENT_DOSAGE_RE);
      if (percentMatch) {
        baseDosage = percentMatch[1].replace(/\s+/g, '');
      } else {
        const massMatch = source.match(MASS_DOSAGE_RE);
        if (massMatch) {
          // Ensure a trailing package weight like "3% EYE OINTMENT 4.5 g TUBE" wasn't already caught by percentMatch
          baseDosage = normalizeUnitCasing(massMatch[0]);
        }
      }
    }
  }

  // Extract trailing container volume/weight when followed by a package keyword (e.g. "5 mL BOTTLE", "10 mL AMPULE", "4.5 g TUBE")
  const trailingContainerMatch = source.match(
    /\b(\d+(?:\.\d+)?\s*(?:mL|ml|L|g))\s+(?:BOTTLE|AMPULE|VIAL|TUBE|BAG|PRE-FILLED|SYRINGE|JAR|CANISTER)\b/i,
  );
  let containerUnit = trailingContainerMatch ? normalizeUnitCasing(trailingContainerMatch[1]) : '';

  if (!baseDosage && !containerUnit) {
    const fallbackVol = source.match(VOLUME_UNIT_RE);
    if (fallbackVol) {
      baseDosage = normalizeUnitCasing(fallbackVol[1]);
    }
  }

  return { baseDosage, containerUnit };
}

export function formatClinicalText(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  // Preserve intentional mixed-case strings from clinic fee schedule (e.g. "Co-Amoxiclav", "Paracetamol")
  const hasLowercase = /[a-z]/.test(trimmed.replace(/\(\s*as\s+/gi, ''));
  if (hasLowercase) {
    return trimmed;
  }

  let isFirstWord = true;
  return trimmed.replace(/[A-Za-z0-9]+/g, (word) => {
    const upper = word.toUpperCase();
    const lower = word.toLowerCase();
    if (UPPERCASE_CLINICAL_TOKENS.has(upper)) {
      isFirstWord = false;
      return upper;
    }
    if (!isFirstWord && LOWERCASE_CONNECTORS.has(lower)) {
      return lower;
    }
    isFirstWord = false;
    return word.charAt(0).toUpperCase() + lower.slice(1);
  });
}

export function extractFormFromText(text: string): string {
  for (const entry of FORM_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.label;
    }
  }
  return 'Tablet';
}

function stripGenericFromDescription(description: string, baseDosage: string): string {
  let working = description.trim();
  if (!working) return '';

  // Remove parenthetical PhilHealth salt clause if desired? No, keep synonyms like "(PROPARACAINE)", strip "( as ...)" salt noise or normalize spacing
  working = working.replace(/\(\s+as\s+/gi, '(as ');

  // Cut off starting at the extracted baseDosage if baseDosage appears after at least one drug name token
  if (baseDosage) {
    const escaped = baseDosage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const idxMatch = working.match(new RegExp(`\\s+${escaped}`, 'i'));
    if (idxMatch && idxMatch.index !== undefined && idxMatch.index > 0) {
      working = working.slice(0, idxMatch.index).trim();
    }
  }

  // Cut off starting at any dosage form keyword if still present
  for (const entry of FORM_PATTERNS) {
    const m = working.match(entry.pattern);
    if (m && m.index !== undefined && m.index > 0) {
      working = working.slice(0, m.index).trim();
      break;
    }
  }

  // Strip trailing container size + package descriptors if still remaining
  working = working
    .replace(/\s+\d+(?:\.\d+)?\s*(?:mL|ml|L|g)\s*(?:BOTTLE|AMPULE|VIAL|TUBE|BAG|SACHET)?$/i, '')
    .replace(/\s+(?:BOTTLE|AMPULE|VIAL|TUBE|BAG|SACHET|BLISTER|PACK)$/i, '')
    .trim();

  return working || description.trim();
}

export function formatDispenseFormLabel(form: string, quantity: number): string {
  const clean = (form || 'Tablet').trim();
  if (quantity === 1) return clean;
  if (/s$/i.test(clean)) return clean;
  if (/y$/i.test(clean) && !/[aeiou]y$/i.test(clean)) {
    return `${clean.slice(0, -1)}ies`;
  }
  if (/(?:ch|sh|x|z)$/i.test(clean)) {
    return `${clean}es`;
  }
  return `${clean}s`;
}

export function parseMedicineSelection(input: MedicineSelectionInput): ParsedMedicineSelection {
  const description = (input.description || '').trim();
  const attrs = input.attributes ?? null;

  const strengthCode = attrs?.strengthCode;
  const formCode = attrs?.formCode;
  const unitCode = attrs?.unitCode;
  const genCode = attrs?.genCode;

  const rawStrength =
    strengthCode && strengthCode !== '00000' ? (input.strengthLookup?.get(strengthCode) ?? '').trim() : '';
  const rawForm =
    formCode && formCode !== '00000' ? (input.formLookup?.get(formCode) ?? '').trim() : '';
  const rawUnit =
    unitCode && unitCode !== '00000' ? normalizeUnitCasing(input.unitLookup?.get(unitCode) ?? '') : '';
  const rawGeneric =
    genCode && genCode !== '00000' ? (input.genericLookup?.get(genCode) ?? '').trim() : '';

  const textParsed = extractDosageFromText(description);

  // 1. Resolve primary dosage strength
  let baseDosage = '';
  if (rawStrength && !BARE_DECIMAL_RE.test(rawStrength)) {
    baseDosage = compactDosage(rawStrength);
  } else if (textParsed.baseDosage) {
    baseDosage = compactDosage(textParsed.baseDosage);
  } else if (rawStrength && BARE_DECIMAL_RE.test(rawStrength)) {
    // Fallback for bare Excel decimal (e.g. "0.005" -> "0.5%") when description had no explicit '%'
    const pct = Number(rawStrength) * 100;
    if (Number.isFinite(pct) && pct > 0) {
      baseDosage = `${Number(pct.toPrecision(6))}%`;
    }
  }

  // 2. Attach container unit when informative (e.g. "0.50% (5 mL)" for ophthalmic/topical/liquid containers)
  const effectiveUnit = rawUnit || textParsed.containerUnit;
  let dosage = baseDosage;
  if (effectiveUnit) {
    if (!dosage) {
      dosage = effectiveUnit;
    } else {
      const normalizedDosageLower = dosage.replace(/\s+/g, '').toLowerCase();
      const normalizedUnitLower = effectiveUnit.replace(/\s+/g, '').toLowerCase();
      if (!normalizedDosageLower.includes(normalizedUnitLower)) {
        const combined = `${dosage} (${effectiveUnit})`;
        if (combined.length <= MAX_DOSAGE_LENGTH) {
          dosage = combined;
        }
      }
    }
  }
  dosage = dosage.slice(0, MAX_DOSAGE_LENGTH).trim();

  // 3. Resolve dosage form
  const resolvedForm = rawForm ? formatClinicalText(rawForm) : extractFormFromText(description);
  const form = (resolvedForm || 'Tablet').slice(0, MAX_FORM_LENGTH).trim();

  // 4. Resolve clean generic name without duplicating strength/package
  let genericSource = rawGeneric || stripGenericFromDescription(description, textParsed.baseDosage || baseDosage);
  if (baseDosage && genericSource.toUpperCase().startsWith(`${baseDosage.toUpperCase()} `)) {
    const strippedLeading = genericSource.slice(baseDosage.length).trim();
    if (strippedLeading) {
      genericSource = strippedLeading;
    }
  }
  const genericName = (formatClinicalText(genericSource) || description).slice(0, MAX_GENERIC_LENGTH).trim();

  return {
    genericName,
    dosage,
    form,
  };
}
