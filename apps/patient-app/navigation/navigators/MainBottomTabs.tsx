import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { ColorValue, Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppIcon } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

const getTabIcon = (androidName: string, iosName: string, webName: string) => {
  if (Platform.OS === 'web') {
    return ({ color, size }: { color: ColorValue; size: number }) => (
      <AppIcon name={webName} color={color} size={size} />
    );
  }
  return Platform.select({
    android: { type: 'materialSymbol', name: androidName },
    ios: { type: 'sfSymbol', name: iosName },
  }) as any;
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
        tabBarIcon: getTabIcon('home', 'house.fill', 'home'),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'My Appointments',
        tabBarIcon: getTabIcon('heart_check', 'heart.fill', 'appointments'),
      },
    }),
    MessagesScreen: createBottomTabScreen({
      screen: MessagesStack,
      options: {
        title: 'Messages',
        tabBarIcon: getTabIcon('chat', 'bubble.left.and.bubble.right.fill', 'chat'),
      },
    }),
    RecordsScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Records',
        tabBarIcon: getTabIcon('files', 'doc.fill', 'files'),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
        tabBarIcon: getTabIcon('person', 'person.fill', 'profile'),
      },
    }),
  },
});

export default MainBottomTabs;
