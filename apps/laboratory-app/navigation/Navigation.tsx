import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation, type StaticParamList } from '@react-navigation/native';
import WorklistScreen from './screens/Worklist.screen';
import WalkInIntakeScreen from './screens/WalkInIntake.screen';
import SpecimenScreen from './screens/Specimen.screen';
import ClaimSlipScreen from './screens/ClaimSlip.screen';
import ResultsScreen from './screens/Results.screen';
import QualityControlScreen from './screens/QualityControl.screen';
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
    WalkInIntake: {
      screen: WalkInIntakeScreen,
      options: {
        title: 'Walk-In Intake',
        headerTitle: 'Walk-In Patient Intake & Accession',
      },
    },
    Specimen: {
      screen: SpecimenScreen,
      options: {
        title: 'Specimen',
        headerTitle: 'Sample Tracking',
      },
    },
    ClaimSlip: {
      screen: ClaimSlipScreen,
      options: {
        title: 'Claim Slip',
        headerTitle: 'Scan Slip to Claim',
      },
    },
    Results: {
      screen: ResultsScreen,
      options: {
        title: 'Results',
        headerTitle: 'Result Validation',
      },
    },
    QualityControl: {
      screen: QualityControlScreen,
      options: {
        title: 'QC & Westgard',
        headerTitle: 'Quality Control & Westgard Rules',
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
