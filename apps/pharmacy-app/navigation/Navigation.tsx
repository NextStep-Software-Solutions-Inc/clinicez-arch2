import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import PrescriptionsScreen from './screens/Prescriptions.screen';
import ClaimPrescriptionScreen from './screens/ClaimPrescription.screen';
import DispenseScreen from './screens/Dispense.screen';
import InventoryScreen from './screens/Inventory.screen';
import SettingsScreen from './screens/Settings.screen';
import { usePermission } from '../components/AuthGate';
import { PERMISSIONS } from '../constants/permissions';

const useCanClaimPrescriptions = () => usePermission(PERMISSIONS.prescriptionsClaim);

const Tab = createBottomTabNavigator({
  screens: {
    Prescriptions: {
      screen: PrescriptionsScreen,
      options: {
        title: 'Prescriptions',
        headerTitle: 'E-Prescription Queue',
      },
    },
    ClaimPrescription: {
      screen: ClaimPrescriptionScreen,
      if: useCanClaimPrescriptions,
      options: {
        title: 'Scan Rx',
        headerTitle: 'Scan Prescription to Claim',
      },
    },
    Dispense: {
      screen: DispenseScreen,
      options: {
        title: 'Dispense',
        headerTitle: 'Dispense Order',
      },
    },
    Inventory: {
      screen: InventoryScreen,
      options: {
        title: 'Inventory',
        headerTitle: 'Drug Inventory',
      },
    },
    Settings: {
      screen: SettingsScreen,
      options: {
        title: 'Settings',
        headerTitle: 'Pharmacy Settings',
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
