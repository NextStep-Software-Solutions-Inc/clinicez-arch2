import { describe, expect, test } from 'bun:test';
import { SHARING_SCOPE_KEYS } from '../services/api/wireEnums';
import {
  SHARING_SCOPES,
  countSelectedScopes,
  defaultScopeSelection,
  fromApiScopes,
  isSharingScope,
  scopeLabel,
  toApiScopes,
} from '../services/sharing/scopes';

describe('sharing scopes', () => {
  test('exposes the eight PascalCase API scopes', () => {
    expect([...SHARING_SCOPE_KEYS]).toEqual([
      'Demographics',
      'Allergies',
      'Medications',
      'Conditions',
      'Immunizations',
      'LabResults',
      'Prescriptions',
      'Vitals',
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
      'Demographics',
      'Allergies',
      'Medications',
      'Conditions',
    ]);
  });

  test('toApiScopes returns selected scopes in canonical order', () => {
    const selection = fromApiScopes(['Vitals', 'LabResults']);
    expect(toApiScopes(selection)).toEqual(['LabResults', 'Vitals']);
    expect(countSelectedScopes(selection)).toBe(2);
  });

  test('fromApiScopes ignores unknown names and round-trips known ones', () => {
    const selection = fromApiScopes(['Allergies', 'billing', 'allergies']);
    expect(toApiScopes(selection)).toEqual(['Allergies']);
    expect(toApiScopes(fromApiScopes([...SHARING_SCOPE_KEYS]))).toEqual([...SHARING_SCOPE_KEYS]);
  });

  test('empty selection maps to an empty API list', () => {
    expect(toApiScopes(fromApiScopes([]))).toEqual([]);
  });

  test('isSharingScope and scopeLabel handle unknown values', () => {
    expect(isSharingScope('Vitals')).toBe(true);
    expect(isSharingScope('billing')).toBe(false);
    expect(scopeLabel('billing')).toBe('billing');
    expect(scopeLabel('LabResults')).toBe('Lab results');
  });
});
