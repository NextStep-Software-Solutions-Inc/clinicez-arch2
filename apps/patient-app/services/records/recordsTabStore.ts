import {
  getPersistedTab,
  setPersistedTab,
  type TabPersistenceConfig,
} from '../tabs/tabPersistence';

export type RecordsSegmentIndex = 0 | 1;

export const RECORDS_SEGMENT_CONFIG: TabPersistenceConfig<RecordsSegmentIndex> = {
  key: 'records.segment',
  defaultValue: 0,
  queryParam: 'tab',
  serialize: (val) => (val === 1 ? 'uploads' : 'clinic'),
  deserialize: (raw) => (raw === 'uploads' || raw === '1' ? 1 : 0),
};

export const RECORDS_CLINIC_FILTER_CONFIG: TabPersistenceConfig<string> = {
  key: 'records.clinic_filter',
  defaultValue: 'all',
  queryParam: 'clinic_filter',
};

export const RECORDS_UPLOAD_CATEGORY_CONFIG: TabPersistenceConfig<string> = {
  key: 'records.upload_category',
  defaultValue: 'all',
  queryParam: 'category',
};

export function getPersistedRecordsSegment(): RecordsSegmentIndex {
  return getPersistedTab(RECORDS_SEGMENT_CONFIG);
}

export function setPersistedRecordsSegment(index: RecordsSegmentIndex): void {
  setPersistedTab(RECORDS_SEGMENT_CONFIG, index);
}

export function getPersistedClinicFilter(): string {
  return getPersistedTab(RECORDS_CLINIC_FILTER_CONFIG);
}

export function setPersistedClinicFilter(filter: string): void {
  setPersistedTab(RECORDS_CLINIC_FILTER_CONFIG, filter);
}

export function getPersistedUploadCategory(): string {
  return getPersistedTab(RECORDS_UPLOAD_CATEGORY_CONFIG);
}

export function setPersistedUploadCategory(category: string): void {
  setPersistedTab(RECORDS_UPLOAD_CATEGORY_CONFIG, category);
}
