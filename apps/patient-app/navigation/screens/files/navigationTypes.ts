import type { StaticScreenProps } from '@react-navigation/native';

export type FilesStackParamList = {
  FilesBrowserScreen: { category?: string } | undefined;
  FilesUploadScreen: undefined;
  FileViewerScreen: { fileId: string };
  ExternalOpenConsentScreen: { fileId: string };
};

export type FilesScreenProps<RouteName extends keyof FilesStackParamList> =
  StaticScreenProps<FilesStackParamList[RouteName]>;
