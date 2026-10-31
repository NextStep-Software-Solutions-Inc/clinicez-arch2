import { describe, expect, test, mock } from 'bun:test';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
}));

const {
  getPersistedRecordsSegment,
  setPersistedRecordsSegment,
  getPersistedClinicFilter,
  setPersistedClinicFilter,
  getPersistedUploadCategory,
  setPersistedUploadCategory,
} = await import('../services/records/recordsTabStore');

describe('Records Tab & Filter Persistence Store', () => {
  test('persists segment selection across accessors', () => {
    setPersistedRecordsSegment(1);
    expect(getPersistedRecordsSegment()).toBe(1);

    setPersistedRecordsSegment(0);
    expect(getPersistedRecordsSegment()).toBe(0);
  });

  test('persists clinic filter across accessors', () => {
    setPersistedClinicFilter('prescriptions');
    expect(getPersistedClinicFilter()).toBe('prescriptions');

    setPersistedClinicFilter('all');
    expect(getPersistedClinicFilter()).toBe('all');
  });

  test('persists upload category filter across accessors', () => {
    setPersistedUploadCategory('lab_results');
    expect(getPersistedUploadCategory()).toBe('lab_results');

    setPersistedUploadCategory('certificates');
    expect(getPersistedUploadCategory()).toBe('certificates');
  });
});
