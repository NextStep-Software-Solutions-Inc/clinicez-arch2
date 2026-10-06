import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import HomeScreen from '../screens/Home.screen';

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
  },
});

export default HomeStackWeb;
