import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import AppointmentsScreen from '../screens/Appointments.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const AppointmentsStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    Appointments: createNativeStackScreen({
      screen: AppointmentsScreen,
      options: {
        title: 'My Appointments',
        headerLargeTitleEnabled: true,
        headerRight: () => <BottomTabsHeaderRight />,
      },
    }),
  },
});

export default AppointmentsStack;
