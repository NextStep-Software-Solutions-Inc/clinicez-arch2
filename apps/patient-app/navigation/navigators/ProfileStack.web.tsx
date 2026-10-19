import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/profile/Profile.screen';

const ProfileStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    Profile: createNativeStackScreen({
      screen: ProfileScreen,
      options: {
        headerShown: false,
      },
    }),
  },
});

export default ProfileStackWeb;
