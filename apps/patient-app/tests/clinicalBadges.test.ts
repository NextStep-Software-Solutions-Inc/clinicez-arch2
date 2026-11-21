import { describe, expect, test } from 'bun:test';
import {
  getProvenanceMeta,
  getUrgencyMeta,
} from '../services/records/categories';

describe('Provenance Badges (getProvenanceMeta)', () => {
  test('resolves ClinicEZ Verified badge for clinicez_verified provenance', () => {
    const meta = getProvenanceMeta('clinicez_verified');
    expect(meta.tone).toBe('primary');
    expect(meta.icon).toBe('checkCircle');
    expect(meta.label).toBe('ClinicEZ Verified');
  });

  test('appends facility attribution when facilityName is provided for verified record', () => {
    const meta = getProvenanceMeta('clinicez_verified', 'clinic-1', "St. Luke's Medical Center");
    expect(meta.tone).toBe('primary');
    expect(meta.icon).toBe('checkCircle');
    expect(meta.label).toBe("Verified · St. Luke's Medical Center");
  });

  test('resolves External Lab badge for external_lab provenance', () => {
    const meta = getProvenanceMeta('external_lab');
    expect(meta.tone).toBe('info');
    expect(meta.icon).toBe('hospital');
    expect(meta.label).toBe('External Lab');
  });

  test('appends facility attribution for external lab', () => {
    const meta = getProvenanceMeta('external_lab', null, 'Hi-Precision Diagnostics');
    expect(meta.tone).toBe('info');
    expect(meta.icon).toBe('hospital');
    expect(meta.label).toBe('External Lab · Hi-Precision Diagnostics');
  });

  test('resolves Uploaded by You badge for patient_uploaded provenance', () => {
    const meta = getProvenanceMeta('patient_uploaded');
    expect(meta.tone).toBe('neutral');
    expect(meta.icon).toBe('upload');
    expect(meta.label).toBe('Uploaded by You');
  });

  test('appends Outside facility attribution for patient uploaded records', () => {
    const meta = getProvenanceMeta('patient_uploaded', null, 'Barangay Health Center');
    expect(meta.tone).toBe('neutral');
    expect(meta.icon).toBe('upload');
    expect(meta.label).toBe('Outside · Barangay Health Center');
  });

  test('treats clinicId with non-patient_uploaded provenance as verified', () => {
    const meta = getProvenanceMeta(null, 'clinic-xyz');
    expect(meta.tone).toBe('primary');
    expect(meta.icon).toBe('checkCircle');
    expect(meta.label).toBe('ClinicEZ Verified');
  });
});

describe('Clinical Urgency Badges (getUrgencyMeta)', () => {
  test('maps STAT or critical urgency to danger tone with alert icon', () => {
    const metaStat = getUrgencyMeta('stat');
    expect(metaStat.tone).toBe('danger');
    expect(metaStat.icon).toBe('alert');
    expect(metaStat.label).toBe('Critical (STAT)');
    expect(metaStat.shouldDisplay).toBe(true);

    const metaCritical = getUrgencyMeta('critical');
    expect(metaCritical.tone).toBe('danger');
    expect(metaCritical.icon).toBe('alert');
    expect(metaCritical.label).toBe('Critical');
    expect(metaCritical.shouldDisplay).toBe(true);
  });

  test('maps isCritical === true to danger tone regardless of urgency string', () => {
    const meta = getUrgencyMeta('routine', true);
    expect(meta.tone).toBe('danger');
    expect(meta.icon).toBe('alert');
    expect(meta.shouldDisplay).toBe(true);
  });

  test('maps urgent urgency to urgent tone with warning icon', () => {
    const meta = getUrgencyMeta('urgent');
    expect(meta.tone).toBe('urgent');
    expect(meta.icon).toBe('warning');
    expect(meta.label).toBe('Urgent');
    expect(meta.shouldDisplay).toBe(true);
  });

  test('routine urgency is suppressed in dense lists by default', () => {
    const meta = getUrgencyMeta('routine');
    expect(meta.tone).toBe('routine');
    expect(meta.icon).toBe('info');
    expect(meta.label).toBe('Routine');
    expect(meta.shouldDisplay).toBe(false);
  });

  test('routine urgency displays when showRoutine is explicitly enabled', () => {
    const meta = getUrgencyMeta('routine', false, true);
    expect(meta.tone).toBe('routine');
    expect(meta.icon).toBe('info');
    expect(meta.label).toBe('Routine');
    expect(meta.shouldDisplay).toBe(true);
  });

  test('handles null, undefined or empty strings gracefully without crashing', () => {
    const metaNull = getUrgencyMeta(null);
    expect(metaNull.tone).toBe('routine');
    expect(metaNull.shouldDisplay).toBe(false);

    const metaEmpty = getUrgencyMeta('');
    expect(metaEmpty.tone).toBe('routine');
    expect(metaEmpty.shouldDisplay).toBe(false);
  });
});
