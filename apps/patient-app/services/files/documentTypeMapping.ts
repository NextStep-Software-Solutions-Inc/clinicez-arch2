import type { ColorToken } from '../../constants/theme';
import type { IconName } from '../../components/ui/iconNames';
import type { HealthRecordCategory } from '../../db/schema/localHealthRecords';

/**
 * Fallback DocumentType UUIDs matching initial EF Core seed in DocumentTypeConfiguration.cs.
 * Used only as cold-start offline fallback before `GET /api/v1/document-types` is synced into SQLite.
 */
export const DOCUMENT_TYPE_IDS = {
  xray: '11111111-1111-1111-1111-111111111111',
  labResult: '22222222-2222-2222-2222-222222222222',
  medicalCertificate: '33333333-3333-3333-3333-333333333333',
  prescription: '44444444-4444-4444-4444-444444444444',
  governmentId: '55555555-5555-5555-5555-555555555555',
  other: '66666666-6666-6666-6666-666666666666',
} as const;

export interface DocumentTypeLike {
  id: string;
  code: string;
  label: string;
  isActive?: boolean;
  supportedExtensionsJson?: string;
  supportedMimeTypesJson?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
}

function normalizeCodeKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Expands a category slug or code into candidate DocumentType.code values in priority order.
 */
function candidateCodesForSlug(raw?: string | null): string[] {
  const norm = normalizeCodeKey(raw);
  if (!norm) return [];

  switch (norm) {
    case 'imaging':
    case 'xray':
    case 'x-ray':
    case 'file-type-xray':
      return ['xray', 'x-ray', 'imaging'];
    case 'lab-result':
    case 'lab-results':
    case 'file-type-lab-result':
      return ['lab-result', 'lab-results', 'lab'];
    case 'certificate':
    case 'certificates':
    case 'medical-certificate':
    case 'file-type-medical-certificate':
      return ['medical-certificate', 'certificate'];
    case 'prescription':
    case 'prescriptions':
    case 'file-type-prescription':
      return ['prescription', 'prescriptions'];
    case 'vaccine-card':
    case 'vaccine':
    case 'immunization':
      return ['vaccine-card', 'immunization', 'vaccine', 'other'];
    case 'id':
    case 'government-id':
    case 'file-type-id':
      return ['id', 'government-id'];
    case 'other':
    case 'file-type-other':
      return ['other'];
    default:
      return [norm];
  }
}

function mapSlugToSeedDocumentTypeId(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isUuid(trimmed)) return trimmed.toLowerCase();

  const normalized = normalizeCodeKey(trimmed);
  switch (normalized) {
    case 'imaging':
    case 'xray':
    case 'x-ray':
    case 'file-type-xray':
      return DOCUMENT_TYPE_IDS.xray;
    case 'lab-result':
    case 'lab-results':
    case 'file-type-lab-result':
      return DOCUMENT_TYPE_IDS.labResult;
    case 'certificate':
    case 'certificates':
    case 'medical-certificate':
    case 'file-type-medical-certificate':
      return DOCUMENT_TYPE_IDS.medicalCertificate;
    case 'prescription':
    case 'prescriptions':
    case 'file-type-prescription':
      return DOCUMENT_TYPE_IDS.prescription;
    case 'id':
    case 'government-id':
    case 'file-type-id':
      return DOCUMENT_TYPE_IDS.governmentId;
    case 'vaccine-card':
    case 'other':
    case 'file-type-other':
      return DOCUMENT_TYPE_IDS.other;
    default:
      return null;
  }
}

function getCatalogFromSqlite(): DocumentTypeLike[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@db/index');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { documentTypes } = require('@db/schema/documentTypes');
    const db = dbModule.originalDb ?? dbModule.db;
    if (db && typeof db.select === 'function') {
      const rows = db.select().from(documentTypes).all?.();
      if (Array.isArray(rows) && rows.length > 0) {
        return rows;
      }
    }
  } catch {
    // Non-fatal if DB not yet loaded or in mock environments
  }
  return [];
}

/**
 * Resolves a category slug, code, or UUID against the locally synced backend `document_types` catalog first,
 * falling back to canonical seed UUIDs only when no catalog rows exist yet.
 */
