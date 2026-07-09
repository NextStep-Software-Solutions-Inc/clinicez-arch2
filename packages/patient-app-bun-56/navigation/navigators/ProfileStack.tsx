import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import ProfileScreen from '../screens/profile/Profile.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const ProfileStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    Profile: createNativeStackScreen({
      screen: ProfileScreen,
      options: {
        title: 'My Profile',
        headerLargeTitleEnabled: true,
        headerRight: () => <BottomTabsHeaderRight />,
      },
    }),
  },
});

export default ProfileStack;
