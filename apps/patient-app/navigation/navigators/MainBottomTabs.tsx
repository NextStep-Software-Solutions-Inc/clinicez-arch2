import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppIcon } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

const getTabIcon = (androidName: string, iosName: string, webName: string) => {
  if (Platform.OS === 'web') {
    return ({ color, size }: { color: string; size: number }) => (
      <AppIcon name={webName} color={color} size={size} />
    );
  }
  return Platform.select({
    android: { type: 'materialSymbol', name: androidName },
    ios: { type: 'sfSymbol', name: iosName },
  }) as any;
};

const MainBottomTabs = createBottomTabNavigator({
  screenOptions: {
    animation: 'shift',
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeStack,
      options: {
        title: 'Home',
        tabBarIcon: getTabIcon('home', 'house.fill', 'home'),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'My Appointments',
        tabBarIcon: getTabIcon('heart_check', 'heart.fill', 'heart_check'),
      },
    }),
    FilesScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'My Files',
        tabBarIcon: getTabIcon('files', 'doc.fill', 'files'),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
        tabBarIcon: getTabIcon('person', 'person.fill', 'person'),
      },
    }),
  },
});

export default MainBottomTabs;
