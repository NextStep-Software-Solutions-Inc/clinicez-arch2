import type { IconName } from '../../components/ui/iconNames';

export type CategoryFilterId =
  | 'all'
  | 'lab_results'
  | 'prescriptions'
  | 'lab_requests'
  | 'certificates'
  | 'outside_uploads';

export interface CategoryFilterOption {
  id: CategoryFilterId;
  label: string;
  icon: IconName;
}

export const CATEGORY_FILTERS: readonly CategoryFilterOption[] = [
  { id: 'all', label: 'All', icon: 'document' },
  { id: 'lab_results', label: 'Lab Results', icon: 'lab' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'pill' },
  { id: 'lab_requests', label: 'Lab Requests', icon: 'clipboard' },
  { id: 'certificates', label: 'Certificates', icon: 'badge' },
  { id: 'outside_uploads', label: 'Outside Uploads', icon: 'upload' },
] as const;

export type ClinicalRecordDomain =
  | 'lab_results'
  | 'prescriptions'
  | 'lab_requests'
  | 'certificates'
  | 'other';

export interface CategorizableRecord {
  id?: string;
  category?: string | null;
  documentTypeId?: string | null;
  type?: string | null;
  typeLabel?: string | null;
  provenance?: 'clinicez_verified' | 'external_lab' | 'patient_uploaded' | string | null;
  clinicId?: string | null;
  title?: string | null;
  name?: string | null;
  fileName?: string | null;
  facilityName?: string | null;
  notes?: string | null;
  documentDate?: string | Date | null;
  createdAt?: string | Date | number | null;
  sizeBytes?: number | null;
  [key: string]: any;
}

/**
 * Deterministically resolves a record's clinical domain category.
 */
export function resolveRecordDomain(record: CategorizableRecord): ClinicalRecordDomain {
  const cat = (record.category ?? '').toLowerCase().replace(/[-_\s]/g, '');
  const typeCode = (record.type ?? '').toLowerCase().replace(/[-_\s]/g, '');
  const typeLabel = (record.typeLabel ?? '').toLowerCase().replace(/[-_\s]/g, '');
  const docId = (record.documentTypeId ?? '').toLowerCase();

  // Lab Results & Imaging
  if (
    cat.includes('labresult') ||
    cat.includes('imaging') ||
    cat.includes('xray') ||
    typeCode.includes('labresult') ||
    typeCode.includes('xray') ||
    typeLabel.includes('labresult') ||
    typeLabel.includes('xray') ||
    docId.includes('lab-result') ||
    docId.includes('xray') ||
    docId === '22222222-2222-2222-2222-222222222222' ||
    docId === '11111111-1111-1111-1111-111111111111'
  ) {
    return 'lab_results';
  }

  // Prescriptions
  if (
    cat.includes('prescription') ||
    typeCode.includes('prescription') ||
    typeLabel.includes('prescription') ||
    docId.includes('prescription') ||
    docId === '44444444-4444-4444-4444-444444444444'
  ) {
    return 'prescriptions';
  }

  // Lab Requests / Requisitions
  if (
    cat.includes('labrequest') ||
    cat.includes('requisition') ||
    typeCode.includes('labrequest') ||
    typeCode.includes('requisition') ||
    typeLabel.includes('labrequest') ||
    typeLabel.includes('requisition') ||
    docId.includes('lab-request')
  ) {
    return 'lab_requests';
  }

  // Certificates & Vaccine Cards
  if (
    cat.includes('certificate') ||
    cat.includes('vaccine') ||
    typeCode.includes('certificate') ||
    typeCode.includes('vaccine') ||
    typeLabel.includes('certificate') ||
    typeLabel.includes('vaccine') ||
    docId.includes('medical-certificate') ||
    docId === '33333333-3333-3333-3333-333333333333'
  ) {
    return 'certificates';
  }

  return 'other';
}

/**
 * Evaluates whether a record matches the selected category filter pill.
 */
export function matchesCategoryFilter(
  record: CategorizableRecord,
  filterId: CategoryFilterId
): boolean {
  if (filterId === 'all') {
    return true;
  }

  if (filterId === 'outside_uploads') {
    return (
      record.provenance === 'patient_uploaded' ||
      record.provenance === 'external_lab' ||
      record.category === 'other' ||
      (!record.clinicId && record.provenance !== 'clinicez_verified')
    );
  }

  const domain = resolveRecordDomain(record);
  return domain === filterId;
}

/**
 * Pure helper for filtering and searching records across multiple fields:
 * title, name, fileName, facilityName, typeLabel, and notes.
 */
export function filterAndSearchRecords<T extends CategorizableRecord>(
  records: T[],
  filterId: CategoryFilterId,
  searchQuery: string = ''
): T[] {
  const query = searchQuery.trim().toLowerCase();

  return records.filter((record) => {
    if (!matchesCategoryFilter(record, filterId)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const title = (record.title ?? '').toLowerCase();
    const name = (record.name ?? record.fileName ?? '').toLowerCase();
    const facilityName = (record.facilityName ?? '').toLowerCase();
    const typeLabel = (record.typeLabel ?? '').toLowerCase();
    const notes = (record.notes ?? '').toLowerCase();

    return (
      title.includes(query) ||
      name.includes(query) ||
      facilityName.includes(query) ||
      typeLabel.includes(query) ||
      notes.includes(query)
    );
  });
}

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'urgent'
  | 'routine';

export interface ProvenanceMeta {
  label: string;
  tone: BadgeTone;
  icon: IconName;
}

/**
 * Pure metadata resolver for record provenance.
 */
export function getProvenanceMeta(
  provenance?: string | null,
  clinicId?: string | null,
  facilityName?: string | null
): ProvenanceMeta {
  const isVerified =
    provenance === 'clinicez_verified' ||
    Boolean(clinicId && provenance !== 'patient_uploaded');

  if (isVerified) {
    return {
      label: facilityName ? `Verified · ${facilityName}` : 'ClinicEZ Verified',
      tone: 'primary',
      icon: 'checkCircle',
    };
  }

  if (provenance === 'external_lab') {
    return {
      label: facilityName ? `External Lab · ${facilityName}` : 'External Lab',
      tone: 'info',
      icon: 'hospital',
    };
  }

  return {
    label: facilityName ? `Outside · ${facilityName}` : 'Uploaded by You',
    tone: 'neutral',
    icon: 'upload',
  };
}

export interface UrgencyMeta {
  label: string;
  tone: BadgeTone;
  icon: IconName;
  shouldDisplay: boolean;
}

/**
 * Pure metadata resolver for clinical urgency visual encoding.
 */
export function getUrgencyMeta(
  urgency?: string | null,
  isCritical?: boolean | null,
  showRoutine = false
): UrgencyMeta {
  const norm = (urgency ?? '').toLowerCase();

  if (isCritical || norm === 'stat' || norm === 'critical') {
    return {
      label: norm === 'stat' ? 'Critical (STAT)' : 'Critical',
      tone: 'danger',
      icon: 'alert',
      shouldDisplay: true,
    };
  }

  if (norm === 'urgent') {
    return {
      label: 'Urgent',
      tone: 'urgent',
      icon: 'warning',
      shouldDisplay: true,
    };
  }

  return {
    label: 'Routine',
    tone: 'routine',
    icon: 'info',
    shouldDisplay: showRoutine,
  };
}

/**
 * Sanitizes an uploaded file name into a clean clinical record title.
 */
export function sanitizeTitleFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const withSpaces = baseName.replace(/[_\-.]+/g, ' ');
  return withSpaces.trim().replace(/\s+/g, ' ').slice(0, 200) || 'Medical Record';
}

