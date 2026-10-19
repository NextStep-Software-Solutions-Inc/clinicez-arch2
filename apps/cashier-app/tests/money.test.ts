import { describe, expect, test } from 'bun:test';
import { changeDue, formatMoney, fromCents, parseAmount, parseAmountOrZero, toCents } from '../utils/money';

describe('money', () => {
  test('works in whole cents so sums never drift', () => {
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3));
    expect(fromCents(toCents(1250.5) + toCents(349.75))).toBe(1600.25);
  });

  test('parses typed amounts with at most two decimals', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount(' 99 ')).toBe(99);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  test('allows zero for floats and counts', () => {
    expect(parseAmountOrZero('0')).toBe(0);
    expect(parseAmountOrZero('1000.00')).toBe(1000);
    expect(parseAmountOrZero('x')).toBeNull();
  });

  test('change is never negative', () => {
    expect(changeDue(2100.25, 2200)).toBe(99.75);
    expect(changeDue(500, 500)).toBe(0);
    expect(changeDue(500, 100)).toBe(0);
  });

  test('formats pesos', () => {
    expect(formatMoney(1250.5)).toContain('1,250.50');
  });
});
