import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { ColorValue } from 'react-native';
import { AppIcon, type IconName } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

const getTabIcon = (iconName: IconName) => {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <AppIcon name={iconName} color={color} size={size} />
  );
};

const MainBottomTabs = createBottomTabNavigator({
  // Custom implementation enables React element icons (Lucide) across all platforms
  // and eliminates native tab bar restrictions/crashes.
  implementation: 'custom',
  screenOptions: ({ theme }) => ({
    animation: 'shift',
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.text,
    tabBarStyle: {
      backgroundColor: theme.colors.card,
      borderTopColor: theme.colors.border,
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
