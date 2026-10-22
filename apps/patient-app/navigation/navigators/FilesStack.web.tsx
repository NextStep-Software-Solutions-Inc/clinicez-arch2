import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import FilesScreen from '../screens/files/Files.screen';
import FilesUploadScreen from '../screens/files/FilesUpload.screen';
import FileViewerScreen from '../screens/files/FileViewer.screen';
import ExternalOpenConsentScreen from '../screens/files/ExternalOpenConsent.screen';

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
        title: 'Health Records & Documents',
      },
    }),
    FilesUploadScreen: createNativeStackScreen({
      screen: FilesUploadScreen,
      options: { title: 'Add Health Record', headerShown: false },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerShown: false },
    }),
    ExternalOpenConsentScreen: createNativeStackScreen({
      screen: ExternalOpenConsentScreen,
      options: { title: 'Open in Another App', headerShown: false },
    }),
  },
});

export default FilesStackWeb;
