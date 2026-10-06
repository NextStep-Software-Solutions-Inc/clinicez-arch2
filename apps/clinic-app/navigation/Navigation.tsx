import React from 'react';
import { ColorValue } from 'react-native';
import { BottomTabBar, createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, DefaultTheme, type StaticParamList } from '@react-navigation/native';
import Icon, { IconName } from '../components/ui/Icon';
import { applyFontFamily } from '../constants/fonts';
import { theme } from '../constants/theme';
import { useBreakpoint } from '../utils/useBreakpoint';
import DashboardScreen from './screens/Dashboard.screen';
import PatientsScreen from './screens/Patients.screen';
import ConsultationsScreen from './screens/Consultations.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import BillingScreen from './screens/Billing.screen';
import YakapScreen from './screens/Yakap.screen';
import SettingsScreen from './screens/Settings.screen';

/**
 * Bottom tab bar for phones only. Workstation widths use the sidebar instead.
 * Implemented as a custom `tabBar` so it reacts to window resizes (a `screenOptions`
 * callback only runs on navigation and cannot subscribe to dimensions).
 */
function ResponsiveTabBar(props: BottomTabBarProps) {
  const { isWorkstation } = useBreakpoint();
  if (isWorkstation) return null;
  return <BottomTabBar {...props} />;
}

const tabIcon = (name: IconName) => ({ color }: { focused: boolean; color: ColorValue; size: number }) => (
  <Icon name={name} size={theme.sizes.iconMd} color={typeof color === 'string' ? color : theme.colors.textMuted} />
);

const Tab = createBottomTabNavigator({
  tabBar: (props: BottomTabBarProps) => <ResponsiveTabBar {...props} />,
  screenOptions: {
    headerShown: false,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarStyle: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
    },
    tabBarLabelStyle: applyFontFamily({
      fontSize: theme.fontSizes.xs,
      fontWeight: '600',
    }),
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
        tabBarIcon: tabIcon('dashboard'),
      },
    },
    Patients: {
      screen: PatientsScreen,
      linking: 'patients',
      options: {
        title: 'Patients',
        tabBarIcon: tabIcon('patients'),
      },
    },
    Consultations: {
      screen: ConsultationsScreen,
      linking: 'consultations',
      options: {
        title: 'Consultations',
        tabBarIcon: tabIcon('consultations'),
      },
    },
    Appointments: {
      screen: AppointmentsScreen,
      linking: 'appointments',
      options: {
        title: 'Appointments',
        tabBarIcon: tabIcon('appointments'),
      },
    },
    Billing: {
      screen: BillingScreen,
      linking: 'billing',
      options: {
        title: 'Billing',
        tabBarIcon: tabIcon('billing'),
      },
    },
    Yakap: {
      screen: YakapScreen,
      linking: 'yakap',
      options: {
        title: 'PhilHealth Yakap',
        tabBarIcon: tabIcon('yakap'),
      },
    },
    Settings: {
      screen: SettingsScreen,
      linking: 'settings',
      options: {
        title: 'Settings',
        tabBarIcon: tabIcon('settings'),
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

/** Navigation container theme so React Navigation chrome matches the ClinicEz tokens. */
export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

export const Navigation = createStaticNavigation(Tab);
