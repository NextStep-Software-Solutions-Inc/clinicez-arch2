import type { StaticScreenProps } from '@react-navigation/native';
import type { FileItemKind } from '../../../services/files';

export type FilesStackParamList = {
  FilesBrowserScreen: { folderId?: string } | undefined;
  FilesUploadScreen: { folderId?: string | null };
  FileFolderFormScreen: { parentId?: string | null; folderId?: string };
  FileMoveScreen: {
    itemKind: FileItemKind;
    itemId: string;
    currentFolderId?: string | null;
  };
  FileViewerScreen: { fileId: string };
  ExternalOpenConsentScreen: { fileId: string };
  StorageScreen: { folderId?: string | null } | undefined;
  FRKSetupScreen: { frk: string };
  FRKEntryScreen: { encryptedMAK: string };
};

export type FilesScreenProps<RouteName extends keyof FilesStackParamList> =
  StaticScreenProps<FilesStackParamList[RouteName]>;
