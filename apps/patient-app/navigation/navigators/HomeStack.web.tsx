import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import HomeScreen from '../screens/Home.screen';
import DirectorySearchScreen from '../screens/Search.screen';

const HomeStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    Home: createNativeStackScreen({
      screen: HomeScreen,
      options: {
        headerShown: false,
      },
    }),
    DirectorySearch: createNativeStackScreen({
      screen: DirectorySearchScreen,
      options: {
        headerShown: false,
      },
    }),
  },
});

export default HomeStackWeb;