export function resolveDocumentTypeId(
  categoryOrId?: string | null,
  fallbackCategory?: string | null,
  catalog?: readonly DocumentTypeLike[]
): string {
  const resolvedCatalog = (catalog && catalog.length > 0) ? catalog : getCatalogFromSqlite();
  const activeCatalog = resolvedCatalog.filter((t) => t.isActive !== false);
  const allCatalog = resolvedCatalog;

  if (allCatalog.length > 0) {
    for (const candidateInput of [categoryOrId, fallbackCategory]) {
      if (!candidateInput) continue;
      const trimmed = candidateInput.trim();
      if (!trimmed) continue;

      // 1. Direct UUID / ID match in synced backend catalog
      const byId = allCatalog.find((t) => t.id.toLowerCase() === trimmed.toLowerCase());
      if (byId) return byId.id;

      // 2. Match by code / alias against active backend catalog rows
      const codes = candidateCodesForSlug(trimmed);
      for (const code of codes) {
        const byCode =
          activeCatalog.find((t) => normalizeCodeKey(t.code) === code) ??
          allCatalog.find((t) => normalizeCodeKey(t.code) === code);
        if (byCode) return byCode.id;
      }

      // 3. Match by label against active backend catalog rows
      const normLabel = normalizeCodeKey(trimmed);
      const byLabel = activeCatalog.find((t) => normalizeCodeKey(t.label) === normLabel);
      if (byLabel) return byLabel.id;
    }

    // If caller passed an explicit UUID not yet in local cache, preserve it
    if (isUuid(categoryOrId)) {
      return categoryOrId!.trim().toLowerCase();
    }

    // Otherwise fall back to the backend's 'other' row or first active row
    const fallbackRow =
      activeCatalog.find((t) => normalizeCodeKey(t.code) === 'other') ??
      activeCatalog[0] ??
      allCatalog[0];
    if (fallbackRow) return fallbackRow.id;
  }

  return (
    mapSlugToSeedDocumentTypeId(categoryOrId) ??
    mapSlugToSeedDocumentTypeId(fallbackCategory) ??
    DOCUMENT_TYPE_IDS.other
  );
}

/**
 * Infers the local HealthRecordCategory enum value from a backend DocumentType.
 */
export function inferCategoryFromDocumentType(
  docType?: Pick<DocumentTypeLike, 'code' | 'label'> | null
): HealthRecordCategory {
  if (!docType) return 'other';
  const combined = `${docType.code} ${docType.label}`.toLowerCase();

  if (combined.includes('lab')) return 'lab_result';
  if (combined.includes('xray') || combined.includes('x-ray') || combined.includes('imaging') || combined.includes('radiology') || combined.includes('ultrasound') || combined.includes('scan')) {
    return 'imaging';
  }
  if (combined.includes('prescription') || combined.includes('rx')) return 'prescription';
  if (combined.includes('vaccine') || combined.includes('immunization')) return 'vaccine_card';
  if (combined.includes('certificate') || combined.includes('clearance')) return 'certificate';
  return 'other';
}

/**
 * Maps a backend DocumentType to ClinicEZ design-system icon and semantic color tokens.
 */
export function getDocumentTypeVisualMeta(
  docType?: Pick<DocumentTypeLike, 'code' | 'label'> | null
): { icon: IconName; colorToken: ColorToken } {
  const combined = `${docType?.code ?? ''} ${docType?.label ?? ''}`.toLowerCase();

  if (combined.includes('lab')) {
    return { icon: 'lab', colorToken: 'success' };
  }
  if (combined.includes('xray') || combined.includes('x-ray') || combined.includes('imaging') || combined.includes('radiology') || combined.includes('scan')) {
    return { icon: 'activity', colorToken: 'info' };
  }
  if (combined.includes('prescription') || combined.includes('rx')) {
    return { icon: 'pill', colorToken: 'emergency' };
  }
  if (combined.includes('vaccine') || combined.includes('immunization') || combined === 'id' || combined.startsWith('id ') || combined.includes('government id')) {
    return { icon: 'badge', colorToken: 'purple' };
  }
  if (combined.includes('certificate') || combined.includes('clearance')) {
    return { icon: 'document', colorToken: 'warning' };
  }
  return { icon: 'folder', colorToken: 'textSecondary' };
}

