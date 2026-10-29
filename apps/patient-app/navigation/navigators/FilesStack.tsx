import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import RecordsScreen from '../screens/records/Records.screen';
import FilesUploadScreen from '../screens/files/FilesUpload.screen';
import FileViewerScreen from '../screens/files/FileViewer.screen';
import ExternalOpenConsentScreen from '../screens/files/ExternalOpenConsent.screen';

const FilesStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    FilesBrowserScreen: createNativeStackScreen({
      screen: RecordsScreen,
      options: { title: 'Health Records & Documents', headerLargeTitleEnabled: true },
    }),
    FilesUploadScreen: createNativeStackScreen({
      screen: FilesUploadScreen,
      options: { title: 'Add Health Record', presentation: 'modal' },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerLargeTitleEnabled: false },
    }),
    ExternalOpenConsentScreen: createNativeStackScreen({
      screen: ExternalOpenConsentScreen,
      options: { title: 'Open in Another App', presentation: 'modal' },
    }),
  },
});

export default FilesStack;
