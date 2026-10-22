import type { File as ExpoFile } from 'expo-file-system';
import type { FileMetadata } from '@db/schema/filesMetadata';
import type { DocumentType } from '@db/schema/documentTypes';

export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export type FilePreviewKind = 'image' | 'pdf' | 'external' | 'none';
export type FileSyncStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'failed' | 'deleted';
export type FileItemKind = 'file';

export interface FileBrowserFile extends FileMetadata {
  kind: 'file';
  typeLabel: string;
  previewKind: FilePreviewKind;
}

export interface FileBrowserContents {
  files: FileBrowserFile[];
  documentTypes: DocumentType[];
  pendingSyncCount: number;
  maxFileSizeBytes?: number;
}

/**
 * Browser-side file handle (a DOM File/Blob with a name). Used by the web build, where
 * files come from <input type="file"> or drag & drop instead of expo-file-system.
 */
export interface WebPickedFile {
  name: string;
  size: number;
  type: string;
  uri?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type PickedFileSource = ExpoFile | WebPickedFile;

export interface PickedFileInput {
  file: PickedFileSource;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ImportFilesInput {
  patientId: string;
  documentTypeId?: string | null;
  files: PickedFileInput[];
  getToken?: () => Promise<string | null>;
}

export interface PreparedPreviewFile {
  uri: string;
  name: string;
  mimeType: string;
  extension: string;
  previewKind: FilePreviewKind;
}

export interface FileApiConfigResponse {
  maxFileSizeBytes?: number;
  nativePreviewExtensions?: string[];
  configVersion?: string;
  serverUpdatedAt?: number;
  documentTypes?: DocumentTypeResponse[];
}

export interface DocumentTypeResponse {
  id: string;
  code: string;
  label: string;
  description?: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  nativePreviewKind: string;
  sortOrder: number;
  isActive: boolean;
  serverUpdatedAt?: number;
}

export interface SyncPendingFilesResult {
  synced: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}
