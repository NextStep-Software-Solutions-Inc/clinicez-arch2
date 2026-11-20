import { describe, test, expect } from 'bun:test';
import { computePatientLocation } from '../utils/patientLocation';

describe('Feature 14: Dynamic Locality Resolution (computePatientLocation)', () => {
  test('T6.1: Formats Barangay, City, Province when all three present', () => {
    const loc = computePatientLocation({
      primary_barangay: 'Barangay San Antonio',
      primary_city: 'Pasig City',
      primary_province: 'Metro Manila',
    });
    expect(loc).toBe('Barangay San Antonio, Pasig City, Metro Manila');
  });

  test('T6.2: Formats City, Province when Barangay omitted', () => {
    const loc = computePatientLocation({
      primary_city: 'Davao City',
      primary_province: 'Davao del Sur',
    });
    expect(loc).toBe('Davao City, Davao del Sur');
  });

  test('T6.3: Formats Barangay, City when Province omitted (chartered cities)', () => {
    const loc = computePatientLocation({
      primary_barangay: 'Lahug',
      primary_city: 'Cebu City',
    });
    expect(loc).toBe('Lahug, Cebu City');
  });

  test('T6.4: Only Barangay present', () => {
    const loc = computePatientLocation({
      primary_barangay: 'Barangay 1',
    });
    expect(loc).toBe('Barangay 1');
  });

  test('T6.5: Falls back to primary_address_line when administrative divisions omitted', () => {
    const loc = computePatientLocation({
      primary_address_line: 'Purok 5 Riverside',
    });
    expect(loc).toBe('Purok 5 Riverside');
  });

  test('T6.6: Resolves from customFields wrapper object', () => {
    const loc = computePatientLocation({
      customFields: {
        primary_barangay: 'Poblacion',
        primary_city: 'Iloilo City',
        primary_province: 'Iloilo',
      },
    });
    expect(loc).toBe('Poblacion, Iloilo City, Iloilo');
  });

  test('T6.7: Returns "" when all inputs empty, null, or undefined', () => {
    expect(computePatientLocation({})).toBe('');
    expect(computePatientLocation(null)).toBe('');
    expect(computePatientLocation(undefined)).toBe('');
    expect(computePatientLocation({ customFields: {} })).toBe('');
    expect(computePatientLocation({ customFields: null })).toBe('');
  });

  test('T6.8: Trims whitespace and suppresses empty tokens', () => {
    const loc = computePatientLocation({
      primary_barangay: '   ',
      primary_city: '  Baguio City  ',
      primary_province: 'Benguet',
    });
    expect(loc).toBe('Baguio City, Benguet');
  });

  test('T6.9: Strictly does NOT read deleted top-level entity properties', () => {
    const loc = computePatientLocation({
      barangay: 'Deleted Barangay',
      city: 'Deleted City',
      province: 'Deleted Province',
    } as any);
    expect(loc).toBe('');
  });
});
