import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import WorklistScreen from './screens/Worklist.screen';
import SpecimenScreen from './screens/Specimen.screen';
import ResultsScreen from './screens/Results.screen';
import SettingsScreen from './screens/Settings.screen';

const Tab = createBottomTabNavigator({
  screens: {
    Worklist: {
      screen: WorklistScreen,
      options: {
        title: 'Worklist',
        headerTitle: 'Diagnostic Orders',
      },
    },
    Specimen: {
      screen: SpecimenScreen,
      options: {
        title: 'Specimen',
        headerTitle: 'Sample Tracking',
      },
    },
    Results: {
      screen: ResultsScreen,
      options: {
        title: 'Results',
        headerTitle: 'Result Validation',
      },
    },
    Settings: {
      screen: SettingsScreen,
      options: {
        title: 'Settings',
        headerTitle: 'LIS Settings',
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
