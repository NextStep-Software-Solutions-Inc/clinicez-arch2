import React from 'react';
import { ColorValue } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, DefaultTheme, type StaticParamList } from '@react-navigation/native';
import Icon, { IconName } from '../components/ui/Icon';
import { applyFontFamily } from '../constants/fonts';
import { theme } from '../constants/theme';
import { useBreakpoint } from '../utils/useBreakpoint';
import MobileBottomTabBar from '../components/layout/MobileBottomTabBar';
import DashboardScreen from './screens/Dashboard.screen';
import PatientsScreen from './screens/Patients.screen';
import ConsultationsScreen from './screens/Consultations.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import BillingScreen from './screens/Billing.screen';
import YakapScreen from './screens/Yakap.screen';
import SettingsScreen from './screens/Settings.screen';
import ProfileScreen from './screens/Profile.screen';
import ResultReviewScreen from './screens/ResultReview.screen';
import ShareImportScreen from './screens/ShareImport.screen';

/**
 * Bottom tab bar for phones only. Workstation widths use the sidebar instead.
 * Implemented as a custom `tabBar` so it reacts to window resizes (a `screenOptions`
 * callback only runs on navigation and cannot subscribe to dimensions).
 */
function ResponsiveTabBar(props: BottomTabBarProps) {
  const { isWorkstation } = useBreakpoint();
  if (isWorkstation) return null;
  return <MobileBottomTabBar {...props} />;
}

const tabIcon = (name: IconName) => ({ color }: { focused: boolean; color: ColorValue; size: number }) => (
  <Icon name={name} size={theme.sizes.iconMd} color={typeof color === 'string' ? color : theme.colors.textMuted} />
);

const Tab = createBottomTabNavigator({
  implementation: 'custom',
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
        tabBarLabel: 'Consults',
        tabBarIcon: tabIcon('consultations'),
      },
    },
    Appointments: {
      screen: AppointmentsScreen,
      linking: 'appointments',
      options: {
        title: 'Appointments',
        tabBarLabel: 'Appts',
        tabBarIcon: tabIcon('appointments'),
      },
    },
    Billing: {
      screen: BillingScreen,
      linking: 'billing',
      options: {
        title: 'Billing',
        tabBarLabel: 'Billing',
        tabBarIcon: tabIcon('billing'),
      },
    },
    ResultReview: {
      screen: ResultReviewScreen,
      linking: 'result-review',
      options: {
        title: 'Result review',
        tabBarLabel: 'Results',
        tabBarIcon: tabIcon('lab'),
      },
    },
    ShareImport: {
      screen: ShareImportScreen,
      linking: 'scan-patient',
      options: {
        title: 'Scan patient QR',
        tabBarLabel: 'Scan QR',
        tabBarIcon: tabIcon('scan'),
      },
    },
    Yakap: {
      screen: YakapScreen,
      linking: 'yakap',
      options: {
        title: 'PhilHealth Yakap',
        tabBarLabel: 'PhilHealth',
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
    Profile: {
      screen: ProfileScreen,
      linking: 'profile',
      options: {
        title: 'My Profile',
        tabBarIcon: tabIcon('staff'),
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
    ...(typeof window !== 'undefined' && window.location?.origin
      ? [`${window.location.origin}/`, window.location.origin]
      : []),
    '/',
  ],
};

/** Navigation container theme so React Navigation chrome matches the Clinic EZ tokens. */
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
