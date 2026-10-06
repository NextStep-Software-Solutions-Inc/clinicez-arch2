import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import FilesScreen from '../screens/files/Files.screen';
import FilesUploadScreen from '../screens/files/FilesUpload.screen';
import FileFolderFormScreen from '../screens/files/FileFolderForm.screen';
import FileMoveScreen from '../screens/files/FileMove.screen';
import FileViewerScreen from '../screens/files/FileViewer.screen';
import ExternalOpenConsentScreen from '../screens/files/ExternalOpenConsent.screen';
import StorageScreen from '../screens/files/Storage.screen';
import FRKSetupScreen from '../screens/files/FRKSetup.screen';
import FRKEntryScreen from '../screens/files/FRKEntry.screen';

const FilesStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    FilesBrowserScreen: createNativeStackScreen({
      screen: FilesScreen,
      options: {
        headerShown: false,
      },
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
        headerShown: false,
      },
    }),
    FileMoveScreen: createNativeStackScreen({
      screen: FileMoveScreen,
      options: {
        title: 'Move',
        presentation: 'formSheet',
      },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerShown: false },
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

export default FilesStackWeb;
