import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import HomeScreen from '../screens/Home.screen';
import PatientSearchScreen from '../screens/Search.screen';

const HomeStack = createNativeStackNavigator({
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
    PatientSearch: createNativeStackScreen({
      screen: PatientSearchScreen,
      options: {
        headerShown: false,
        animation: 'fade_from_bottom',
      },
    }),
  },
});

export default HomeStack;
