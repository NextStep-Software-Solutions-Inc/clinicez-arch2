import { describe, expect, test } from 'bun:test';
import {
  buildRedeemRequest,
  decidePoll,
  DEFAULT_SHARE_PURPOSE,
  describeShareStatus,
  isTerminalShareStatus,
  normalizeClinicEzId,
  normalizeShareCode,
  normalizeShareToken,
  parseSmartShareInput,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  scopeLabels,
} from '../services/shareImport';
import { formatDateTime, isPast } from '../utils/formatDateTime';

describe('normalizeShareToken', () => {
  test('returns a bare token unchanged', () => {
    expect(normalizeShareToken('abcDEF123_-xyz')).toBe('abcDEF123_-xyz');
  });

  test('strips the whitespace and newline a keyboard-wedge scanner appends', () => {
    expect(normalizeShareToken('  abcDEF123xyz\r\n')).toBe('abcDEF123xyz');
    expect(normalizeShareToken('abcDEF123xyz\t')).toBe('abcDEF123xyz');
  });

  test('extracts the token from a URL query or last path segment', () => {
    expect(normalizeShareToken('https://app.clinicez.ph/share?token=tok_12345678&x=1')).toBe('tok_12345678');
    expect(normalizeShareToken('https://app.clinicez.ph/s?shareToken=tok_12345678')).toBe('tok_12345678');
    expect(normalizeShareToken('https://app.clinicez.ph/share/tok_12345678/')).toBe('tok_12345678');
    expect(normalizeShareToken('clinicez://share/tok_12345678')).toBe('tok_12345678');
  });

  test('extracts the token from a JSON payload', () => {
    expect(normalizeShareToken('{"shareToken":"tok_12345678","v":1}')).toBe('tok_12345678');
    expect(normalizeShareToken('{"token":"tok_12345678"}')).toBe('tok_12345678');
  });

  test('rejects empty, too short, too long or whitespace-containing input', () => {
    expect(normalizeShareToken('')).toBeNull();
    expect(normalizeShareToken('   ')).toBeNull();
    expect(normalizeShareToken(null)).toBeNull();
    expect(normalizeShareToken(undefined)).toBeNull();
    expect(normalizeShareToken('short')).toBeNull();
    expect(normalizeShareToken('two words here 12345')).toBeNull();
    expect(normalizeShareToken('x'.repeat(2000))).toBeNull();
    expect(normalizeShareToken('{"nothing":"here"}')).toBeNull();
  });

  test('rejects 8-character codes and ClinicEZ IDs without dots from masquerading as tokens', () => {
    expect(normalizeShareToken('ABCD-EFGH')).toBeNull();
    expect(normalizeShareToken('ABCDEFGH')).toBeNull();
    expect(normalizeShareToken('ce-1234-5678')).toBeNull();
    expect(normalizeShareToken('CE-ABCD-1234')).toBeNull();
  });
});

describe('normalizeClinicEzId', () => {
  test('canonicalizes standard ClinicEZ IDs', () => {
    expect(normalizeClinicEzId('CE-ABCD-1234')).toBe('CE-ABCD-1234');
    expect(normalizeClinicEzId('ce-abcd-1234')).toBe('CE-ABCD-1234');
    expect(normalizeClinicEzId('ce abcd 1234')).toBe('CE-ABCD-1234');
    expect(normalizeClinicEzId('ceabcd1234')).toBe('CE-ABCD-1234');
  });

  test('canonicalizes IDs without CE prefix if 8 characters', () => {
    expect(normalizeClinicEzId('ABCD-1234')).toBe('CE-ABCD-1234');
    expect(normalizeClinicEzId('abcd1234')).toBe('CE-ABCD-1234');
  });

  test('rejects invalid or incomplete ClinicEZ IDs', () => {
    expect(normalizeClinicEzId(null)).toBeNull();
    expect(normalizeClinicEzId(undefined)).toBeNull();
    expect(normalizeClinicEzId('')).toBeNull();
    expect(normalizeClinicEzId('CE-123')).toBeNull();
    expect(normalizeClinicEzId('CE-TOO-LONG-123456')).toBeNull();
  });
});