/**
 * Infers the best matching active backend DocumentType from a picked filename.
 */
export function inferDocumentTypeFromFileName<T extends DocumentTypeLike>(
  fileName: string,
  documentTypes: readonly T[]
): T | null {
  if (!documentTypes.length) return null;
  const lower = fileName.toLowerCase();

  let targetSlug: string | null = null;
  if (lower.includes('cbc') || lower.includes('urinalysis') || lower.includes('blood') || lower.includes('lab')) {
    targetSlug = 'lab-result';
  } else if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('cxr') || lower.includes('mri') || lower.includes('scan') || lower.includes('ultrasound')) {
    targetSlug = 'xray';
  } else if (lower.includes('rx') || lower.includes('prescription')) {
    targetSlug = 'prescription';
  } else if (lower.includes('vaccine') || lower.includes('immunization') || lower.includes('vax')) {
    targetSlug = 'vaccine-card';
  } else if (lower.includes('cert') || lower.includes('clearance') || lower.includes('fit-to-work')) {
    targetSlug = 'medical-certificate';
  } else if (lower.includes('passport') || lower.includes('philhealth') || lower.includes('license') || /\bid\b/.test(lower)) {
    targetSlug = 'id';
  }

  if (!targetSlug) return null;

  const candidates = candidateCodesForSlug(targetSlug);
  for (const code of candidates) {
    if (code === 'other' && targetSlug === 'vaccine-card') {
      // Only fall back to 'other' for vaccine cards if no dedicated vaccine type exists on backend
      const dedicated = documentTypes.find((t) => {
        const text = `${t.code} ${t.label}`.toLowerCase();
        return text.includes('vaccine') || text.includes('immunization');
      });
      if (dedicated) return dedicated;
    }
    const found = documentTypes.find((t) => normalizeCodeKey(t.code) === code);
    if (found) return found;
  }

  return null;
}

/**
 * Resolves a human-readable clinical label for a record category slug or DocumentType UUID.
 */
export function formatRecordCategoryLabel(
  categoryOrType?: string | null,
  catalog?: readonly DocumentTypeLike[]
): string | null {
  if (!categoryOrType) return null;
  const trimmed = categoryOrType.trim();
  if (!trimmed) return null;

  if (catalog && catalog.length > 0) {
    const byId = catalog.find((t) => t.id.toLowerCase() === trimmed.toLowerCase());
    if (byId) return byId.label;
    const normCode = normalizeCodeKey(trimmed);
    const byCode = catalog.find((t) => normalizeCodeKey(t.code) === normCode);
    if (byCode) return byCode.label;
  }

  const lower = trimmed.toLowerCase();
  if (lower === DOCUMENT_TYPE_IDS.xray) return 'X-ray';
  if (lower === DOCUMENT_TYPE_IDS.labResult) return 'Lab result';
  if (lower === DOCUMENT_TYPE_IDS.medicalCertificate) return 'Medical certificate';
  if (lower === DOCUMENT_TYPE_IDS.prescription) return 'Prescription';
  if (lower === DOCUMENT_TYPE_IDS.governmentId) return 'Government ID';
  if (lower === DOCUMENT_TYPE_IDS.other) return 'Other medical file';

  const normalized = normalizeCodeKey(lower);
  switch (normalized) {
    case 'lab-result':
    case 'lab-results':
    case 'file-type-lab-result':
      return 'Lab Result';
    case 'imaging':
      return 'Imaging / X-Ray';
    case 'xray':
    case 'x-ray':
    case 'file-type-xray':
      return 'X-ray';
    case 'prescription':
    case 'prescriptions':
    case 'file-type-prescription':
      return 'Prescription';
    case 'vaccine-card':
      return 'Vaccine Card';
    case 'certificate':
    case 'certificates':
    case 'medical-certificate':
    case 'file-type-medical-certificate':
      return 'Medical Certificate';
    case 'id':
    case 'government-id':
    case 'file-type-id':
      return 'Government ID';
    case 'other':
    case 'file-type-other':
      return 'Other Medical File';
    default:
      return null;
  }
}
