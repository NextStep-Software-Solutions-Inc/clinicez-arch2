import { describe, expect, test } from 'bun:test';
import React from 'react';
import { VercelInsights } from '../components/analytics/VercelInsights';

describe('VercelInsights component in patient-app', () => {
  test('returns null in native/test environment', () => {
    const result = VercelInsights();
    expect(result).toBeNull();
  });
});
