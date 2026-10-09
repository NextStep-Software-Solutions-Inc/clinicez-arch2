import { describe, expect, test } from 'bun:test';
import {
  SHARING_SCOPES,
  SHARING_SCOPE_KEYS,
  countSelectedScopes,
  defaultScopeSelection,
  fromApiScopes,
  isSharingScope,
  scopeLabel,
  toApiScopes,
} from '../services/sharing/scopes';

describe('sharing scopes', () => {
  test('exposes the eight camelCase API scopes', () => {
    expect([...SHARING_SCOPE_KEYS]).toEqual([
      'demographics',
      'allergies',
      'medications',
      'conditions',
      'immunizations',
      'labResults',
      'prescriptions',
      'vitals',
    ]);
    expect(SHARING_SCOPES.map((scope) => scope.key)).toEqual([...SHARING_SCOPE_KEYS]);
  });

  test('every scope has a label and an explanation', () => {
    for (const scope of SHARING_SCOPES) {
      expect(scope.label.length).toBeGreaterThan(0);
      expect(scope.description.length).toBeGreaterThan(0);
    }
  });

  test('defaults enable the core safety scopes only', () => {
    expect(toApiScopes(defaultScopeSelection())).toEqual([
      'demographics',
      'allergies',
      'medications',
      'conditions',
    ]);
  });

  test('toApiScopes returns selected scopes in canonical order', () => {
    const selection = fromApiScopes(['vitals', 'labResults']);
    expect(toApiScopes(selection)).toEqual(['labResults', 'vitals']);
    expect(countSelectedScopes(selection)).toBe(2);
  });

  test('fromApiScopes ignores unknown names and round-trips known ones', () => {
    const selection = fromApiScopes(['allergies', 'billing', 'ALLERGIES']);
    expect(toApiScopes(selection)).toEqual(['allergies']);
    expect(toApiScopes(fromApiScopes([...SHARING_SCOPE_KEYS]))).toEqual([...SHARING_SCOPE_KEYS]);
  });

  test('empty selection maps to an empty API list', () => {
    expect(toApiScopes(fromApiScopes([]))).toEqual([]);
  });

  test('isSharingScope and scopeLabel handle unknown values', () => {
    expect(isSharingScope('vitals')).toBe(true);
    expect(isSharingScope('billing')).toBe(false);
    expect(scopeLabel('billing')).toBe('billing');
    expect(scopeLabel('labResults')).toBe('Lab results');
  });
});
