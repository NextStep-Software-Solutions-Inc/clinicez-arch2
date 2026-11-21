import React from 'react';
import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import WebNavBar from '../../components/ui/WebNavBar.web';

import HomeStack from './HomeStack';
import FilesStack from './FilesStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';

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
    RecordsScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Records',
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
  },
});

export default MainBottomTabsWeb;
