import { describe, expect, test } from 'bun:test';
import {
  BOOKING_SECTION_INFO,
  BOOKING_SHARE_SECTIONS,
  clinicRequestedSections,
  isBookingShareSection,
  parseShareSections,
  serializeShareSections,
  shareSectionsSummary,
  toggleShareSection,
} from '../services/sharing/bookingSections';

describe('booking share sections', () => {
  test('exclude Demographics and keep canonical order', () => {
    expect([...BOOKING_SHARE_SECTIONS]).toEqual([
      'Allergies',
      'Medications',
      'Conditions',
      'Immunizations',
      'LabResults',
      'Prescriptions',
      'Vitals',
    ]);
    expect(BOOKING_SECTION_INFO.map((info) => info.key)).toEqual([...BOOKING_SHARE_SECTIONS]);
    expect(BOOKING_SECTION_INFO.every((info) => info.label.length > 0 && info.description.length > 0)).toBe(true);
  });

  test('isBookingShareSection rejects Demographics, camelCase and junk', () => {
    expect(isBookingShareSection('Allergies')).toBe(true);
    expect(isBookingShareSection('Demographics')).toBe(false);
    expect(isBookingShareSection('labResults')).toBe(false);
    expect(isBookingShareSection('')).toBe(false);
  });

  test('toggle keeps canonical order and never duplicates', () => {
    const withVitals = toggleShareSection([], 'Vitals', true);
    const both = toggleShareSection(withVitals, 'Allergies', true);
    expect(both).toEqual(['Allergies', 'Vitals']);
    expect(toggleShareSection(both, 'Allergies', true)).toEqual(['Allergies', 'Vitals']);
    expect(toggleShareSection(both, 'Vitals', false)).toEqual(['Allergies']);
    expect(toggleShareSection([], 'Vitals', false)).toEqual([]);
  });

  test('serialize and parse round trip', () => {
    const json = serializeShareSections(['Vitals', 'Allergies', 'Allergies']);
    expect(json).toBe('["Allergies","Vitals"]');
    expect(parseShareSections(json)).toEqual(['Allergies', 'Vitals']);
    expect(parseShareSections(serializeShareSections([]))).toEqual([]);
  });

  test('parse drops unknown values, Demographics and malformed JSON', () => {
    expect(parseShareSections('["Allergies","Demographics","labResults",3,null,"Vitals"]')).toEqual(['Allergies', 'Vitals']);
    expect(parseShareSections('{"a":1}')).toEqual([]);
    expect(parseShareSections('not json')).toEqual([]);
    expect(parseShareSections('')).toEqual([]);
  });

  test('clinic hints match required fields case-insensitively and ignore other fields', () => {
    expect(clinicRequestedSections(['fullName', 'allergies', 'labResults', 'medications'])).toEqual([
      'Allergies',
      'Medications',
      'LabResults',
    ]);
    expect(clinicRequestedSections(['fullName', 'dateOfBirth'])).toEqual([]);
    expect(clinicRequestedSections([])).toEqual([]);
  });

  test('summary lists labels or None', () => {
    expect(shareSectionsSummary([])).toBe('None');
    expect(shareSectionsSummary(['LabResults', 'Allergies'])).toBe('Allergies, Lab results');
  });
});
