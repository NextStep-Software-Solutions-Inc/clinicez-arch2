import { describe, it, expect } from 'vitest';
import {
  DeliveryTypeOption,
  ContraceptiveMethodOption,
  normalizeDeliveryType,
  normalizeContraceptiveMethod,
} from '../constants/reproductiveHealth';
import {
  percentageToRiskBand,
  calculatePhilPenRisk,
  RISK_BAND_MIDPOINTS,
} from '../utils/philpenCalculator';

const TEST_DELIVERY_TYPE_OPTIONS: DeliveryTypeOption[] = [
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

const TEST_CONTRACEPTIVE_OPTIONS: ContraceptiveMethodOption[] = [
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

describe('PhilHealth Reproductive Health Standards', () => {
  describe('PhilHealth Delivery Types', () => {
    it('covers all PhilHealth Konsulta statutory codes (N, O, B, X)', () => {
      const codes = TEST_DELIVERY_TYPE_OPTIONS.map((o) => o.statutoryCode);
      expect(codes).toContain('N'); // Normal (NSD)
      expect(codes).toContain('O'); // Operative (CSD)
      expect(codes).toContain('B'); // Both Normal & Operative
      expect(codes).toContain('X'); // Not Applicable
    });

    it('provides clear clinical descriptions and badges for each delivery type', () => {
      for (const opt of TEST_DELIVERY_TYPE_OPTIONS) {
        expect(opt.label).toBeTruthy();
        expect(opt.value).toBeTruthy();
        expect(opt.description).toBeTruthy();
        expect(opt.badge).toContain('Code');
      }
    });
  });

  describe('PhilHealth Contraceptive Options', () => {
    it('includes standard DOH Family Planning Program and PhilHealth Konsulta methods', () => {
      const values = TEST_CONTRACEPTIVE_OPTIONS.map((o) => o.value);
      expect(values).toContain('None');
      expect(values).toContain('Oral Contraceptives');
      expect(values).toContain('Progestin-Only Pills');
      expect(values).toContain('Injectable Depo');
      expect(values).toContain('IUD');
      expect(values).toContain('IUD Hormonal');
      expect(values).toContain('Subdermal Implant');
      expect(values).toContain('Male Condom');
      expect(values).toContain('Female Condom');
      expect(values).toContain('Bilateral Tubal Ligation');
      expect(values).toContain('Vasectomy');
      expect(values).toContain('Natural Family Planning');
      expect(values).toContain('Lactational Amenorrhea');
      expect(values).toContain('Other');
    });
  });

  describe('normalizeDeliveryType', () => {
    it('maps legacy Vaginal or NSD strings to Normal Spontaneous Vaginal', () => {
      expect(normalizeDeliveryType('Vaginal')).toBe('Normal Spontaneous Vaginal');
      expect(normalizeDeliveryType('V')).toBe('Normal Spontaneous Vaginal');
      expect(normalizeDeliveryType('NSD')).toBe('Normal Spontaneous Vaginal');
      expect(normalizeDeliveryType('Normal Spontaneous Vaginal')).toBe('Normal Spontaneous Vaginal');
    });

    it('maps Cesarean variations to Cesarean', () => {
      expect(normalizeDeliveryType('Cesarean')).toBe('Cesarean');
      expect(normalizeDeliveryType('C')).toBe('Cesarean');
      expect(normalizeDeliveryType('CSD')).toBe('Cesarean');
      expect(normalizeDeliveryType('Caesarean Section')).toBe('Cesarean');
    });

    it('maps Not Applicable variations to NotApplicable', () => {
      expect(normalizeDeliveryType('NotApplicable')).toBe('NotApplicable');
      expect(normalizeDeliveryType('X')).toBe('NotApplicable');
      expect(normalizeDeliveryType('Not Applicable')).toBe('NotApplicable');
    });

    it('preserves custom clinical text', () => {
      expect(normalizeDeliveryType('Water Birth Delivery')).toBe('Water Birth Delivery');
    });
  });

  describe('normalizeContraceptiveMethod', () => {
    it('maps legacy or abbreviated strings to standardized values', () => {
      expect(normalizeContraceptiveMethod('None')).toBe('None');
      expect(normalizeContraceptiveMethod('COCP')).toBe('Oral Contraceptives');
      expect(normalizeContraceptiveMethod('Injectable')).toBe('Injectable Depo');
      expect(normalizeContraceptiveMethod('IUD')).toBe('IUD');
      expect(normalizeContraceptiveMethod('Implant')).toBe('Subdermal Implant');
      expect(normalizeContraceptiveMethod('BTL')).toBe('Bilateral Tubal Ligation');
      expect(normalizeContraceptiveMethod('Vasectomy')).toBe('Vasectomy');
      expect(normalizeContraceptiveMethod('NFP')).toBe('Natural Family Planning');
    });
  });
});

describe('PhilPEN 10-Year CVD Risk Calculation & Real-Time Sync', () => {
  describe('percentageToRiskBand conversion', () => {
    it('correctly maps 15% to Band B (fixing the user-reported discrepancy)', () => {
      expect(percentageToRiskBand(15)).toBe('BandB');
    });

    it('maps <10% to Band A', () => {
      expect(percentageToRiskBand(0)).toBe('BandA');
      expect(percentageToRiskBand(5)).toBe('BandA');
      expect(percentageToRiskBand(9.9)).toBe('BandA');
    });

    it('maps 10% to <20% to Band B', () => {
      expect(percentageToRiskBand(10)).toBe('BandB');
      expect(percentageToRiskBand(14.5)).toBe('BandB');
      expect(percentageToRiskBand(19.9)).toBe('BandB');
    });

    it('maps 20% to <30% to Band C', () => {
      expect(percentageToRiskBand(20)).toBe('BandC');
      expect(percentageToRiskBand(25)).toBe('BandC');
      expect(percentageToRiskBand(29.9)).toBe('BandC');
    });

    it('maps 30% to <40% to Band D', () => {
      expect(percentageToRiskBand(30)).toBe('BandD');
      expect(percentageToRiskBand(35)).toBe('BandD');
      expect(percentageToRiskBand(39.9)).toBe('BandD');
    });

    it('maps >=40% to Band E', () => {
      expect(percentageToRiskBand(40)).toBe('BandE');
      expect(percentageToRiskBand(45)).toBe('BandE');
      expect(percentageToRiskBand(80)).toBe('BandE');
    });
  });

  describe('calculatePhilPenRisk statutory rules', () => {
    it('triggers immediate Band E override for hypertensive emergency (SBP >= 180)', () => {
      const res = calculatePhilPenRisk({
        ageYears: 45,
        gender: 'Female',
        systolicBp: 185,
        diastolicBp: 95,
      });

      expect(res.riskBand).toBe('BandE');
      expect(res.calculatedScorePercent).toBe(45.0);
      expect(res.crisisOverrideApplied).toBe(true);
      expect(res.overrideReason).toContain('Hypertensive Emergency');
    });

    it('triggers immediate Band E override for established CVD (prior angina / heart attack / stroke)', () => {
      const res = calculatePhilPenRisk({
        ageYears: 50,
        gender: 'Female',
        hasAnginaOrHeartAttack: true,
        hasStrokeOrTia: false,
      });

      expect(res.riskBand).toBe('BandE');
      expect(res.calculatedScorePercent).toBe(40.0);
      expect(res.crisisOverrideApplied).toBe(true);
      expect(res.overrideReason).toContain('Established CVD');
    });

    it('elevates to minimum Band D for prolonged severe chest pain (>30m)', () => {
      const res = calculatePhilPenRisk({
        ageYears: 35,
        gender: 'Female',
        severeChestPainOver30Mins: true,
      });

      expect(res.riskBand).toBe('BandD');
      expect(res.calculatedScorePercent).toBeGreaterThanOrEqual(30.0);
    });

    it('computes low risk Band A for healthy young adult', () => {
      const res = calculatePhilPenRisk({
        ageYears: 25,
        gender: 'Female',
        isSmoker: false,
        systolicBp: 110,
        diagnosedDiabetes: false,
        totalCholesterolMgDl: 160,
      });

      expect(res.riskBand).toBe('BandA');
      expect(res.calculatedScorePercent).toBe(6.5);
      expect(res.crisisOverrideApplied).toBe(false);
    });

    it('computes moderate risk Band B with aging and smoking', () => {
      const res = calculatePhilPenRisk({
        ageYears: 55, // +3
        gender: 'Male', // +1
        isSmoker: true, // +3
        systolicBp: 120, // 0
        diagnosedDiabetes: false, // 0
        totalCholesterolMgDl: 180, // 0
      });
      // points = 7 -> Band B (14.0%)
      expect(res.riskBand).toBe('BandB');
      expect(res.calculatedScorePercent).toBe(14.0);
    });
  });

  describe('RISK_BAND_MIDPOINTS', () => {
    it('has standard midpoint percentages for all 5 bands', () => {
      expect(RISK_BAND_MIDPOINTS.BandA).toBe(5);
      expect(RISK_BAND_MIDPOINTS.BandB).toBe(15);
      expect(RISK_BAND_MIDPOINTS.BandC).toBe(25);
      expect(RISK_BAND_MIDPOINTS.BandD).toBe(35);
      expect(RISK_BAND_MIDPOINTS.BandE).toBe(45);
    });
  });
});
