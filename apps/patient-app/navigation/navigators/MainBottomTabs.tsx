import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { ColorValue, Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppIcon } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

const getTabIcon = (iconName: string) => {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <AppIcon name={iconName} color={color} size={size} />
  );
};

const MainBottomTabs = createBottomTabNavigator({
  // Brand-tinted native tabs (replaces the Android Material You / system accent).
  screenOptions: ({ theme }) => ({
    animation: 'shift',
    tabBarActiveTintColor: theme.colors.primary,
    tabBarActiveIndicatorColor: `26`,
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  }),
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeStack,
      options: {
        title: 'Home',
        tabBarIcon: getTabIcon('home'),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'My Appointments',
        tabBarIcon: getTabIcon('appointments'),
      },
    }),
    MessagesScreen: createBottomTabScreen({
      screen: MessagesStack,
      options: {
        title: 'Messages',
        tabBarIcon: getTabIcon('chat'),
      },
    }),
    RecordsScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Records',
        tabBarIcon: getTabIcon('files'),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
        tabBarIcon: getTabIcon('profile'),
      },
    }),
  },
});

export default MainBottomTabs;
