import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import PrescriptionsScreen from './screens/Prescriptions.screen';
import DispenseScreen from './screens/Dispense.screen';
import InventoryScreen from './screens/Inventory.screen';
import SettingsScreen from './screens/Settings.screen';

const Tab = createBottomTabNavigator({
  screens: {
    Prescriptions: {
      screen: PrescriptionsScreen,
      options: {
        title: 'Prescriptions',
        headerTitle: 'E-Prescription Queue',
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

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}

export const Navigation = createStaticNavigation(Tab);
