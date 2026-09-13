import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import FilesScreen from '../screens/files/Files.screen';
import FilesUploadScreen from '../screens/files/FilesUpload.screen';
import FileFolderFormScreen from '../screens/files/FileFolderForm.screen';
import FileMoveScreen from '../screens/files/FileMove.screen';
import FileViewerScreen from '../screens/files/FileViewer.screen';
import ExternalOpenConsentScreen from '../screens/files/ExternalOpenConsent.screen';
import StorageScreen from '../screens/files/Storage.screen';
import FRKSetupScreen from '../screens/files/FRKSetup.screen';
import FRKEntryScreen from '../screens/files/FRKEntry.screen';

const FilesStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    FilesBrowserScreen: createNativeStackScreen({
      screen: FilesScreen,
      options: { title: 'Files', headerLargeTitleEnabled: true },
    }),
    FilesUploadScreen: createNativeStackScreen({
      screen: FilesUploadScreen,
      options: { title: 'Add File', presentation: 'modal' },
    }),
    StorageScreen: createNativeStackScreen({
      screen: StorageScreen,
      options: { title: 'Storage', presentation: 'modal' },
    }),
    FileFolderFormScreen: createNativeStackScreen({
      screen: FileFolderFormScreen,
      options: {
        title: 'Folder',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.65],
        sheetGrabberVisible: true,
        sheetCornerRadius: 20,
        headerShown: false,
      },
    }),
    FileMoveScreen: createNativeStackScreen({
      screen: FileMoveScreen,
      options: {
        title: 'Move',
        presentation: 'formSheet',
        sheetGrabberVisible: true,
        sheetAllowedDetents: [0.5, 1.0],
        sheetCornerRadius: 20,
      },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerLargeTitleEnabled: false },
    }),
    ExternalOpenConsentScreen: createNativeStackScreen({
      screen: ExternalOpenConsentScreen,
      options: { title: 'Open in Another App', presentation: 'modal' },
    }),
    FRKSetupScreen: createNativeStackScreen({
      screen: FRKSetupScreen,
      options: { title: 'Recovery Key', presentation: 'modal' },
    }),
    FRKEntryScreen: createNativeStackScreen({
      screen: FRKEntryScreen,
      options: { title: 'Unlock', presentation: 'modal' },
    }),
  },
});

export default FilesStack;
