import { storage } from '../../utils/storage';

export type RecordsSegmentIndex = 0 | 1;

let currentSegmentIndex: RecordsSegmentIndex = 0;
let currentClinicFilter: string = 'all';
let currentUploadCategory: string = 'all';

const STORAGE_KEYS = {
  SEGMENT: 'clinicez_records_segment',
  CLINIC_FILTER: 'clinicez_records_clinic_filter',
  UPLOAD_CATEGORY: 'clinicez_records_upload_category',
};

const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

// Synchronous initialization on Web
if (isWeb) {
  try {
    const savedSegment = window.localStorage.getItem(STORAGE_KEYS.SEGMENT);
    if (savedSegment === '1') currentSegmentIndex = 1;
    const savedUploadCat = window.localStorage.getItem(STORAGE_KEYS.UPLOAD_CATEGORY);
    if (savedUploadCat) currentUploadCategory = savedUploadCat;
    const savedClinicFilter = window.localStorage.getItem(STORAGE_KEYS.CLINIC_FILTER);
    if (savedClinicFilter) currentClinicFilter = savedClinicFilter;

    // Check URL parameters on web (?tab=uploads)
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab') || searchParams.get('segment');
    if (tabParam === 'uploads' || tabParam === '1') {
      currentSegmentIndex = 1;
    }
  } catch {
    // Non-fatal
  }
} else {
  // Asynchronous background hydration for native devices
  storage.getItemAsync(STORAGE_KEYS.SEGMENT).then((saved) => {
    if (saved === '1') currentSegmentIndex = 1;
  }).catch(() => {});

  storage.getItemAsync(STORAGE_KEYS.CLINIC_FILTER).then((saved) => {
    if (saved) currentClinicFilter = saved;
  }).catch(() => {});

  storage.getItemAsync(STORAGE_KEYS.UPLOAD_CATEGORY).then((saved) => {
    if (saved) currentUploadCategory = saved;
  }).catch(() => {});
}

export function getPersistedRecordsSegment(): RecordsSegmentIndex {
  return currentSegmentIndex;
}

export function setPersistedRecordsSegment(index: RecordsSegmentIndex): void {
  currentSegmentIndex = index;
  storage.setItemAsync(STORAGE_KEYS.SEGMENT, String(index)).catch(() => {});

  if (isWeb) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.SEGMENT, String(index));
      const url = new URL(window.location.href);
      if (index === 1) {
        url.searchParams.set('tab', 'uploads');
      } else {
        url.searchParams.delete('tab');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Non-fatal
    }
  }
}

export function getPersistedClinicFilter(): string {
  return currentClinicFilter;
}

export function setPersistedClinicFilter(filter: string): void {
  currentClinicFilter = filter;
  storage.setItemAsync(STORAGE_KEYS.CLINIC_FILTER, filter).catch(() => {});

  if (isWeb) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.CLINIC_FILTER, filter);
    } catch {
      // Non-fatal
    }
  }
}

export function getPersistedUploadCategory(): string {
  return currentUploadCategory;
}

export function setPersistedUploadCategory(category: string): void {
  currentUploadCategory = category;
  storage.setItemAsync(STORAGE_KEYS.UPLOAD_CATEGORY, category).catch(() => {});

  if (isWeb) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.UPLOAD_CATEGORY, category);
    } catch {
      // Non-fatal
    }
  }
}
