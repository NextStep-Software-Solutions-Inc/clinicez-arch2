import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import AppointmentsScreen from '../screens/Appointments.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const AppointmentsStack = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    Appointments: createNativeStackScreen({
      screen: AppointmentsScreen,
      options: {
        headerShown: false,
      },
    }),
  },
});

export default AppointmentsStack;
