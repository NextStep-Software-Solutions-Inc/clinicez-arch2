import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import AppointmentsScreen from '../screens/Appointments.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const AppointmentsStack = createNativeStackNavigator({
  screenOptions: {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    Appointments: createNativeStackScreen({
      screen: AppointmentsScreen,
      options: {
        title: 'Appointments',
        headerRight: () => <BottomTabsHeaderRight />,
      },
    }),
  },
});

export default AppointmentsStack;
