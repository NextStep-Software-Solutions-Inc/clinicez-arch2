import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import DashboardScreen from './screens/Dashboard.screen';
import ConsultationsScreen from './screens/Consultations.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import BillingScreen from './screens/Billing.screen';
import SettingsScreen from './screens/Settings.screen';

const Tab = createBottomTabNavigator({
  screens: {
    Dashboard: {
      screen: DashboardScreen,
      options: {
        title: 'Dashboard',
        headerTitle: 'Clinic Dashboard',
      },
    },
    Consultations: {
      screen: ConsultationsScreen,
      options: {
        title: 'Consultations',
        headerTitle: 'Clinical Encounter',
      },
    },
    Appointments: {
      screen: AppointmentsScreen,
      options: {
        title: 'Appointments',
        headerTitle: 'Clinic Schedule',
      },
    },
    Billing: {
      screen: BillingScreen,
      options: {
        title: 'Billing',
        headerTitle: 'Cashier & POS',
      },
    },
    Settings: {
      screen: SettingsScreen,
      options: {
        title: 'Settings',
        headerTitle: 'Facility Settings',
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

export const Navigation = createStaticNavigation(Tab);
