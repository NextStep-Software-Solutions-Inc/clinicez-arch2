import { describe, expect, test } from 'bun:test';
import { selectLibrarySource } from '../services/catalogSource';

const lib = (hash: string) => ({
  library: 'lib_icd',
  kitVersion: '2025.01',
  itemCount: 10,
  activeCount: 10,
  contentHash: hash,
  loadedAt: '2026-01-01T00:00:00Z',
  source: 'Seed',
});
const cached = (hash: string) => ({ contentHash: hash, kitVersion: '2025.01', items: [] });

describe('selectLibrarySource', () => {
  test('serves the cached copy when the server is unreachable', () => {
    expect(selectLibrarySource(cached('a'), null, 'lib_icd').kind).toBe('cache');
  });

  test('is unavailable with no server and no cache', () => {
    expect(selectLibrarySource(null, null, 'lib_icd').kind).toBe('unavailable');
  });

  test('uses the cache while its content hash is current', () => {
    expect(selectLibrarySource(cached('a'), [lib('a')], 'lib_icd').kind).toBe('cache');
  });

  test('refetches when the server content changed', () => {
    expect(selectLibrarySource(cached('a'), [lib('b')], 'lib_icd').kind).toBe('fetch');
  });

  test('fetches when nothing is cached yet', () => {
    expect(selectLibrarySource(null, [lib('a')], 'lib_icd').kind).toBe('fetch');
  });

  test('is unavailable for a library the server does not know', () => {
    expect(selectLibrarySource(null, [lib('a')], 'lib_nope').kind).toBe('unavailable');
  });
});
