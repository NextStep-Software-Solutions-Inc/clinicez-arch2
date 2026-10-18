import { describe, expect, test } from 'bun:test';
import {
  belongsInReviewFilter,
  canReviewResult,
  describeLabOrderStage,
  formatFileSize,
  formatQuote,
  getResultProvenance,
  getStageChip,
  humanizeEnum,
  resultOriginName,
  validateReviewDecision,
} from '../services/labResultReview';
import type { LabOrderStage } from '../services/clinicService';

describe('getResultProvenance', () => {
  test('Clinic EZ lab results are verified with a success tone', () => {
    expect(getResultProvenance('ClinicEzLab', 'Verified')).toEqual({
      sourceLabel: 'Clinic EZ Lab',
      verificationLabel: 'Verified',
      tone: 'success',
    });
  });

  test('external lab and patient uploads are unverified warnings', () => {
    expect(getResultProvenance('ExternalLab', 'Unverified')).toEqual({
      sourceLabel: 'External lab',
      verificationLabel: 'Unverified',
      tone: 'warning',
    });
    expect(getResultProvenance('PatientUploaded', 'Unverified')).toEqual({
      sourceLabel: 'Patient uploaded',
      verificationLabel: 'Unverified',
      tone: 'warning',
    });
  });

  test('rejected results are danger regardless of source', () => {
    for (const source of ['ClinicEzLab', 'ExternalLab', 'PatientUploaded']) {
      const result = getResultProvenance(source, 'Rejected');
      expect(result.tone).toBe('danger');
      expect(result.verificationLabel).toBe('Rejected');
    }
  });

  test('an accepted external result becomes verified', () => {
    const result = getResultProvenance('ExternalLab', 'Verified');
    expect(result.sourceLabel).toBe('External lab');
    expect(result.tone).toBe('success');
  });

  test('unknown values degrade gracefully instead of throwing', () => {
    expect(getResultProvenance('FaxMachine', 'Pending')).toEqual({
      sourceLabel: 'Fax machine',
      verificationLabel: 'Unverified',
      tone: 'warning',
    });
  });
});

describe('humanizeEnum', () => {
  test('splits PascalCase and handles empty input', () => {
    expect(humanizeEnum('LabResults')).toBe('Lab results');
    expect(humanizeEnum('in_process')).toBe('In process');
    expect(humanizeEnum('')).toBe('Unknown');
    expect(humanizeEnum(null)).toBe('Unknown');
  });
});

describe('canReviewResult', () => {
  test('only unverified non-ClinicEZ results can be reviewed', () => {
    expect(canReviewResult({ source: 'ExternalLab', verificationState: 'Unverified' })).toBe(true);
    expect(canReviewResult({ source: 'PatientUploaded', verificationState: 'Unverified' })).toBe(true);
    expect(canReviewResult({ source: 'ClinicEzLab', verificationState: 'Unverified' })).toBe(false);
    expect(canReviewResult({ source: 'ExternalLab', verificationState: 'Verified' })).toBe(false);
    expect(canReviewResult({ source: 'ExternalLab', verificationState: 'Rejected' })).toBe(false);
  });
});

describe('validateReviewDecision', () => {
  test('reject requires non-blank remarks', () => {
    expect(validateReviewDecision(false, '').ok).toBe(false);
    expect(validateReviewDecision(false, '   \n').ok).toBe(false);
    expect(validateReviewDecision(false, 'Wrong patient')).toEqual({ ok: true, remarks: 'Wrong patient' });
  });

  test('accept remarks are optional and trimmed', () => {
    expect(validateReviewDecision(true, '')).toEqual({ ok: true });
    expect(validateReviewDecision(true, '  looks fine ')).toEqual({ ok: true, remarks: 'looks fine' });
  });
});

describe('belongsInReviewFilter', () => {
  test('an item leaves the Unverified list once its state changes', () => {
    expect(belongsInReviewFilter({ verificationState: 'Verified' }, 'Unverified')).toBe(false);
    expect(belongsInReviewFilter({ verificationState: 'Unverified' }, 'Unverified')).toBe(true);
  });
});

describe('resultOriginName', () => {
  test('prefers the lab name, with a source-specific fallback', () => {
    expect(resultOriginName({ source: 'ExternalLab', externalLabName: ' Hi-Precision ' })).toBe('Hi-Precision');
    expect(resultOriginName({ source: 'ExternalLab', externalLabName: null })).toBe('Unnamed laboratory');
    expect(resultOriginName({ source: 'PatientUploaded', externalLabName: undefined })).toBe('Uploaded by patient');
    expect(resultOriginName({ source: 'ClinicEzLab', externalLabName: null })).toBe('Clinic EZ Lab');
  });
});

describe('formatFileSize', () => {
  test('formats bytes, KB and MB; blank for missing values', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(-1)).toBe('');
  });
});

describe('getStageChip', () => {
  test('maps every stage to the agreed tone', () => {
    const expected: Record<LabOrderStage, string> = {
      Issued: 'neutral',
      Routed: 'neutral',
      Claimed: 'neutral',
      AwaitingPayment: 'warning',
      Paid: 'info',
      SpecimenCollected: 'info',
      InProcess: 'info',
      ResultFinalized: 'accent',
      ExternalSubmitted: 'accent',
      Reviewed: 'success',
      Rejected: 'danger',
      Cancelled: 'danger',
    };
    for (const [stage, tone] of Object.entries(expected)) {
      const chip = getStageChip(stage);
      expect(chip.tone).toBe(tone as typeof chip.tone);
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });

  test('an unknown stage from a newer server is neutral with a readable label', () => {
    expect(getStageChip('PendingCourier')).toEqual({ label: 'Pending courier', tone: 'neutral' });
  });
});

describe('formatQuote', () => {
  test('formats amount with currency code and two decimals', () => {
    expect(formatQuote(1250, 'php')).toBe('PHP 1,250.00');
    expect(formatQuote(99.5, null)).toBe('99.50');
  });

  test('no quote when the amount is missing or not finite', () => {
    expect(formatQuote(null, 'PHP')).toBeNull();
    expect(formatQuote(undefined, 'PHP')).toBeNull();
    expect(formatQuote(Number.NaN, 'PHP')).toBeNull();
  });
});

describe('describeLabOrderStage', () => {
  test('legacy orders without a stage render no chip', () => {
    expect(describeLabOrderStage({})).toBeNull();
  });

  test('awaiting payment shows the quote only when payment is required', () => {
    const base = { stage: 'AwaitingPayment' as const, quotedAmount: 800, quotedCurrency: 'PHP', laboratoryName: ' Medilab ' };
    expect(describeLabOrderStage({ ...base, paymentRequired: true })).toEqual({
      chip: { label: 'Awaiting payment', tone: 'warning' },
      quote: 'PHP 800.00',
      laboratoryName: 'Medilab',
      reason: null,
    });
    expect(describeLabOrderStage({ ...base, paymentRequired: false })?.quote).toBeNull();
  });

  test('other stages never show a quote and surface the stage reason', () => {
    const result = describeLabOrderStage({
      stage: 'Rejected',
      stageReason: ' Sample hemolyzed ',
      quotedAmount: 800,
      quotedCurrency: 'PHP',
      paymentRequired: true,
      laboratoryName: null,
    });
    expect(result?.quote).toBeNull();
    expect(result?.laboratoryName).toBeNull();
    expect(result?.reason).toBe('Sample hemolyzed');
    expect(result?.chip.tone).toBe('danger');
  });
});
