import type { File as ExpoFile } from 'expo-file-system';
import type { FileFolder } from '@db/schema/fileFolders';
import type { FileMetadata } from '@db/schema/filesMetadata';
import type { FileType } from '@db/schema/fileTypes';
import type { FileUploadConfig } from '@db/schema/fileUploadConfig';

export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_USER_QUOTA_BYTES = 500 * 1024 * 1024;

export type FilePreviewKind = 'image' | 'pdf' | 'external' | 'none';
export type FileSyncStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'failed' | 'deleted';
export type FileItemKind = 'file' | 'folder';

export interface FileBrowserFolder extends FileFolder {
  kind: 'folder';
  childCount: number;
}

export interface FileBrowserFile extends FileMetadata {
  kind: 'file';
  typeLabel: string;
  previewKind: FilePreviewKind;
}

export interface FileBrowserContents {
  breadcrumbs: FileFolder[];
  folders: FileBrowserFolder[];
  files: FileBrowserFile[];
  config: FileUploadConfig;
  fileTypes: FileType[];
  pendingSyncCount: number;
}

export interface PickedFileInput {
  file: ExpoFile;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ImportFilesInput {
  patientId: string;
  folderId?: string | null;
  fileTypeId?: string | null;
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
  quotaBytes?: number;
  usedStorageBytes?: number;
  nativePreviewExtensions?: string[];
  configVersion?: string;
  encryptedMak?: string;
  serverUpdatedAt?: number;
  fileTypes?: FileApiTypeResponse[];
}

export interface FileApiTypeResponse {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  supportedExtensions?: string[];
  supportedMimeTypes?: string[];
  nativePreviewKind?: FilePreviewKind;
  isActive?: boolean;
  sortOrder?: number;
  serverUpdatedAt?: number;
}

export interface FileUploadIntentResponse {
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
  cloudObjectKey?: string;
  serverFileId?: string;
  wrappedKeyJson?: string;
}

export interface SyncPendingFilesResult {
  synced: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}
