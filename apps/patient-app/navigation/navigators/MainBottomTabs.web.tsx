import React from 'react';
import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import WebNavBar from '../../components/ui/WebNavBar.web';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

const MainBottomTabsWeb = createBottomTabNavigator({
  tabBar: (props) => <WebNavBar {...props} />,
  screenOptions: {
    headerShown: false,
  },
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeStack,
      options: {
        title: 'Home',
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsStack,
      options: {
        title: 'Appointments',
      },
    }),
    MessagesScreen: createBottomTabScreen({
      screen: MessagesStack,
      options: {
        title: 'Messages',
      },
    }),
    FilesScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Records',
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileStack,
      options: {
        title: 'My Profile',
      },
    }),
  },
});

export default MainBottomTabsWeb;
