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
    animation: 'none',
  },
  screens: {
    FilesBrowserScreen: createNativeStackScreen({
      screen: FilesScreen,
      options: {
        headerShown: false,
        title: 'Files',
      },
    }),
    FilesUploadScreen: createNativeStackScreen({
      screen: FilesUploadScreen,
      options: { title: 'Add File', headerShown: false },
    }),
    StorageScreen: createNativeStackScreen({
      screen: StorageScreen,
      options: { title: 'Storage', headerShown: false },
    }),
    FileFolderFormScreen: createNativeStackScreen({
      screen: FileFolderFormScreen,
      options: {
        title: 'Folder',
        headerShown: false,
      },
    }),
    FileMoveScreen: createNativeStackScreen({
      screen: FileMoveScreen,
      options: {
        title: 'Move',
        headerShown: false,
      },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerShown: false },
    }),
    ExternalOpenConsentScreen: createNativeStackScreen({
      screen: ExternalOpenConsentScreen,
      options: { title: 'Open in Another App', headerShown: false },
    }),
    FRKSetupScreen: createNativeStackScreen({
      screen: FRKSetupScreen,
      options: { title: 'Recovery Key', headerShown: false },
    }),
    FRKEntryScreen: createNativeStackScreen({
      screen: FRKEntryScreen,
      options: { title: 'Unlock', headerShown: false },
    }),
  },
});

export default FilesStackWeb;
