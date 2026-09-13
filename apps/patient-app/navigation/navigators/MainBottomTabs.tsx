import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

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
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'home' },
          ios: { type: 'sfSymbol', name: 'house.fill' },
        }),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'My Appointments',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'heart_check' },
          ios: { type: 'sfSymbol', name: 'heart.fill' },
        }),
      },
    }),
    FilesScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'My Files',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'files' },
          ios: { type: 'sfSymbol', name: 'doc.fill' },
        }),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'person' },
          ios: { type: 'sfSymbol', name: 'person.fill' },
        }),
      },
    }),
  },
});

export default MainBottomTabs;