describe('normalizeShareCode', () => {
  test('canonicalizes 8-character share codes', () => {
    expect(normalizeShareCode('ABCD-EFGH')).toBe('ABCD-EFGH');
    expect(normalizeShareCode('abcd-efgh')).toBe('ABCD-EFGH');
    expect(normalizeShareCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(normalizeShareCode('abcd efgh')).toBe('ABCD-EFGH');
  });

  test('rejects invalid share codes', () => {
    expect(normalizeShareCode(null)).toBeNull();
    expect(normalizeShareCode(undefined)).toBeNull();
    expect(normalizeShareCode('')).toBeNull();
    expect(normalizeShareCode('ABC')).toBeNull();
    expect(normalizeShareCode('ABCDEFGHIJKL')).toBeNull();
  });
});

describe('parseSmartShareInput', () => {
  test('parses labeled patient-app copy string', () => {
    const parsed = parseSmartShareInput('ClinicEZ ID: CE-ABCD-1234 | Code: WXYZ-5678');
    expect(parsed).toEqual({
      clinicEzId: 'CE-ABCD-1234',
      code: 'WXYZ-5678',
    });
  });

  test('parses multi-line or comma-separated pairs', () => {
    expect(parseSmartShareInput('CE-ABCD-1234, WXYZ-5678')).toEqual({
      clinicEzId: 'CE-ABCD-1234',
      code: 'WXYZ-5678',
    });
    expect(parseSmartShareInput('CE-ABCD-1234\nWXYZ-5678')).toEqual({
      clinicEzId: 'CE-ABCD-1234',
      code: 'WXYZ-5678',
    });
    expect(parseSmartShareInput('WXYZ-5678 CE-ABCD-1234')).toEqual({
      clinicEzId: 'CE-ABCD-1234',
      code: 'WXYZ-5678',
    });
  });

  test('parses single ID or single Code', () => {
    expect(parseSmartShareInput('CE-ABCD-1234')).toEqual({ clinicEzId: 'CE-ABCD-1234' });
    expect(parseSmartShareInput('WXYZ-5678')).toEqual({ code: 'WXYZ-5678' });
  });

  test('parses token URLs or bare tokens', () => {
    expect(parseSmartShareInput('https://app.clinicez.ph/share?token=tok_12345678')).toEqual({
      token: 'tok_12345678',
    });
    expect(parseSmartShareInput('tok_12345678')).toEqual({
      token: 'tok_12345678',
    });
  });

  test('returns null for empty or invalid input', () => {
    expect(parseSmartShareInput(null)).toBeNull();
    expect(parseSmartShareInput('')).toBeNull();
    expect(parseSmartShareInput('???')).toBeNull();
  });
});

describe('buildRedeemRequest', () => {
  test('defaults the purpose and keeps the chief complaint only when queuing in token mode', () => {
    expect(buildRedeemRequest({ mode: 'token', token: 'tok_12345678', purpose: '  ', addToQueue: true, chiefComplaint: ' cough ' })).toEqual({
      ok: true,
      request: { shareToken: 'tok_12345678', purpose: DEFAULT_SHARE_PURPOSE, addToQueue: true, chiefComplaint: 'cough' },
    });
    expect(buildRedeemRequest({ mode: 'token', token: 'tok_12345678', purpose: 'Follow-up', addToQueue: false, chiefComplaint: 'cough' })).toEqual({
      ok: true,
      request: { shareToken: 'tok_12345678', purpose: 'Follow-up', addToQueue: false },
    });
  });

  test('omits a blank chief complaint', () => {
    const result = buildRedeemRequest({ token: 'tok_12345678', purpose: '', addToQueue: true, chiefComplaint: '  ' });
    expect(result.ok && 'chiefComplaint' in result.request).toBe(false);
  });

  test('fails with a message for an unusable token', () => {
    const result = buildRedeemRequest({ token: 'nope', purpose: '', addToQueue: true, chiefComplaint: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  test('builds request in code mode with valid clinicEzId and code', () => {
    const result = buildRedeemRequest({
      mode: 'code',
      clinicEzId: 'ce-abcd-1234',
      code: 'wxyz-5678',
      purpose: 'Consultation',
      addToQueue: true,
      chiefComplaint: 'fever',
    });
    expect(result).toEqual({
      ok: true,
      request: {
        clinicEzId: 'CE-ABCD-1234',
        code: 'WXYZ-5678',
        purpose: 'Consultation',
        addToQueue: true,
        chiefComplaint: 'fever',
      },
    });
  });

  test('validates errors in code mode', () => {
    expect(buildRedeemRequest({ mode: 'code', clinicEzId: '', code: '', purpose: '', addToQueue: false, chiefComplaint: '' })).toEqual({
      ok: false,
      error: "Enter the patient's ClinicEZ ID and one-time code.",
    });
    expect(buildRedeemRequest({ mode: 'code', clinicEzId: 'bad', code: 'WXYZ-5678', purpose: '', addToQueue: false, chiefComplaint: '' })).toEqual({
      ok: false,
      error: 'Enter a valid ClinicEZ ID (e.g. CE-ABCD-1234).',
    });
    expect(buildRedeemRequest({ mode: 'code', clinicEzId: 'CE-ABCD-1234', code: 'bad', purpose: '', addToQueue: false, chiefComplaint: '' })).toEqual({
      ok: false,
      error: 'Enter a valid 8-character one-time code (e.g. ABCD-EFGH).',
    });
  });
});

describe('polling decisions', () => {
  test('polls every ~2 seconds and gives up after ~60 seconds', () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(POLL_TIMEOUT_MS).toBe(60_000);
  });

  test('terminal statuses stop polling immediately', () => {
    for (const status of ['Imported', 'Denied', 'Failed']) {
      expect(isTerminalShareStatus(status)).toBe(true);
      expect(decidePoll(status, 0)).toBe('stop');
      expect(decidePoll(status, POLL_TIMEOUT_MS + 1)).toBe('stop');
    }
  });

  test('pending continues until the timeout, then times out', () => {
    expect(isTerminalShareStatus('Pending')).toBe(false);
    expect(decidePoll('Pending', 0)).toBe('continue');
    expect(decidePoll('Pending', POLL_TIMEOUT_MS - 1)).toBe('continue');
    expect(decidePoll('Pending', POLL_TIMEOUT_MS)).toBe('timeout');
  });

  test('a failed poll request (no status) keeps trying until the timeout', () => {
    expect(decidePoll(null, 4000)).toBe('continue');
    expect(decidePoll(null, POLL_TIMEOUT_MS)).toBe('timeout');
  });
});

describe('scopeLabels', () => {
  test('humanizes scope flag names and de-duplicates', () => {
    expect(scopeLabels(['Demographics', 'LabResults', 'Vitals', 'LabResults'])).toEqual([
      'Demographics',
      'Lab results',
      'Vitals',
    ]);
  });

  test('splits comma-joined flag strings and tolerates empty input', () => {
    expect(scopeLabels(['Allergies, Medications'])).toEqual(['Allergies', 'Medications']);
    expect(scopeLabels([])).toEqual([]);
    expect(scopeLabels(null)).toEqual([]);
  });

  test('unknown scopes are humanized', () => {
    expect(scopeLabels(['DentalRecords'])).toEqual(['Dental records']);
  });
});

describe('describeShareStatus', () => {
  test('imported is a success', () => {
    expect(describeShareStatus({ status: 'Imported' })).toEqual({
      title: 'Patient imported',
      tone: 'success',
      detail: null,
    });
  });

  test('denied and failed surface the server reason, with fallbacks', () => {
    expect(describeShareStatus({ status: 'Denied', denialReason: ' Token expired ' })).toMatchObject({
      tone: 'danger',
      detail: 'Token expired',
    });
    expect(describeShareStatus({ status: 'Denied', denialReason: null }).detail).toBeTruthy();
    expect(describeShareStatus({ status: 'Failed', denialReason: 'Hub unavailable' }).detail).toBe('Hub unavailable');
    expect(describeShareStatus({ status: 'Failed' }).detail).toBeTruthy();
  });

  test('pending is informational', () => {
    expect(describeShareStatus({ status: 'Pending' }).tone).toBe('info');
  });
});

describe('date helpers', () => {
  test('formatDateTime returns a placeholder for missing or invalid input', () => {
    expect(formatDateTime(null)).toBe('--');
    expect(formatDateTime(undefined)).toBe('--');
    expect(formatDateTime('not a date')).toBe('--');
    expect(formatDateTime('2026-01-15T08:30:00Z')).not.toBe('--');
  });

  test('isPast compares against the supplied clock and ignores missing values', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(isPast('2026-05-31T23:59:59Z', now)).toBe(true);
    expect(isPast('2026-06-01T00:00:01Z', now)).toBe(false);
    expect(isPast(null, now)).toBe(false);
    expect(isPast('garbage', now)).toBe(false);
  });
});
