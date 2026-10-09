import { describe, expect, test } from 'bun:test';
import {
  buildRedeemRequest,
  decidePoll,
  DEFAULT_SHARE_PURPOSE,
  describeShareStatus,
  isTerminalShareStatus,
  normalizeShareToken,
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
});

describe('buildRedeemRequest', () => {
  test('defaults the purpose and keeps the chief complaint only when queuing', () => {
    expect(buildRedeemRequest({ token: 'tok_12345678', purpose: '  ', addToQueue: true, chiefComplaint: ' cough ' })).toEqual({
      ok: true,
      request: { shareToken: 'tok_12345678', purpose: DEFAULT_SHARE_PURPOSE, addToQueue: true, chiefComplaint: 'cough' },
    });
    expect(buildRedeemRequest({ token: 'tok_12345678', purpose: 'Follow-up', addToQueue: false, chiefComplaint: 'cough' })).toEqual({
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
