export interface DeliveryTypeOption {
  label: string;
  value: string;
  description: string;
  statutoryCode: 'N' | 'O' | 'B' | 'X';
  badge: string;
}

export interface ContraceptiveMethodOption {
  label: string;
  value: string;
  description: string;
  category: 'Modern Short-Acting' | 'Long-Acting Reversible' | 'Permanent' | 'Natural / Traditional' | 'None';
  badge: string;
}

/**
 * Helper to normalize legacy or free-text delivery type strings to standardized option values
 */
export function normalizeDeliveryType(val?: string | null): string {
  if (!val || !val.trim()) return 'Normal Spontaneous Vaginal';
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'v' || lower === 'vaginal' || lower.includes('spontaneous') || lower === 'nsd' || lower === 'nsvd') {
    return 'Normal Spontaneous Vaginal';
  }
  if (
    lower === 'c' ||
    lower === 'cesarean' ||
    lower === 'caesarean' ||
    lower === 'cs' ||
    lower === 'csd' ||
    lower.includes('cesarean') ||
    lower.includes('caesarean')
  ) {
    return 'Cesarean';
  }
  if (lower === 'b' || lower.includes('both')) {
    return 'Both Normal and Cesarean';
  }
  if (lower.includes('forceps') || lower.includes('vacuum') || lower.includes('assisted')) {
    return 'Assisted Vaginal';
  }
  if (lower === 'x' || lower.includes('not applicable') || lower.includes('nulliparous') || lower === 'none') {
    return 'NotApplicable';
  }
  return trimmed;
}

/**
 * Helper to normalize legacy or free-text contraceptive method strings to standardized option values
 */
export function normalizeContraceptiveMethod(val?: string | null): string {
  if (!val || !val.trim()) return 'None';
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'none' || lower === 'no method' || lower === 'null') {
    return 'None';
  }
  if (lower.includes('pop') || lower.includes('progestin')) {
    return 'Progestin-Only Pills';
  }
  if (lower.includes('pill') || lower.includes('oral') || lower === 'cocp' || lower === 'coc') {
    return 'Oral Contraceptives';
  }
  if (lower.includes('depo') || lower.includes('dmpa') || lower.includes('inject')) {
    return 'Injectable Depo';
  }
  if (lower.includes('hormonal') && lower.includes('iud')) {
    return 'IUD Hormonal';
  }
  if (lower.includes('iud') || lower.includes('copper')) {
    return 'IUD';
  }
  if (lower.includes('implant') || lower.includes('subdermal') || lower.includes('norplant') || lower.includes('implanon')) {
    return 'Subdermal Implant';
  }
  if (lower.includes('female condom')) {
    return 'Female Condom';
  }
  if (lower.includes('condom') || lower.includes('barrier')) {
    return 'Male Condom';
  }
  if (lower.includes('btl') || lower.includes('tubal') || lower.includes('ligation')) {
    return 'Bilateral Tubal Ligation';
  }
  if (lower.includes('vasectomy')) {
    return 'Vasectomy';
  }
  if (lower.includes('lam') || lower.includes('lactation')) {
    return 'Lactational Amenorrhea';
  }
  if (lower.includes('nfp') || lower.includes('rhythm') || lower.includes('natural') || lower.includes('calendar')) {
    return 'Natural Family Planning';
  }
  return trimmed;
}
