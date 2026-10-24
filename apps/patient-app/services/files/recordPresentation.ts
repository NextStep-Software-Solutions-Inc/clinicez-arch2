import { getProvenanceMeta } from '../records/categories';
import type { IconName } from '../../components/ui/iconNames';
import type { ColorToken } from '../../constants/theme';
import { extensionFromMime, extensionFromName, normalizeExtension } from './filesShared';

export interface SyncStatusMeta {
  dotColor: ColorToken;
  haloColor: ColorToken;
  accessibilityLabel: string;
}

export function getSyncStatusDotMeta(status: string | null | undefined): SyncStatusMeta {
  switch (status) {
    case 'synced':
      return {
        dotColor: 'success',
        haloColor: 'successBg',
        accessibilityLabel: 'Backed up',
      };
    case 'failed':
      return {
        dotColor: 'emergency',
        haloColor: 'emergencyBg',
        accessibilityLabel: 'Sync error',
      };
    case 'syncing':
      return {
        dotColor: 'info',
        haloColor: 'infoBg',
        accessibilityLabel: 'Syncing',
      };
    default:
      return {
        dotColor: 'warning',
        haloColor: 'warningBg',
        accessibilityLabel: 'On device',
      };
  }
}

export interface RecordNameFields {
  name?: string | null;
  fileName?: string | null;
  title?: string | null;
  extension?: string | null;
  mimeType?: string | null;
}

export interface RecordTimestampFields {
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
  uploadedAt?: Date | string | number | null;
  documentDate?: string | null;
}

export interface RecordProvenanceFields {
  provenance?: string | null;
  clinicId?: string | null;
  facilityName?: string | null;
}

export interface ProvenanceIconMeta {
  icon: IconName;
  colorToken: ColorToken;
  accessibilityLabel: string;
}

/**
 * Formats a record's primary display name as `Filename.ext`, guaranteeing the
 * file extension is visible whenever known.
 */
export function formatRecordFileName(record: RecordNameFields | null | undefined): string {
  if (!record) return 'Record';

  const rawName =
    record.name?.trim() ||
    record.fileName?.trim() ||
    record.title?.trim() ||
    'Record';

  const existingExt = extensionFromName(rawName);
  if (existingExt) {
    return rawName;
  }

  const fallbackExt =
    normalizeExtension(record.extension) ||
    extensionFromName(record.fileName ?? '') ||
    extensionFromName(record.name ?? '') ||
    extensionFromMime(record.mimeType ?? '');

  if (fallbackExt) {
    return `${rawName}.${fallbackExt}`;
  }

  return rawName;
}

/**
 * Middle-truncates very long base filenames while preserving the `.ext` suffix
 * so compact mobile headers never clip the file extension or `(Category)` suffix.
 */
export function compactFileNameMiddle(fileName: string, maxChars = 22): string {
  const trimmed = fileName.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const ext = extensionFromName(trimmed);
  if (!ext) {
    const keepStart = Math.max(6, maxChars - 5);
    return `${trimmed.slice(0, keepStart)}…${trimmed.slice(-4)}`;
  }

  const suffix = `.${ext}`;
  const base = trimmed.slice(0, trimmed.length - suffix.length);
  const availableForBase = maxChars - suffix.length - 1; // 1 char for '…'
  if (availableForBase <= 6 || base.length <= availableForBase + 1) {
    return trimmed;
  }

  const tailChars = Math.min(4, Math.floor(availableForBase / 3));
  const headChars = Math.max(4, availableForBase - tailChars);
  return `${base.slice(0, headChars)}…${base.slice(-tailChars)}${suffix}`;
}

/**
 * Normalizes category labels to clean Title Case (e.g. `Medical certificate` -> `Medical Certificate`)
 * while preserving acronyms (`Government ID`, `X-ray`).
 */
export function formatCategoryTitleCase(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;

  return trimmed
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Formats the FileViewer top navigation header title as:
 * `Filename.png (Medical Certificate)`
 */
export function formatViewerHeaderTitle(
  record: RecordNameFields | null | undefined,
  categoryLabel?: string | null,
  options?: { maxFileNameChars?: number }
): string {
  const fullFileName = formatRecordFileName(record);
  const displayFileName = compactFileNameMiddle(fullFileName, options?.maxFileNameChars ?? 22);
  const cleanCategory = formatCategoryTitleCase(categoryLabel);

  if (!cleanCategory) {
    return displayFileName;
  }

  return `${displayFileName} (${cleanCategory})`;
}

function parseTimestampValue(raw: Date | string | number | null | undefined): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'number') {
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a record's timestamp for list subtitles and the viewer header subtitle.
 */
export function formatRecordTimestamp(record: RecordTimestampFields | null | undefined): string {
  if (!record) return '';

  const timestampDate =
    parseTimestampValue(record.createdAt) ??
    parseTimestampValue(record.uploadedAt) ??
    parseTimestampValue(record.updatedAt);

  if (timestampDate) {
    const datePart = timestampDate.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = timestampDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${datePart}, ${timePart}`;
  }

  if (record.documentDate) {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(record.documentDate.trim());
    if (isoMatch) {
      const localDate = new Date(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3])
      );
      if (!Number.isNaN(localDate.getTime())) {
        return localDate.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return record.documentDate;
  }

  return '';
}

/**
 * Resolves icon-only provenance metadata (no pill text) for compact record rows.
 */
export function getProvenanceIndicatorMeta(
  record: RecordProvenanceFields | null | undefined
): ProvenanceIconMeta {
  const meta = getProvenanceMeta(
    record?.provenance,
    record?.clinicId,
    record?.facilityName
  );

  const colorToken: ColorToken =
    meta.tone === 'primary'
      ? 'primary'
      : meta.tone === 'info'
        ? 'info'
        : 'textMuted';

  return {
    icon: meta.icon,
    colorToken,
    accessibilityLabel: meta.label,
  };
}
