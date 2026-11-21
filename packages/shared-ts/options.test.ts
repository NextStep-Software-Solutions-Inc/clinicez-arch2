import { describe, expect, it } from 'bun:test';
import {
  type PsgcLocationDto,
  type StructuredPsgcAddress,
  type EhrOptionDescriptor,
  isStandardBloodType,
  getBloodTypeMeta,
  normalizeBloodTypeOption,
  toBloodTypeOptionDescriptor,
  isStandardAllergySeverity,
  toAllergyOption,
  normalizeAllergySeverity,
} from './index';

describe('Shared TypeScript Contracts - Options, BloodType & Allergies', () => {
  describe('PsgcLocationDto & StructuredPsgcAddress', () => {
    it('supports 10-digit PSGC location DTOs with hierarchical fields', () => {
      const region: PsgcLocationDto = {
        psgcCode: '1300000000',
        code: '1300000000',
        name: 'National Capital Region (NCR)',
        level: 'Region',
        parentPsgcCode: null,
        regionPsgc: '1300000000',
        provincePsgc: null,
        cityMunicipalityPsgc: null,
        zipCode: '1000',
      };

      expect(region.psgcCode).toBe('1300000000');
      expect(region.name).toContain('NCR');
      expect(region.level).toBe('Region');
      expect(region.parentPsgcCode).toBeNull();
      expect(region.zipCode).toBe('1000');
    });

    it('supports StructuredPsgcAddress with all cascading levels and same-as-permanent flag', () => {
      const address: StructuredPsgcAddress = {
        houseNo: 'Unit 402',
        streetAddress: '123 Ayala Avenue',
        streetBarangay: 'San Lorenzo',
        barangayPsgc: '137604022',
        barangayName: 'San Lorenzo',
        cityMunicipalityPsgc: '137604000',
        cityMunicipalityName: 'Makati City',
        provincePsgc: null,
        provinceName: null,
        regionPsgc: '1300000000',
        regionName: 'NCR',
        postalCode: '1223',
        zipCode: '1223',
        country: 'Philippines',
        isSameAsPermanent: true,
      };

      expect(address.isSameAsPermanent).toBe(true);
      expect(address.barangayPsgc).toBe('137604022');
      expect(address.cityMunicipalityName).toBe('Makati City');
    });
  });

  describe('BloodType dynamic options compatibility', () => {
    it('validates canonical blood types', () => {
      expect(isStandardBloodType('O+')).toBe(true);
      expect(isStandardBloodType('AB-')).toBe(true);
      expect(isStandardBloodType('Invalid')).toBe(false);
      expect(isStandardBloodType(null)).toBe(false);
    });

    it('normalizes dynamic EhrOptionDescriptor into blood type string', () => {
      const descriptor: EhrOptionDescriptor = {
        code: 'B+',
        label: 'B Positive (B+)',
        philHealthCode: 'B+',
      };
      expect(normalizeBloodTypeOption(descriptor)).toBe('B+');
      expect(normalizeBloodTypeOption('A-')).toBe('A-');
      expect(normalizeBloodTypeOption(null)).toBe('Unknown');
    });

    it('converts blood type metadata to EhrOptionDescriptor', () => {
      const meta = getBloodTypeMeta('A+');
      const descriptor = toBloodTypeOptionDescriptor(meta);
      expect(descriptor.code).toBe('A+');
      expect(descriptor.label).toBe('A Positive (A+)');
      expect(descriptor.philHealthCode).toBe('A+');
    });
  });

  describe('Allergies dynamic options compatibility', () => {
    it('validates allergy severities correctly', () => {
      expect(isStandardAllergySeverity('Mild')).toBe(true);
      expect(isStandardAllergySeverity('severe')).toBe(true);
      expect(isStandardAllergySeverity('Life Threatening')).toBe(true);
      expect(isStandardAllergySeverity('LifeThreatening')).toBe(true);
      expect(isStandardAllergySeverity('Extreme')).toBe(false);
    });

    it('normalizes dynamic option descriptor to allergy severity', () => {
      const descriptor: EhrOptionDescriptor = {
        code: 'LifeThreatening',
        label: 'Life Threatening / Anaphylactic',
      };
      expect(normalizeAllergySeverity(descriptor)).toBe('LifeThreatening');
      expect(normalizeAllergySeverity('moderate')).toBe('Moderate');
      expect(normalizeAllergySeverity(null)).toBe('Mild');
    });

    it('converts EhrOptionDescriptor to AllergyOptionMeta', () => {
      const descriptor: EhrOptionDescriptor = {
        code: 'PENICILLIN',
        label: 'Penicillin and Beta-lactams',
        philHealthCode: 'MED-001',
      };
      const meta = toAllergyOption(descriptor);
      expect(meta.code).toBe('PENICILLIN');
      expect(meta.label).toBe('Penicillin and Beta-lactams');
      expect(meta.philHealthCode).toBe('MED-001');
    });
  });
});
