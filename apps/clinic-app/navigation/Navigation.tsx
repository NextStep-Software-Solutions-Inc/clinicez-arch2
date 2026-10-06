import React from 'react';
import { Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import ThemedText from '../components/ui/ThemedText';
import { theme } from '../constants/theme';
import DashboardScreen from './screens/Dashboard.screen';
import PatientsScreen from './screens/Patients.screen';
import ConsultationsScreen from './screens/Consultations.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import BillingScreen from './screens/Billing.screen';
import YakapScreen from './screens/Yakap.screen';
import SettingsScreen from './screens/Settings.screen';

const Tab = createBottomTabNavigator({
  screenOptions: () => {
    const isDesktop = Dimensions.get('window').width >= theme.breakpoints.tablet;
    return {
      headerShown: false,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarStyle: {
        display: isDesktop ? 'none' : 'flex',
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.borderLight,
        height: 60,
        paddingBottom: 8,
        paddingTop: 6,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '600',
      },
    };
  },
  screens: {
    Dashboard: {
      screen: DashboardScreen,
      linking: {
        path: 'dashboard',
        alias: [''],
      },
      options: {
        title: 'Dashboard',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>📊</ThemedText>,
      },
    },
    Patients: {
      screen: PatientsScreen,
      linking: 'patients',
      options: {
        title: 'Patients',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>👥</ThemedText>,
      },
    },
    Consultations: {
      screen: ConsultationsScreen,
      linking: 'consultations',
      options: {
        title: 'Consultations',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>🩺</ThemedText>,
      },
    },
    Appointments: {
      screen: AppointmentsScreen,
      linking: 'appointments',
      options: {
        title: 'Appointments',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>📅</ThemedText>,
      },
    },
    Billing: {
      screen: BillingScreen,
      linking: 'billing',
      options: {
        title: 'Billing',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>💳</ThemedText>,
      },
    },
    Yakap: {
      screen: YakapScreen,
      linking: 'yakap',
      options: {
        title: 'PhilHealth Desk',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>🛡️</ThemedText>,
      },
    },
    Settings: {
      screen: SettingsScreen,
      linking: 'settings',
      options: {
        title: 'Settings',
        tabBarIcon: () => <ThemedText style={{ fontSize: 20 }}>⚙️</ThemedText>,
      },
    },
  },
});

export type RootTabParamList = StaticParamList<typeof Tab>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}

export const linkingOptions = {
  enabled: 'auto' as const,
  prefixes: [
    'clinicez://',
    typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
    typeof window !== 'undefined' ? window.location.origin : '',
    '/',
  ],
};

export const Navigation = createStaticNavigation(Tab);
