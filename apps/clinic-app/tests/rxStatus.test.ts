import { describe, expect, test } from 'bun:test';
import { describeRxStage, getRxStageChip } from '../services/rxStatus';

describe('getRxStageChip', () => {
  test('maps every stage to a label and tone', () => {
    expect(getRxStageChip('Issued')).toEqual({ label: 'Issued', tone: 'neutral' });
    expect(getRxStageChip('Accepted').tone).toBe('info');
    expect(getRxStageChip('PartiallyAccepted').tone).toBe('warning');
    expect(getRxStageChip('Rejected').tone).toBe('danger');
    expect(getRxStageChip('Dispensed').tone).toBe('success');
    expect(getRxStageChip('ExternalDispensed').tone).toBe('success');
  });

  test('an unknown stage from a newer server degrades to a neutral humanized label', () => {
    expect(getRxStageChip('OnHold')).toEqual({ label: 'On hold', tone: 'neutral' });
  });
});

describe('describeRxStage', () => {
  test('shows nothing until a pharmacy has reported', () => {
    expect(describeRxStage(null)).toBeNull();
    expect(describeRxStage(undefined)).toBeNull();
    expect(describeRxStage({ stage: 'Issued' })).toBeNull();
  });

  test('shows the stage, pharmacy, quote and rejection reason', () => {
    expect(
      describeRxStage({ stage: 'Rejected', pharmacyName: ' Botica Central ', quotedAmount: 320, reason: ' out of stock ' }),
    ).toEqual({
      chip: { label: 'Rejected by pharmacy', tone: 'danger' },
      pharmacyName: 'Botica Central',
      quote: 'PHP 320.00',
      reason: 'out of stock',
    });
  });

  test('a stage without quote or reason leaves them empty', () => {
    expect(describeRxStage({ stage: 'Accepted', pharmacyName: 'Botica Central', quotedAmount: null, reason: null })).toEqual({
      chip: { label: 'Accepted by pharmacy', tone: 'info' },
      pharmacyName: 'Botica Central',
      quote: null,
      reason: null,
    });
  });
});
