import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { ColorValue, Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppIcon, type IconName } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

interface TabIconDefinition {
  android: 'home' | 'favorite' | 'chat_bubble' | 'description' | 'person';
  ios: 'house.fill' | 'heart.fill' | 'bubble.left.and.bubble.right.fill' | 'doc.fill' | 'person.fill';
  web: IconName;
}

const getTabIcon = ({ android, ios, web }: TabIconDefinition) => {
  if (Platform.OS === 'web') {
    return ({ color, size }: { color: ColorValue; size: number }) => (
      <AppIcon name={web} color={color} size={size} />
    );
  }

  if (Platform.OS === 'ios') {
    return {
      type: 'sfSymbol' as const,
      name: ios,
    };
  }

  return {
    type: 'materialSymbol' as const,
    name: android,
    variant: 'rounded' as const,
  };
};

const MainBottomTabs = createBottomTabNavigator({
  // Native implementation delivers:
  // - Android: 100% native Material 3 BottomNavigationView with active pill indicator & ripple
  // - iOS: 100% native UITabBar with SF Symbols & Liquid Glass translucency
  // - Web: JavaScript tab bar with crisp Lucide icons
  screenOptions: ({ theme }) => ({
    animation: 'shift',
    tabBarActiveTintColor: theme.colors.primary,
    tabBarActiveIndicatorColor:
      typeof theme.colors.primary === 'string' ? `${theme.colors.primary}26` : undefined,
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported && Platform.OS === 'ios' ? 'transparent' : undefined,
    },
  }),
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeStack,
      options: {
        title: 'Home',
        tabBarIcon: getTabIcon({
          android: 'home',
          ios: 'house.fill',
          web: 'home',
        }),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'My Appointments',
        tabBarIcon: getTabIcon({
          android: 'favorite',
          ios: 'heart.fill',
          web: 'appointments',
        }),
      },
    }),
    MessagesScreen: createBottomTabScreen({
      screen: MessagesStack,
      options: {
        title: 'Messages',
        tabBarIcon: getTabIcon({
          android: 'chat_bubble',
          ios: 'bubble.left.and.bubble.right.fill',
          web: 'chat',
        }),
      },
    }),
    RecordsScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Records',
        tabBarIcon: getTabIcon({
          android: 'description',
          ios: 'doc.fill',
          web: 'files',
        }),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
        tabBarIcon: getTabIcon({
          android: 'person',
          ios: 'person.fill',
          web: 'profile',
        }),
      },
    }),
  },
});

export default MainBottomTabs;
