import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import VisitsScreen from './screens/Visits.screen';
import ShiftScreen from './screens/Shift.screen';
import ReportsScreen from './screens/Reports.screen';
import SettingsScreen from './screens/Settings.screen';
import { usePermission } from '../components/AuthGate';
import { PERMISSIONS } from '../constants/permissions';

const useCanTakePayments = () => usePermission(PERMISSIONS.paymentsTake);
const useCanManageShifts = () => usePermission(PERMISSIONS.shiftsManage);
const useCanReadReports = () => usePermission(PERMISSIONS.reportsRead);

const Tab = createBottomTabNavigator({
  screens: {
    Visits: {
      screen: VisitsScreen,
      if: useCanTakePayments,
      options: {
        title: 'Bills',
        headerTitle: 'Visit Bills',
      },
    },
    Shift: {
      screen: ShiftScreen,
      if: useCanManageShifts,
      options: {
        title: 'Shift',
        headerTitle: 'Cashier Shift',
      },
    },
    Reports: {
      screen: ReportsScreen,
      if: useCanReadReports,
      options: {
        title: 'Reports',
        headerTitle: 'Daily Collection',
      },
    },
    Settings: {
      screen: SettingsScreen,
      options: {
        title: 'Account',
        headerTitle: 'Account',
      },
    },
  },
});

export type RootTabParamList = StaticParamList<typeof Tab>;

type TabNavigator = typeof Tab;

declare module '@react-navigation/core' {
  interface RootNavigator extends TabNavigator {}
}

export const Navigation = createStaticNavigation(Tab);
