export interface DeliveryTypeOption {
  label: string;
  value: string;
  description: string;
  statutoryCode: 'N' | 'O' | 'B' | 'X';
  badge: string;
}

/**
 * Standard PhilHealth Konsulta Delivery Types (Annex A Data Dictionary pDeliveryTyp)
 * Valid values:
 * 'N' – Normal (NSD)
 * 'O' – Operative (CSD)
 * 'B' – Both Normal & Operative (NSD & CSD)
 * 'X' – Not Applicable
 */
export const PHILHEALTH_DELIVERY_TYPE_OPTIONS: DeliveryTypeOption[] = [
  {
    label: 'Normal Spontaneous Vaginal (NSD)',
    value: 'Normal Spontaneous Vaginal',
    description: 'Unassisted or spontaneous vaginal cephalic birth',
    statutoryCode: 'N',
    badge: 'Code N • Normal',
  },
  {
    label: 'Cesarean Delivery (CSD)',
    value: 'Cesarean',
    description: 'Operative abdominal delivery / Lower uterine segment CS',
    statutoryCode: 'O',
    badge: 'Code O • Operative',
  },
  {
    label: 'Both Normal & Cesarean (NSD & CSD)',
    value: 'Both Normal and Cesarean',
    description: 'Patient had both vaginal and operative deliveries across past pregnancies',
    statutoryCode: 'B',
    badge: 'Code B • Both',
  },
  {
    label: 'Assisted Vaginal (Forceps / Vacuum)',
    value: 'Assisted Vaginal',
    description: 'Instrumental vaginal delivery with vacuum extraction or obstetric forceps',
    statutoryCode: 'N',
    badge: 'Code N • Assisted',
  },
  {
    label: 'Not Applicable / Nulliparous',
    value: 'NotApplicable',
    description: 'No prior deliveries (Gravida 0 or Para 0)',
    statutoryCode: 'X',
    badge: 'Code X • N/A',
  },
];

export interface ContraceptiveMethodOption {
  label: string;
  value: string;
  description: string;
  category: 'Modern Short-Acting' | 'Long-Acting Reversible' | 'Permanent' | 'Natural / Traditional' | 'None';
  badge: string;
}

/**
 * Standard Contraceptive & Family Planning Methods
 * Aligned with DOH National Family Planning Program & PhilHealth Konsulta MENSHIST pBirthCtrlMethod
 */
export const PHILHEALTH_CONTRACEPTIVE_OPTIONS: ContraceptiveMethodOption[] = [
  {
    label: 'None / No Method',
    value: 'None',
    description: 'Currently not utilizing any contraceptive or family planning method',
    category: 'None',
    badge: 'None',
  },
  {
    label: 'Combined Oral Contraceptives (COC Pills)',
    value: 'Oral Contraceptives',
    description: 'Daily estrogen-progestin combination contraceptive pills',
    category: 'Modern Short-Acting',
    badge: 'Pills (COC)',
  },
  {
    label: 'Progestin-Only Pills (POP / Minipill)',
    value: 'Progestin-Only Pills',
    description: 'Daily progestin-only oral pills (e.g. for lactating mothers)',
    category: 'Modern Short-Acting',
    badge: 'Pills (POP)',
  },
  {
    label: 'Injectable Contraceptives (DMPA / Depo-Provera)',
    value: 'Injectable Depo',
    description: 'Depot medroxyprogesterone acetate 3-month intramuscular injection',
    category: 'Modern Short-Acting',
    badge: 'Depo 3-Mo',
  },
  {
    label: 'Intrauterine Device - Copper (IUD)',
    value: 'IUD',
    description: 'Non-hormonal copper T380A intrauterine contraceptive device',
    category: 'Long-Acting Reversible',
    badge: 'IUD Copper',
  },
  {
    label: 'Intrauterine Device - Hormonal (LNG-IUD)',
    value: 'IUD Hormonal',
    description: 'Levonorgestrel-releasing intrauterine contraceptive system',
    category: 'Long-Acting Reversible',
    badge: 'LNG-IUD',
  },
  {
    label: 'Subdermal Contraceptive Implant',
    value: 'Subdermal Implant',
    description: 'Etonogestrel/Levonorgestrel subdermal single/dual-rod implant',
    category: 'Long-Acting Reversible',
    badge: 'Implant',
  },
  {
    label: 'Male Condom (Barrier)',
    value: 'Male Condom',
    description: 'Latex or polyurethane external barrier method',
    category: 'Modern Short-Acting',
    badge: 'Condom',
  },
  {
    label: 'Female Condom (Barrier)',
    value: 'Female Condom',
    description: 'Internal vaginal nitrile or polyurethane sheath',
    category: 'Modern Short-Acting',
    badge: 'Female Condom',
  },
  {
    label: 'Bilateral Tubal Ligation (BTL)',
    value: 'Bilateral Tubal Ligation',
    description: 'Permanent surgical sterilization (minilaparotomy / laparoscopy)',
    category: 'Permanent',
    badge: 'BTL Surgical',
  },
  {
    label: 'Vasectomy (Partner Sterilization)',
    value: 'Vasectomy',
    description: 'Permanent no-scalpel male surgical vasectomy',
    category: 'Permanent',
    badge: 'Vasectomy',
  },
  {
    label: 'Natural Family Planning (NFP / Rhythm / Standard Days / BBT)',
    value: 'Natural Family Planning',
    description: 'Fertility awareness-based methods (calendar, BBT, Billings ovulation)',
    category: 'Natural / Traditional',
    badge: 'NFP / Rhythm',
  },
  {
    label: 'Lactational Amenorrhea Method (LAM)',
    value: 'Lactational Amenorrhea',
    description: 'Exclusive postpartum breastfeeding amenorrhea method (<6 months)',
    category: 'Natural / Traditional',
    badge: 'LAM',
  },
  {
    label: 'Other Method',
    value: 'Other',
    description: 'Traditional or alternative contraceptive method not listed above',
    category: 'Natural / Traditional',
    badge: 'Other',
  },
];

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
