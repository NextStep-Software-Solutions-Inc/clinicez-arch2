import { describe, expect, it } from 'bun:test';
import { formatDispenseFormLabel, parseMedicineSelection } from '../utils/medicineParser';

describe('medicineParser', () => {
  it('auto-populates dosage, clean generic name, and form for ophthalmic bare-decimal PhilHealth entries', () => {
    const strengthLookup = new Map([['00078', '0.005']]);
    const formLookup = new Map([['00012', 'EYE DROPS SOLUTION']]);
    const unitLookup = new Map([['00044', '5 mL']]);
    const genericLookup = new Map([['00512', 'PROXYMETACAINE (PROPARACAINE)']]);

    const parsed = parseMedicineSelection({
      description: 'PROXYMETACAINE (PROPARACAINE) 0.50% EYE DROPS SOLUTION 5 mL BOTTLE',
      attributes: {
        genCode: '00512',
        strengthCode: '00078',
        formCode: '00012',
        unitCode: '00044',
      },
      strengthLookup,
      formLookup,
      unitLookup,
      genericLookup,
    });

    expect(parsed.genericName).toBe('Proxymetacaine (Proparacaine)');
    expect(parsed.dosage).toBe('0.50% (5 mL)');
    expect(parsed.form).toBe('Eye Drops Solution');
  });

  it('extracts dosage and form from description even before companion catalogs finish loading', () => {
    const parsed = parseMedicineSelection({
      description: 'PROXYMETACAINE (PROPARACAINE) 0.50% EYE DROPS SOLUTION 5 mL BOTTLE',
    });

    expect(parsed.genericName).toBe('Proxymetacaine (Proparacaine)');
    expect(parsed.dosage).toBe('0.50% (5 mL)');
    expect(parsed.form).toBe('Eye Drops Solution');
  });

  it('parses standard solid oral tablets cleanly without container suffixes', () => {
    const parsed = parseMedicineSelection({
      description: 'AMLODIPINE 5 mg TABLET',
      attributes: {
        genCode: '00031',
        strengthCode: '00101',
        formCode: '00001',
        unitCode: '00000',
      },
      strengthLookup: new Map([['00101', '5 mg']]),
      formLookup: new Map([['00001', 'TABLET']]),
      genericLookup: new Map([['00031', 'AMLODIPINE']]),
    });

    expect(parsed.genericName).toBe('Amlodipine');
    expect(parsed.dosage).toBe('5 mg');
    expect(parsed.form).toBe('Tablet');
  });

  it('parses combination oral suspensions with bottle volume', () => {
    const parsed = parseMedicineSelection({
      description: 'CO-AMOXICLAV (AMOXICILLIN + POTASSIUM CLAVULANATE) 400 mg + 57 mg/5 ml SUSPENSION 35 mL BOTTLE',
    });

    expect(parsed.genericName).toBe('Co-Amoxiclav (Amoxicillin + Potassium Clavulanate)');
    expect(parsed.dosage).toBe('400 mg + 57 mg/5 mL (35 mL)');
    expect(parsed.form).toBe('Suspension');
  });

  it('handles zero-strength solutions where concentration leads the generic name', () => {
    const parsed = parseMedicineSelection({
      description: '0.9% SODIUM CHLORIDE SOLUTION 500 mL BOTTLE',
      attributes: {
        genCode: '00900',
        strengthCode: '00000',
        formCode: '00008',
        unitCode: '00250',
      },
      formLookup: new Map([['00008', 'SOLUTION']]),
      unitLookup: new Map([['00250', '500 mL']]),
      genericLookup: new Map([['00900', '0.9% SODIUM CHLORIDE']]),
    });

    expect(parsed.genericName).toBe('Sodium Chloride');
    expect(parsed.dosage).toBe('0.9% (500 mL)');
    expect(parsed.form).toBe('Solution');
  });

  it('compacts verbose PhilHealth strengths to stay within the 50-character database limit', () => {
    const calcium = parseMedicineSelection({
      description: 'CALCIUM CARBONATE + CHOLECALCIFEROL 1.25 g (equiv. to 500 mg elemental calcium) + 250 IU TABLET',
      attributes: { strengthCode: 'S1', formCode: 'F1', genCode: 'G1' },
      strengthLookup: new Map([['S1', '1.25 g (equiv. to 500 mg elemental calcium) + 250 IU']]),
      formLookup: new Map([['F1', 'TABLET']]),
      genericLookup: new Map([['G1', 'CALCIUM CARBONATE + CHOLECALCIFEROL']]),
    });

    expect(calcium.dosage).toBe('1.25 g + 250 IU');
    expect(calcium.dosage.length).toBeLessThanOrEqual(50);

    const insulin = parseMedicineSelection({
      description: 'BIPHASIC ISOPHANE HUMAN INSULIN 70/30 (RECOMBINANT DNA) 100 IU/mL SOLUTION 10 mL VIAL',
      attributes: { strengthCode: 'S2', formCode: 'F2', unitCode: 'U2', genCode: 'G2' },
      strengthLookup: new Map([['S2', '70% isophane suspension + 30% soluble insulin in 100 IU/mL']]),
      formLookup: new Map([['F2', 'SOLUTION']]),
      unitLookup: new Map([['U2', '10 mL']]),
      genericLookup: new Map([['G2', 'BIPHASIC ISOPHANE HUMAN INSULIN 70/30 (RECOMBINANT DNA)']]),
    });

    expect(insulin.genericName).toBe('Biphasic Isophane Human Insulin 70/30 (Recombinant DNA)');
    expect(insulin.dosage).toBe('100 IU/mL (10 mL)');
    expect(insulin.dosage.length).toBeLessThanOrEqual(50);
  });

  it('parses clinic formulary / fee-schedule names cleanly', () => {
    const tab = parseMedicineSelection({ description: 'Paracetamol 500mg Tablet' });
    expect(tab).toEqual({
      genericName: 'Paracetamol',
      dosage: '500mg',
      form: 'Tablet',
    });

    const ors = parseMedicineSelection({ description: 'Oral Rehydration Salts 1 sachet' });
    expect(ors).toEqual({
      genericName: 'Oral Rehydration Salts',
      dosage: '1 sachet',
      form: 'Sachet',
    });
  });

  it('pluralizes dispense form labels cleanly without double-s artifacts', () => {
    expect(formatDispenseFormLabel('Tablet', 30)).toBe('Tablets');
    expect(formatDispenseFormLabel('Tablet', 1)).toBe('Tablet');
    expect(formatDispenseFormLabel('Eye Drops', 2)).toBe('Eye Drops');
    expect(formatDispenseFormLabel('Suppository', 5)).toBe('Suppositories');
    expect(formatDispenseFormLabel('Patch', 3)).toBe('Patches');
  });
});
